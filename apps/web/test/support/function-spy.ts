import { vi } from 'vitest';

/**
 * Đếm lần gọi `new Function(...)` — bước dò / biên dịch JIT của Zod mà CSP không 'unsafe-eval' báo vi phạm.
 * Zod giữ globalConfig + cache `allowsEval` theo process, nên mỗi kịch bản nằm ở 1 file test riêng
 * (Vitest cô lập module theo file).
 */
export function spyFunctionConstructor() {
  const constructs = vi.fn();
  const RealFunction = Function;
  vi.stubGlobal(
    'Function',
    new Proxy(RealFunction, {
      construct(target, args: unknown[]) {
        constructs();
        return Reflect.construct(target, args) as object;
      },
    }),
  );
  return constructs;
}
