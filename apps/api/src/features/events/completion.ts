import type { FastifyBaseLogger } from 'fastify';

import type { Database } from '../../db/client.js';
import { EventStatus, LedgerAccountType } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { isUuid } from '../../lib/ids.js';
import { eventReleasePosting } from '../ledger/postings.js';
import { listEventEscrowBalances } from '../ledger/read-repository.js';
import { postLedgerTransaction } from '../ledger/service.js';
import { expirePendingOrdersOfEvent } from '../orders/repository.js';
import { EVENT_ERRORS } from './errors.js';
import { lockEventForUpdate, markEventCompleted } from './repository.js';

// Đánh dấu sự kiện kết thúc và giải phóng ký quỹ (spec api § F; specs/architecture.md § Các Quyết
// Định Kỹ Thuật → Đánh dấu sự kiện kết thúc giải phóng ký quỹ).

export interface SellerRelease {
  sellerId: string;
  displayName: string;
  amount: number;
}

export interface EventCompletion {
  eventId: string;
  completedAt: Date;
  expiredOrderCount: number;
  sellers: SellerRelease[];
  platformFeeAmount: number;
  /** `null` khi ký quỹ = 0 (không tạo giao dịch sổ cái). */
  ledgerTransactionId: string | null;
}

interface EscrowSnapshot {
  sellers: SellerRelease[];
  feeAmount: number;
}

/** Số dư ký quỹ thực tế trên sổ cái tại thời điểm giữ khoá sự kiện, không cộng lại từ đơn. */
async function readEscrow(trx: Database, eventId: string): Promise<EscrowSnapshot> {
  const rows = await listEventEscrowBalances(trx, eventId);
  const sellers: SellerRelease[] = [];
  let feeAmount = 0;
  for (const row of rows) {
    if (row.type === LedgerAccountType.ESCROW_FEE) {
      feeAmount = row.balance;
    } else if (row.ownerUserId !== null) {
      sellers.push({
        sellerId: row.ownerUserId,
        displayName: row.ownerName ?? '',
        amount: row.balance,
      });
    }
  }
  return { sellers, feeAmount };
}

/**
 * 1 transaction READ COMMITTED: khoá `events` FOR UPDATE (chờ mọi tạo đơn / ghi nhận đang giữ FOR
 * SHARE commit và chặn luồng mới) → `COMPLETED` → đơn `PENDING_PAYMENT` của sự kiện → `EXPIRED` → đọc
 * số dư ký quỹ từ view sổ cái → 1 giao dịch `EVENT_RELEASE` nhiều dòng (không có ký quỹ thì không
 * ghi). Ghi nhận thanh toán chạy sau thấy `COMPLETED` + đơn `EXPIRED` → nhánh `REFUND_REQUIRED`.
 */
export async function completeEvent(
  db: Database,
  eventId: string,
  log: FastifyBaseLogger,
): Promise<EventCompletion> {
  if (!isUuid(eventId)) {
    throw new AppError(EVENT_ERRORS.NOT_FOUND);
  }
  const completion = await db
    .transaction()
    .setIsolationLevel('read committed')
    .execute(async (trx): Promise<EventCompletion> => {
      const event = await lockEventForUpdate(trx, eventId);
      if (event === undefined) {
        throw new AppError(EVENT_ERRORS.NOT_FOUND);
      }
      if (event.status === EventStatus.COMPLETED) {
        throw new AppError(EVENT_ERRORS.ALREADY_COMPLETED, {
          completedAt: event.completedAt?.toISOString() ?? '',
        });
      }
      const completedAt = await markEventCompleted(trx, event.id);
      const expiredOrderCount = await expirePendingOrdersOfEvent(trx, event.id);
      const escrow = await readEscrow(trx, event.id);
      const posting = eventReleasePosting({
        eventId: event.id,
        eventName: event.name,
        sellers: escrow.sellers,
        feeAmount: escrow.feeAmount,
      });
      let ledgerTransactionId: string | null = null;
      if (posting !== undefined) {
        const ledger = await postLedgerTransaction(trx, posting, log);
        if (!ledger.created) {
          // Sự kiện vừa ON_SALE dưới khoá mà đã có `EVENT_RELEASE:<id>`: dữ liệu sai → rollback
          throw new Error(`Event ${event.id} already has an EVENT_RELEASE transaction`);
        }
        ledgerTransactionId = ledger.id;
      }
      return {
        eventId: event.id,
        completedAt,
        expiredOrderCount,
        sellers: escrow.sellers,
        platformFeeAmount: escrow.feeAmount,
        ledgerTransactionId,
      };
    });

  log.info(
    {
      event: 'event.completed',
      entityId: completion.eventId,
      metadata: {
        expiredOrderCount: completion.expiredOrderCount,
        sellerCount: completion.sellers.length,
        platformFeeAmount: completion.platformFeeAmount,
        ledgerTransactionId: completion.ledgerTransactionId,
      },
    },
    'event completed',
  );
  return completion;
}
