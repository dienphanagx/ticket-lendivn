// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { spyFunctionConstructor } from '../support/function-spy';

afterEach(() => {
  vi.unstubAllGlobals();
});

// events/types (zod classic) bị ticket-picker kéo vào bundle trình duyệt qua EVENT_STATUS / sort.ts
it('should parse classic-zod schemas reaching the browser without new Function', async () => {
  const constructs = spyFunctionConstructor();
  const { eventListResponseSchema } = await import('@/features/events/types');

  expect(eventListResponseSchema.parse({ data: [] })).toEqual({ data: [] });
  expect(constructs).not.toHaveBeenCalled();
});
