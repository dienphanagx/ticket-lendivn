import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

import { AppError, COMMON_ERRORS, type ErrorDefinition, type ErrorDetails } from './app-error.js';

const HEADERS_CONTEXT = 'headers';
const BODY_FIELD = 'body';
const INVALID_BODY_MESSAGE = 'Request body is invalid';
const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

interface ValidationIssue {
  instancePath: string;
  message?: string;
}

/** `x-user-id` → `X-User-Id`: tên header trong `details` theo dạng spec khai. */
const toHeaderName = (name: string): string =>
  name.replace(/(^|-)([a-z])/g, (_match, dash: string, char: string) => dash + char.toUpperCase());

/** Mỗi field giữ lỗi đầu tiên theo thứ tự kiểm (rule `policy-api` § Response format). */
function toValidationDetails(issues: readonly ValidationIssue[], context?: string): ErrorDetails {
  const details: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.instancePath.replace(/^\//, '').replaceAll('/', '.');
    const field = path === '' ? (context ?? BODY_FIELD) : path;
    const key = context === HEADERS_CONTEXT ? toHeaderName(field) : field;
    details[key] ??= issue.message ?? COMMON_ERRORS.VALIDATION_FAILED.message;
  }
  return details;
}

function send(
  reply: FastifyReply,
  { code, message, httpStatus }: ErrorDefinition,
  details?: ErrorDetails,
): FastifyReply {
  return reply
    .status(httpStatus)
    .send(details === undefined ? { code, message } : { code, message, details });
}

/** Global handler: map lỗi → `{ code, message, details? }`; log 5xx, không log 4xx (rule `policy-api` § Phân tầng). */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      if (error.httpStatus >= SERVER_ERROR_MIN) {
        request.log.error({ err: error }, 'request failed');
      }
      return send(reply, error, error.details);
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = toValidationDetails(error.validation, error.validationContext);
      return send(reply, COMMON_ERRORS.VALIDATION_FAILED, details);
    }
    // Lỗi parse body của Fastify (JSON hỏng, sai content-type, quá cỡ) mang statusCode 4xx
    const status = error.statusCode ?? SERVER_ERROR_MIN;
    if (status === COMMON_ERRORS.PAYLOAD_TOO_LARGE.httpStatus) {
      return send(reply, COMMON_ERRORS.PAYLOAD_TOO_LARGE);
    }
    if (status >= CLIENT_ERROR_MIN && status < SERVER_ERROR_MIN) {
      return send(reply, COMMON_ERRORS.VALIDATION_FAILED, { [BODY_FIELD]: INVALID_BODY_MESSAGE });
    }
    request.log.error({ err: error }, 'request failed');
    return send(reply, COMMON_ERRORS.INTERNAL_ERROR);
  });

  app.setNotFoundHandler((_request, reply) => send(reply, COMMON_ERRORS.ROUTE_NOT_FOUND));
}
