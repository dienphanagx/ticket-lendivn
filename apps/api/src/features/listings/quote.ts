import type { Database } from '../../db/client.js';
import { EventStatus } from '../../db/enums.js';
import { AppError } from '../../lib/app-error.js';
import { isUuid } from '../../lib/ids.js';
import { EVENT_ERRORS } from '../events/errors.js';
import { calculateFees } from './fees.js';
import { findListingWithAvailability } from './repository.js';

export const LISTING_ERRORS = {
  NOT_FOUND: { code: 'LISTING_NOT_FOUND', message: 'Listing not found', httpStatus: 404 },
  CANNOT_BUY_OWN: {
    code: 'CANNOT_BUY_OWN_LISTING',
    message: 'Cannot buy your own listing',
    httpStatus: 422,
  },
  INSUFFICIENT_QUANTITY: {
    code: 'INSUFFICIENT_QUANTITY',
    message: 'Not enough tickets available',
    httpStatus: 409,
  },
} as const;

export interface QuoteInput {
  buyerId: string;
  listingId: string;
  quantity: number;
}

export interface Quote {
  listingId: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  buyerFee: number;
  buyerTotal: number;
  availableQuantity: number;
}

/**
 * Bảng tiền cho người mua (spec api § B Tính Tổng Tiền): không giữ chỗ, không ghi dữ liệu.
 * Thứ tự kiểm theo luồng tạo đơn (specs/database.md § Chống bán trùng): sự kiện → người bán → số vé.
 */
export async function quoteListing(db: Database, input: QuoteInput): Promise<Quote> {
  const listing = isUuid(input.listingId)
    ? await findListingWithAvailability(db, input.listingId)
    : undefined;
  if (listing === undefined) {
    throw new AppError(LISTING_ERRORS.NOT_FOUND);
  }
  if (listing.eventStatus !== EventStatus.ON_SALE) {
    throw new AppError(EVENT_ERRORS.NOT_ON_SALE);
  }
  if (listing.sellerId === input.buyerId) {
    throw new AppError(LISTING_ERRORS.CANNOT_BUY_OWN);
  }
  if (input.quantity > listing.availableQuantity) {
    throw new AppError(LISTING_ERRORS.INSUFFICIENT_QUANTITY, {
      available: listing.availableQuantity,
    });
  }
  // Người mua không thấy sellerFee / sellerNet / platformFee
  const { subtotal, buyerFee, buyerTotal } = calculateFees(listing.unitPrice, input.quantity);
  return {
    listingId: listing.id,
    unitPrice: listing.unitPrice,
    quantity: input.quantity,
    subtotal,
    buyerFee,
    buyerTotal,
    availableQuantity: listing.availableQuantity,
  };
}
