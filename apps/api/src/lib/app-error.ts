/** `details` của lỗi: map field → câu tiếng Anh (validation) hoặc shape mã khai rõ trong spec. */
export type ErrorDetails = Readonly<Record<string, string | number>>;

export interface ErrorDefinition {
  code: string;
  message: string;
  httpStatus: number;
}

/** Lỗi nghiệp vụ / hạ tầng có mã; global error handler map sang `{ code, message, details? }`. */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: ErrorDetails;

  constructor(definition: ErrorDefinition, details?: ErrorDetails, options?: ErrorOptions) {
    super(definition.message, options);
    this.name = 'AppError';
    this.code = definition.code;
    this.httpStatus = definition.httpStatus;
    this.details = details;
  }
}

/** Mã cross-cutting (rule `policy-api` § Code naming). */
export const COMMON_ERRORS = {
  VALIDATION_FAILED: { code: 'VALIDATION_FAILED', message: 'Validation failed', httpStatus: 400 },
  ROUTE_NOT_FOUND: { code: 'ROUTE_NOT_FOUND', message: 'Route not found', httpStatus: 404 },
  PAYLOAD_TOO_LARGE: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', httpStatus: 413 },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', message: 'Internal server error', httpStatus: 500 },
} as const satisfies Record<string, ErrorDefinition>;

export const validationFailed = (details: ErrorDetails): AppError =>
  new AppError(COMMON_ERRORS.VALIDATION_FAILED, details);
