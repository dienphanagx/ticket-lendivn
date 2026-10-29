import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildSignData,
  signVnpayParams,
  verifyVnpaySignature,
} from '../../src/features/payments/vnpay-signature.js';

// Vector cố định: chuỗi ký viết tay theo giao thức, chữ ký tính độc lập bằng
// `printf '%s' "<chuỗi ký>" | openssl dgst -sha512 -hmac "<khoá>"` (không dùng code app).
const SECRET = 'TEST_HASH_SECRET_NOT_REAL_0123456789';
const PARAMS = {
  vnp_TxnRef: '261029ABCDEFGH12',
  vnp_Amount: '110000000',
  vnp_TmnCode: 'TESTTMN1',
  vnp_OrderInfo: 'Thanh toan don 261029ABCDEFGH12',
  vnp_ResponseCode: '00',
  vnp_TransactionStatus: '00',
  vnp_TransactionNo: '14000001',
  vnp_BankCode: 'NCB',
  vnp_PayDate: '20261029153000',
};
const SIGN_DATA =
  'vnp_Amount=110000000&vnp_BankCode=NCB&vnp_OrderInfo=Thanh+toan+don+261029ABCDEFGH12' +
  '&vnp_PayDate=20261029153000&vnp_ResponseCode=00&vnp_TmnCode=TESTTMN1' +
  '&vnp_TransactionNo=14000001&vnp_TransactionStatus=00&vnp_TxnRef=261029ABCDEFGH12';
const SIGNATURE =
  '095083bff9e76a513ffd720a4bd54c4bed143468852fa6a895c1b9347ba5bbed' +
  '7d00e1716f23d0ec314a2747f4c6577756df628b56cbf140b95ca189633fd720';

const signed = (extra: Record<string, unknown> = {}) => ({
  ...PARAMS,
  vnp_SecureHash: SIGNATURE,
  ...extra,
});

/** Đổi 1 ký tự hex cuối, giữ nguyên độ dài 128. */
const tamper = (hash: string): string => hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0');

describe('buildSignData', () => {
  it('should sort vnp_ params by name and form-encode spaces as +', () => {
    expect(buildSignData(PARAMS)).toBe(SIGN_DATA);
  });

  it('should produce the same string regardless of the incoming parameter order', () => {
    const reversed = Object.fromEntries(Object.entries(PARAMS).reverse());

    expect(buildSignData(reversed)).toBe(SIGN_DATA);
  });

  it('should exclude vnp_SecureHash, vnp_SecureHashType and params without the vnp_ prefix', () => {
    const data = buildSignData({
      ...PARAMS,
      vnp_SecureHash: SIGNATURE,
      vnp_SecureHashType: 'HmacSHA512',
      orderId: 'ignored',
      VNP_Amount: '1',
    });

    expect(data).toBe(SIGN_DATA);
  });

  it('should form-encode reserved characters in values', () => {
    const data = buildSignData({
      vnp_TxnRef: 'X',
      vnp_OrderInfo: 'a+b c&d=e/?',
      vnp_Amount: '100',
    });

    expect(data).toBe('vnp_Amount=100&vnp_OrderInfo=a%2Bb+c%26d%3De%2F%3F&vnp_TxnRef=X');
  });
});

describe('signVnpayParams', () => {
  it('should match the HMAC-SHA512 hex computed independently with openssl', () => {
    expect(signVnpayParams(PARAMS, SECRET)).toBe(SIGNATURE);
  });

  it('should match the openssl vector for values with reserved characters', () => {
    const params = { vnp_TxnRef: 'X', vnp_OrderInfo: 'a+b c&d=e/?', vnp_Amount: '100' };

    expect(signVnpayParams(params, 'k')).toBe(
      '80784932b6575d813c9a878f8645a88501ff3506e0964a4a72cd5bee4577c67a' +
        '9e7ff4b12cc6d82dc446429222c1b74536f5bba5b4bac459181215ef57015f59',
    );
  });
});

describe('verifyVnpaySignature', () => {
  it('should accept the fixed vector', () => {
    expect(verifyVnpaySignature(signed(), SECRET)).toBe(true);
  });

  it('should compare the signature case-insensitively', () => {
    expect(verifyVnpaySignature(signed({ vnp_SecureHash: SIGNATURE.toUpperCase() }), SECRET)).toBe(
      true,
    );
  });

  it('should ignore params without the vnp_ prefix and vnp_SecureHashType', () => {
    const query = signed({ orderId: 'anything', utm_source: 'x', vnp_SecureHashType: 'SHA512' });

    expect(verifyVnpaySignature(query, SECRET)).toBe(true);
  });

  it('should reject a signature with one changed character', () => {
    expect(verifyVnpaySignature(signed({ vnp_SecureHash: tamper(SIGNATURE) }), SECRET)).toBe(false);
  });

  it('should reject when a signed value was changed after signing', () => {
    expect(verifyVnpaySignature(signed({ vnp_Amount: '110000100' }), SECRET)).toBe(false);
  });

  it('should reject an extra vnp_ param that was not part of the signature', () => {
    expect(verifyVnpaySignature(signed({ vnp_Extra: '1' }), SECRET)).toBe(false);
  });

  it('should reject when signed with another secret', () => {
    expect(verifyVnpaySignature(signed(), 'ANOTHER_SECRET')).toBe(false);
  });

  it('should reject a vnp_ param that appears more than once', () => {
    const query = signed({ vnp_ResponseCode: ['00', '00'] });

    expect(verifyVnpaySignature(query, SECRET)).toBe(false);
  });

  it('should reject a repeated vnp_SecureHash', () => {
    expect(verifyVnpaySignature(signed({ vnp_SecureHash: [SIGNATURE, SIGNATURE] }), SECRET)).toBe(
      false,
    );
  });

  it('should reject when vnp_SecureHash is absent', () => {
    expect(verifyVnpaySignature({ ...PARAMS }, SECRET)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['not hex', 'z'.repeat(128)],
    ['too short', SIGNATURE.slice(0, 127)],
    ['too long', `${SIGNATURE}0`],
  ])('should reject a %s vnp_SecureHash', (_case, hash) => {
    expect(verifyVnpaySignature(signed({ vnp_SecureHash: hash }), SECRET)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
  ])('should reject every request when the secret is %s', (_case, secret) => {
    expect(verifyVnpaySignature(signed(), secret)).toBe(false);
  });

  it('should reject a query that is not an object', () => {
    expect(verifyVnpaySignature(null, SECRET)).toBe(false);
  });
});

describe('verifyVnpaySignature — empty vnp_ params', () => {
  // Chuỗi ký viết tay cho cả 2 kiểu, HMAC tính trực tiếp bằng node:crypto (không qua code app)
  const WITH_EMPTY =
    'vnp_Amount=110000000&vnp_BankCode=&vnp_OrderInfo=Thanh+toan+don+261029ABCDEFGH12' +
    '&vnp_PayDate=&vnp_ResponseCode=00&vnp_TmnCode=TESTTMN1' +
    '&vnp_TransactionNo=14000001&vnp_TransactionStatus=00&vnp_TxnRef=261029ABCDEFGH12';
  const WITHOUT_EMPTY =
    'vnp_Amount=110000000&vnp_OrderInfo=Thanh+toan+don+261029ABCDEFGH12' +
    '&vnp_ResponseCode=00&vnp_TmnCode=TESTTMN1' +
    '&vnp_TransactionNo=14000001&vnp_TransactionStatus=00&vnp_TxnRef=261029ABCDEFGH12';
  const hmac = (data: string) => createHmac('sha512', SECRET).update(data).digest('hex');
  const query = (hash: string) => ({
    ...PARAMS,
    vnp_BankCode: '',
    vnp_PayDate: '',
    vnp_SecureHash: hash,
  });

  it('should keep empty values in the sign data', () => {
    expect(buildSignData({ ...PARAMS, vnp_BankCode: '', vnp_PayDate: '' })).toBe(WITH_EMPTY);
  });

  it('should accept a signature computed over every vnp_ param including empty ones', () => {
    expect(verifyVnpaySignature(query(hmac(WITH_EMPTY)), SECRET)).toBe(true);
  });

  it('should accept a signature computed with the empty vnp_ params left out', () => {
    expect(verifyVnpaySignature(query(hmac(WITHOUT_EMPTY)), SECRET)).toBe(true);
  });

  it('should still reject a tampered signature in both modes', () => {
    expect(verifyVnpaySignature(query(tamper(hmac(WITH_EMPTY))), SECRET)).toBe(false);
    expect(verifyVnpaySignature(query(tamper(hmac(WITHOUT_EMPTY))), SECRET)).toBe(false);
  });

  it('should not let the fallback drop a non-empty param from the sign data', () => {
    // Chữ ký chỉ phủ phần không có vnp_Amount → không mode nào chấp nhận
    const rest: Record<string, string> = { ...PARAMS };
    delete rest.vnp_Amount;
    const partial = signVnpayParams(rest, SECRET);

    expect(
      verifyVnpaySignature({ ...PARAMS, vnp_BankCode: '', vnp_SecureHash: partial }, SECRET),
    ).toBe(false);
  });

  it('should reject a repeated vnp_ param even when the fallback would match', () => {
    const hash = hmac(WITHOUT_EMPTY);

    expect(verifyVnpaySignature({ ...query(hash), vnp_PayDate: ['', ''] }, SECRET)).toBe(false);
  });
});
