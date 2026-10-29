export const LEDGER_ERRORS = {
  /** Code sai: giao dịch < 2 dòng, dòng ≤ 0, hoặc Σ nợ ≠ Σ có (spec api § E Ghi Bút Toán). */
  UNBALANCED: {
    code: 'LEDGER_UNBALANCED',
    message: 'Ledger transaction is unbalanced',
    httpStatus: 500,
  },
} as const;
