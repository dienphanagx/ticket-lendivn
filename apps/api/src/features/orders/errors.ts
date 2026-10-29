export const ORDER_ERRORS = {
  NOT_FOUND: { code: 'ORDER_NOT_FOUND', message: 'Order not found', httpStatus: 404 },
  IDEMPOTENCY_KEY_REUSED: {
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key was already used with a different request',
    httpStatus: 409,
  },
} as const;
