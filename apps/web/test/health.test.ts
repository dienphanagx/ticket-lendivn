import { describe, expect, it } from 'vitest';

import { GET } from '@/app/health/route';

describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});
