export const LEDGER_ERRORS = {
  /** Code sai: giao dịch < 2 dòng, dòng ≤ 0, hoặc Σ nợ ≠ Σ có (spec api § E Ghi Bút Toán). */
  UNBALANCED: {
    code: 'LEDGER_UNBALANCED',
    message: 'Ledger transaction is unbalanced',
    httpStatus: 500,
  },
  ACCOUNT_NOT_FOUND: {
    code: 'LEDGER_ACCOUNT_NOT_FOUND',
    message: 'Ledger account not found',
    httpStatus: 404,
  },
} as const;
