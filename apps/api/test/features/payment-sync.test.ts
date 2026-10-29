import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { PaymentSource } from '../../src/db/enums.js';
import type { PaymentRecorder } from '../../src/features/payments/payment-recorder.js';
import { createPaymentStatusSync } from '../../src/features/payments/payment-sync.js';
import { QuerydrStatus, type QuerydrClient } from '../../src/features/payments/vnpay-querydr.js';

const ORDER = { orderId: '261029ABCDEFGH12', vnpCreateDate: '20261029150000' };

const finalResult: QuerydrClient = () =>
  Promise.resolve({
    status: QuerydrStatus.FINAL,
    payment: {
      source: PaymentSource.QUERYDR,
      orderId: ORDER.orderId,
      gatewayTxnNo: '14000001',
      responseCode: '00',
      transactionStatus: '00',
      vnpAmount: 110_000_000,
      bankCode: 'NCB',
      payDate: null,
    },
  });

const fakeLog = () => {
  const log = { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() };
  return { log, logger: log as unknown as FastifyBaseLogger };
};

describe('createPaymentStatusSync', () => {
  it('should log an error with the order id and not throw when recording fails', async () => {
    // Arrange
    const failure = new Error('connection terminated');
    const recorder = { record: () => Promise.reject(failure) } as unknown as PaymentRecorder;
    const { log, logger } = fakeLog();

    // Act
    const settled = await createPaymentStatusSync(recorder, finalResult)(ORDER, logger);

    // Assert
    expect(settled).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'querydr.failed', entityId: ORDER.orderId, err: failure }),
      expect.any(String),
    );
  });
});
