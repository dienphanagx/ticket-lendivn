// Đối chứng: không có `@/lib/zod-config` thì Zod gọi `new Function` → spy phát hiện được
import { afterEach, expect, it, vi } from 'vitest';

import { spyFunctionConstructor } from '../support/function-spy';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('should call new Function when nothing enables jitless', async () => {
  const constructs = spyFunctionConstructor();
  const z = await import('zod');

  z.object({ id: z.string() }).parse({ id: 'x' });

  expect(constructs).toHaveBeenCalled();
});
