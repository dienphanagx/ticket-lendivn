import { performance } from 'node:perf_hooks';

import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';

import type { Database } from '../../db/client.js';
import { expireOrders } from './service.js';

/** Mỗi phút (60 giây) ở giây 0; độ trễ không ảnh hưởng tồn kho vì số vé còn lại đã loại đơn quá hạn. */
const EXPIRY_SCHEDULE = '0 * * * * *';
const JOB_NAME = 'order-expiry';

export interface OrderExpiryJob {
  /** Ngừng lịch và chờ lượt đang chạy xong, để caller đóng pool an toàn. */
  stop(): Promise<void>;
}

/** Job hết hạn đơn trong process api (specs/architecture.md § Cross-cutting Concerns). */
export function startOrderExpiryJob(db: Database, log: FastifyBaseLogger): OrderExpiryJob {
  let inFlight: Promise<void> = Promise.resolve();

  const runOnce = async (): Promise<void> => {
    const startedAt = performance.now();
    try {
      const count = await expireOrders(db);
      log.info(
        { event: 'orders.expired', jobId: JOB_NAME, count, latency: performance.now() - startedAt },
        'overdue orders expired',
      );
    } catch (err) {
      // Lượt lỗi không dừng lịch: lần chạy sau xử lý lại các đơn còn quá hạn
      log.error({ err, context: JOB_NAME }, 'order expiry job failed');
    }
  };

  // `protect`: bỏ lượt mới khi lượt trước chưa xong
  const job = new Cron(EXPIRY_SCHEDULE, { name: JOB_NAME, protect: true }, () => {
    inFlight = runOnce();
    return inFlight;
  });

  return {
    async stop() {
      job.stop();
      await inFlight;
    },
  };
}
