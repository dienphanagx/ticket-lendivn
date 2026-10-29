import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERROR_MESSAGES, getErrorMessage, getUnknownErrorMessage } from '@/lib/error-message';
import { AppError } from '@/lib/errors';

describe('getErrorMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['NETWORK_ERROR', 'Mất kết nối, vui lòng kiểm tra mạng'],
    ['TIMEOUT', 'Có lỗi xảy ra, vui lòng thử lại sau'],
    ['INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại sau'],
    ['BFF_UPSTREAM_TIMEOUT', 'Có lỗi xảy ra, vui lòng thử lại sau'],
    ['USER_NOT_FOUND', 'Tài khoản đã chọn không còn tồn tại, vui lòng chọn lại'],
    ['USER_NOT_SELECTED', 'Vui lòng chọn tài khoản để tiếp tục'],
    ['EVENT_NOT_ON_SALE', 'Sự kiện đã kết thúc, ngừng bán vé'],
    ['LISTING_NOT_FOUND', 'Tin bán không còn tồn tại'],
    ['CANNOT_BUY_OWN_LISTING', 'Bạn không thể mua tin bán của chính mình'],
  ])('should map %s to the spec sentence', (code, expected) => {
    expect(getErrorMessage({ code })).toBe(expected);
  });

  it('should include remaining tickets from INSUFFICIENT_QUANTITY details', () => {
    expect(getErrorMessage({ code: 'INSUFFICIENT_QUANTITY', details: { available: 3 } })).toBe(
      'Chỉ còn 3 vé',
    );
  });

  it('should say sold out when INSUFFICIENT_QUANTITY reports 0 available', () => {
    expect(getErrorMessage({ code: 'INSUFFICIENT_QUANTITY', details: { available: 0 } })).toBe(
      'Tin bán này vừa hết vé',
    );
  });

  it('should fall back to the code sentence when details shape is wrong', () => {
    expect(getErrorMessage({ code: 'INSUFFICIENT_QUANTITY', details: { available: '3' } })).toBe(
      ERROR_MESSAGES.INSUFFICIENT_QUANTITY,
    );
  });

  it('should return the generic sentence and warn for an unknown code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(getErrorMessage({ code: 'SOMETHING_NEW', message: 'Something new' })).toBe(
      ERROR_MESSAGES.generic,
    );
    expect(warn).toHaveBeenCalledWith('Missing message for API error code', {
      code: 'SOMETHING_NEW',
      message: 'Something new',
    });
  });

  it('should never surface the English api message', () => {
    expect(getErrorMessage(new AppError('LISTING_NOT_FOUND', 'Listing not found', 404))).not.toBe(
      'Listing not found',
    );
  });
});

describe('getUnknownErrorMessage', () => {
  it('should return the generic sentence for a non-AppError value', () => {
    expect(getUnknownErrorMessage(new TypeError('boom'))).toBe(ERROR_MESSAGES.generic);
  });
});
