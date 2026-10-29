import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import * as z from 'zod';

import type { Database } from '../../db/client.js';
import { LedgerAccountType, LedgerSide, LedgerTxnType } from '../../db/enums.js';
import { entityIdSchema } from '../../lib/ids.js';
import { pageMetaSchema, paginationQuerySchema } from '../../lib/pagination.js';
import { requiredUserHeaders, USER_ID_HEADER } from '../users/current-user.js';
import type { LedgerAccountRow } from './read-repository.js';
import {
  BalanceType,
  getLedgerAccount,
  getLedgerOverview,
  getUserBalance,
} from './read-service.js';

const accountTypeSchema = z.enum(Object.values(LedgerAccountType));
const txnTypeSchema = z.enum(Object.values(LedgerTxnType));
const sideSchema = z.enum(Object.values(LedgerSide));

const ledgerAccountSchema = z.object({
  id: z.string(),
  type: accountTypeSchema,
  /** Chủ sở hữu: người dùng và / hoặc sự kiện; cả 2 `null` = tài khoản của sàn. */
  user: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  event: z.object({ id: z.string(), name: z.string() }).nullable(),
  totalDebit: z.int(),
  totalCredit: z.int(),
  balance: z.int(),
});

/** Tham chiếu chung của 1 dòng / giao dịch: đơn (giao dịch thanh toán) và sự kiện. */
const txnRefShape = {
  transactionId: z.string(),
  transactionType: txnTypeSchema,
  description: z.string(),
  orderId: z.string().nullable(),
  eventId: z.string(),
};

const balanceResponse = z.object({
  data: z.object({
    pendingBalance: z.int(),
    availableBalance: z.int(),
    availableBreakdown: z.object({ sales: z.int(), refunds: z.int() }),
    entries: z.array(
      z.object({
        id: z.string(),
        createdAt: z.iso.datetime(),
        ...txnRefShape,
        accountId: z.string(),
        accountType: accountTypeSchema,
        /** + tăng số dư, − giảm số dư. */
        amount: z.int(),
        balanceType: z.enum(Object.values(BalanceType)),
      }),
    ),
  }),
  meta: pageMetaSchema,
});

const ledgerResponse = z.object({
  data: z.object({
    accounts: z.array(ledgerAccountSchema),
    totals: z.object({ debit: z.int(), credit: z.int() }),
    transactions: z.array(
      z.object({
        id: z.string(),
        type: txnTypeSchema,
        description: z.string(),
        orderId: z.string().nullable(),
        event: z.object({ id: z.string(), name: z.string() }),
        createdAt: z.iso.datetime(),
        entries: z.array(
          z.object({
            id: z.string(),
            accountId: z.string(),
            accountType: accountTypeSchema,
            direction: sideSchema,
            amount: z.int(),
          }),
        ),
      }),
    ),
  }),
  meta: pageMetaSchema,
});

const accountResponse = z.object({
  data: z.object({
    account: ledgerAccountSchema,
    entries: z.array(
      z.object({
        id: z.string(),
        createdAt: z.iso.datetime(),
        ...txnRefShape,
        direction: sideSchema,
        amount: z.int(),
      }),
    ),
  }),
  meta: pageMetaSchema,
});

function toAccountDto(account: LedgerAccountRow) {
  const { ownerUserId, ownerName, eventId, eventName, ...totals } = account;
  return {
    ...totals,
    user:
      ownerUserId === null || ownerName === null
        ? null
        : { id: ownerUserId, displayName: ownerName },
    event: eventId === null || eventName === null ? null : { id: eventId, name: eventName },
  };
}

const toIso = <T extends { createdAt: Date }>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

/** Số dư người dùng, sổ cái toàn sàn, bút toán theo tài khoản (spec api § E Sổ Cái). */
export const ledgerRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/v1/me/balance',
    {
      schema: {
        headers: requiredUserHeaders,
        querystring: paginationQuerySchema,
        response: { 200: balanceResponse },
      },
    },
    async (request) => {
      const { entries, meta, ...balances } = await getUserBalance(
        db,
        request.headers[USER_ID_HEADER],
        request.query,
      );
      return { data: { ...balances, entries: entries.map(toIso) }, meta };
    },
  );

  app.get(
    '/v1/ledger',
    {
      schema: {
        querystring: paginationQuerySchema.extend({
          type: txnTypeSchema.optional(),
          eventId: entityIdSchema.optional(),
        }),
        response: { 200: ledgerResponse },
      },
    },
    async (request) => {
      const { accounts, totals, transactions, meta } = await getLedgerOverview(db, request.query);
      return {
        data: {
          accounts: accounts.map(toAccountDto),
          totals,
          // Serializer Zod bỏ field ngoài schema (`transactionId` của dòng)
          transactions: transactions.map(({ eventId, eventName, ...txn }) => ({
            ...toIso(txn),
            event: { id: eventId, name: eventName },
          })),
        },
        meta,
      };
    },
  );

  app.get(
    '/v1/ledger/accounts/:accountId',
    {
      schema: {
        params: z.object({ accountId: entityIdSchema }),
        querystring: paginationQuerySchema,
        response: { 200: accountResponse },
      },
    },
    async (request) => {
      const { account, entries, meta } = await getLedgerAccount(
        db,
        request.params.accountId,
        request.query,
      );
      return { data: { account: toAccountDto(account), entries: entries.map(toIso) }, meta };
    },
  );
  done();
};
