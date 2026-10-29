import { describe, expect, it } from 'vitest';

import { formatDateTime, formatVnd } from '@/lib/format';

describe('formatVnd', () => {
  it.each([
    [1_250_000, '1.250.000 ₫'],
    [0, '0 ₫'],
    [999, '999 ₫'],
    [1000, '1.000 ₫'],
    [123_456_789, '123.456.789 ₫'],
  ])('should format %d as %s', (amount, expected) => {
    expect(formatVnd(amount)).toBe(expected);
  });

  it('should prefix negative amounts with the minus sign U+2212', () => {
    expect(formatVnd(-5000)).toBe('−5.000 ₫');
  });

  it('should reject non-integer amounts', () => {
    expect(() => formatVnd(1.5)).toThrow(RangeError);
  });
});

describe('formatDateTime', () => {
  it('should format in Asia/Ho_Chi_Minh as dd/MM/yyyy HH:mm', () => {
    // 12:30 UTC = 19:30 GMT+7
    expect(formatDateTime('2026-11-20T12:30:00.000Z')).toBe('20/11/2026 19:30');
  });

  it('should roll over to the next day in GMT+7', () => {
    expect(formatDateTime('2026-12-31T17:05:00.000Z')).toBe('01/01/2027 00:05');
  });

  it('should use 24-hour clock with leading zeros', () => {
    expect(formatDateTime('2026-03-04T01:02:00.000Z')).toBe('04/03/2026 08:02');
  });

  it('should reject an invalid date', () => {
    expect(() => formatDateTime('not-a-date')).toThrow(RangeError);
  });
});
