import { describe, expect, it } from 'vitest';

import { calculateFees } from '../../src/features/listings/fees.js';

describe('calculateFees', () => {
  it('should compute the spec example 500.000 x 2', () => {
    // Act
    const fees = calculateFees(500_000, 2);

    // Assert
    expect(fees).toEqual({
      subtotal: 1_000_000,
      buyerFee: 100_000,
      buyerTotal: 1_100_000,
      sellerFee: 50_000,
      sellerNet: 950_000,
      platformFee: 150_000,
    });
  });

  it('should round fees down and give the remainder to the platform for 333.333 x 1', () => {
    // Act
    const fees = calculateFees(333_333, 1);

    // Assert
    expect(fees).toEqual({
      subtotal: 333_333,
      buyerFee: 33_333,
      buyerTotal: 366_666,
      sellerFee: 16_666,
      sellerNet: 316_667,
      platformFee: 49_999,
    });
  });

  it('should apply fees on the line total, not per ticket', () => {
    // Act: tính từng vé ra 9 x 3 = 27 đồng phí; trên tổng dòng 297 x 10% → 29 đồng
    const fees = calculateFees(99, 3);

    // Assert
    expect(fees.buyerFee).toBe(29);
    expect(fees.sellerFee).toBe(14);
  });

  it.each([
    [1, 1],
    [9, 1],
    [19, 7],
    [333_333, 3],
    [999_999_999, 9],
  ])('should keep sellerNet + platformFee = buyerTotal for %i x %i', (unitPrice, quantity) => {
    // Act
    const fees = calculateFees(unitPrice, quantity);

    // Assert
    expect(fees.sellerNet + fees.platformFee).toBe(fees.buyerTotal);
    expect(fees.platformFee).toBeGreaterThanOrEqual(0);
  });

  it('should throw when the amount exceeds the safe integer range', () => {
    // Act
    const calculate = () => calculateFees(Number.MAX_SAFE_INTEGER, 2);

    // Assert
    expect(calculate).toThrow(RangeError);
  });
});
