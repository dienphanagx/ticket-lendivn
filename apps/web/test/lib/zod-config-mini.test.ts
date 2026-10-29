// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { spyFunctionConstructor } from '../support/function-spy';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('should parse browser schemas from @/lib/zod-mini without new Function and keep en messages', async () => {
  const constructs = spyFunctionConstructor();
  const z = await import('@/lib/zod-mini');
  const schema = z.object({ id: z.string(), qty: z.int() });

  const ok = z.parse(schema, { id: 'x', qty: 1 });
  const bad = z.safeParse(schema, { id: 1, qty: 1 });

  expect(ok).toEqual({ id: 'x', qty: 1 });
  expect(bad.error?.issues[0]?.message).toMatch(/expected string/i);
  expect(z.config().jitless).toBe(true);
  expect(constructs).not.toHaveBeenCalled();
});
