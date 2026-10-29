// Công thức phí (spec api § B Tính Tổng Tiền): mọi phép tính số nguyên, làm tròn xuống tới đồng,
// tính trên tổng giá trị dòng. Cùng công thức với CHECK của `orders` (specs/database.md).

const BUYER_FEE_PERCENT = 10n;
const SELLER_FEE_PERCENT = 5n;
const PERCENT_BASE = 100n;

export interface FeeBreakdown {
  subtotal: number;
  buyerFee: number;
  buyerTotal: number;
  sellerFee: number;
  sellerNet: number;
  /** Phần chênh lệch, nhận phần lẻ làm tròn: `sellerNet + platformFee = buyerTotal` tuyệt đối. */
  platformFee: number;
}

/** bigint → number, throw nếu vượt safe integer thay vì làm tròn im lặng. */
function toSafeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Amount outside safe integer range: ${value}`);
  }
  return result;
}

/** `unitPrice` VND > 0 và `quantity` ≥ 1 là số nguyên; chia bigint = làm tròn xuống với số không âm. */
export function calculateFees(unitPrice: number, quantity: number): FeeBreakdown {
  if (!Number.isSafeInteger(unitPrice) || !Number.isSafeInteger(quantity)) {
    throw new RangeError('unitPrice and quantity must be safe integers');
  }
  const subtotal = BigInt(unitPrice) * BigInt(quantity);
  const buyerFee = (subtotal * BUYER_FEE_PERCENT) / PERCENT_BASE;
  const buyerTotal = subtotal + buyerFee;
  const sellerFee = (subtotal * SELLER_FEE_PERCENT) / PERCENT_BASE;
  const sellerNet = subtotal - sellerFee;
  return {
    subtotal: toSafeNumber(subtotal),
    buyerFee: toSafeNumber(buyerFee),
    buyerTotal: toSafeNumber(buyerTotal),
    sellerFee: toSafeNumber(sellerFee),
    sellerNet: toSafeNumber(sellerNet),
    platformFee: toSafeNumber(buyerTotal - sellerNet),
  };
}
