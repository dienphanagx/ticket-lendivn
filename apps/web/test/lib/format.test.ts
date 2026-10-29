import { describe, expect, it } from 'vitest';

import { formatDateTime, formatSignedVnd, formatVnd } from '@/lib/format';
import { pageHref } from '@/lib/pagination';

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

describe('formatSignedVnd', () => {
  it.each([
    [2_375_000, '+2.375.000 ₫'],
    [-500_000, '−500.000 ₫'],
    [0, '0 ₫'],
    [1, '+1 ₫'],
  ])('should format %i as %s', (amount, expected) => {
    expect(formatSignedVnd(amount)).toBe(expected);
  });

  it('should use the minus sign, not a hyphen', () => {
    expect(formatSignedVnd(-1)).not.toContain('-');
  });
});

describe('pageHref', () => {
  it('should keep filters and drop page 1', () => {
    expect(pageHref('/quan-tri/so-cai', 1, { type: 'EVENT_RELEASE', eventId: undefined })).toBe(
      '/quan-tri/so-cai?type=EVENT_RELEASE',
    );
    expect(pageHref('/quan-tri/so-cai', 2, { type: 'EVENT_RELEASE' })).toBe(
      '/quan-tri/so-cai?type=EVENT_RELEASE&page=2',
    );
    expect(pageHref('/tai-khoan', 3)).toBe('/tai-khoan?page=3');
    expect(pageHref('/tai-khoan', 1)).toBe('/tai-khoan');
  });
});
