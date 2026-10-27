import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Chỉ nhận ID an toàn từ client, chống log injection (rule `policy-log` § Request ID)
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** `genReqId` của Fastify: dùng `X-Request-ID` hợp lệ của client, sai hoặc thiếu → UUID mới. */
export function resolveRequestId(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}
