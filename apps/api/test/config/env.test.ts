import { describe, expect, it } from 'vitest';

import { loadEnv } from '../../src/config/env.js';

const BASE_ENV = {
  APP_ENV: 'development',
  PORT: '8080',
  DATABASE_URL: 'postgres://ticket:changeme@db-test:5432/ticket_test',
};

describe('loadEnv VNPay keys', () => {
  it('should treat empty VNPAY_* values as not configured', () => {
    // Act
    const env = loadEnv({
      ...BASE_ENV,
      VNPAY_TMN_CODE: '',
      VNPAY_HASH_SECRET: '',
      VNPAY_PAYMENT_URL: '',
      VNPAY_QUERY_URL: '',
      VNPAY_RETURN_URL_BASE: '',
    });

    // Assert
    expect(env.VNPAY_TMN_CODE).toBeUndefined();
    expect(env.VNPAY_HASH_SECRET).toBeUndefined();
    expect(env.VNPAY_PAYMENT_URL).toBeUndefined();
    expect(env.VNPAY_QUERY_URL).toBeUndefined();
    expect(env.VNPAY_RETURN_URL_BASE).toBeUndefined();
  });

  it('should load when VNPAY_* are missing', () => {
    // Act
    const env = loadEnv(BASE_ENV);

    // Assert
    expect(env.VNPAY_TMN_CODE).toBeUndefined();
  });

  it('should keep configured VNPAY_* values', () => {
    // Act
    const env = loadEnv({
      ...BASE_ENV,
      VNPAY_TMN_CODE: 'TESTCODE',
      VNPAY_PAYMENT_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    });

    // Assert
    expect(env.VNPAY_TMN_CODE).toBe('TESTCODE');
    expect(env.VNPAY_PAYMENT_URL).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
  });

  it('should reject a malformed VNPay URL', () => {
    // Act
    const load = () => loadEnv({ ...BASE_ENV, VNPAY_QUERY_URL: 'not-a-url' });

    // Assert
    expect(load).toThrow(/VNPAY_QUERY_URL/);
  });
});
