import { DomainError } from '../../../common/errors/domain-error';

/** Tiền VND luôn là số NGUYÊN (đồng). Không có phần lẻ nên `number` an toàn tới ~9 triệu tỷ. */
export type Vnd = number;

export interface PriceTier {
  minQty: number;
  unitPrice: Vnd;
}

export interface CompanyPrice {
  unitPrice: Vnd;
  validFrom: Date;
  validTo: Date | null; // null = vô thời hạn
}

export interface PricingInput {
  minOrderQty: number;
  tiers: PriceTier[]; // KHÔNG đảm bảo đã sắp xếp
  companyPrices: CompanyPrice[]; // các hợp đồng của công ty người mua cho sản phẩm này
  quantity: number;
  at: Date; // thời điểm tính giá (truyền vào để test được, không gọi new Date() bên trong)
}

export interface PriceQuote {
  unitPrice: Vnd;
  lineTotal: Vnd;
  source: 'TIER' | 'CONTRACT';
}

/**
 * ============================================================
 *  BÀI 6 – Tính giá: bậc số lượng + giá hợp đồng theo công ty
 *  Kiểm tra: `pnpm test pricing`
 * ============================================================
 * Đây là DOMAIN thuần: hàm thuần, không Prisma, không NestJS, không I/O.
 *
 * Quy tắc:
 *  1. quantity phải là số nguyên ≥ minOrderQty, nếu không → DomainError('BELOW_MIN_ORDER_QTY').
 *  2. Giá niêm yết (TIER): chọn bậc có minQty LỚN NHẤT mà vẫn ≤ quantity.
 *     Ví dụ tiers [1→100k, 10→90k, 50→80k]: mua 9 → 100k, mua 10 → 90k, mua 200 → 80k.
 *  3. Giá hợp đồng (CONTRACT) có hiệu lực khi validFrom ≤ at < validTo (validTo null = không hết hạn).
 *     Nếu có nhiều hợp đồng hiệu lực → lấy cái RẺ NHẤT.
 *  4. Người mua luôn được giá tốt nhất: so sánh giá hợp đồng (nếu có) với giá bậc (nếu có), lấy rẻ hơn.
 *     Bằng nhau → ưu tiên 'CONTRACT'.
 *  5. Không có giá nào áp dụng được → DomainError('PRICE_NOT_AVAILABLE').
 *  6. lineTotal = unitPrice × quantity.
 *
 * ❓ Vì sao truyền `at` vào thay vì gọi `new Date()` trong hàm?
 * ❓ Vì sao validTo dùng `<` (nửa mở) mà không phải `<=`?
 */
export function quotePrice(input: PricingInput): PriceQuote {
  const { quantity, at } = input;

  // 1. Số lượng hợp lệ
  if (!Number.isInteger(quantity) || quantity < Math.max(1, input.minOrderQty)) {
    throw new DomainError('BELOW_MIN_ORDER_QTY', `Số lượng tối thiểu là ${input.minOrderQty}`);
  }

  // 2. Bậc có minQty lớn nhất mà vẫn ≤ quantity (không giả định mảng đã sắp xếp)
  let tier: PriceTier | undefined;
  for (const t of input.tiers) {
    if (t.minQty <= quantity && (!tier || t.minQty > tier.minQty)) tier = t;
  }

  // 3. Hợp đồng hiệu lực trong [validFrom, validTo) → lấy rẻ nhất
  let contract: Vnd | undefined;
  for (const c of input.companyPrices) {
    const active = c.validFrom <= at && (c.validTo === null || at < c.validTo);
    if (active && (contract === undefined || c.unitPrice < contract)) contract = c.unitPrice;
  }

  // 4–5. Giá tốt nhất cho người mua; bằng nhau ưu tiên CONTRACT
  let unitPrice: Vnd;
  let source: PriceQuote['source'];
  if (contract !== undefined && (!tier || contract <= tier.unitPrice)) {
    unitPrice = contract;
    source = 'CONTRACT';
  } else if (tier) {
    unitPrice = tier.unitPrice;
    source = 'TIER';
  } else {
    throw new DomainError('PRICE_NOT_AVAILABLE', 'Sản phẩm chưa có giá cho số lượng này');
  }

  // 6. Thành tiền
  return { unitPrice, lineTotal: unitPrice * quantity, source };
}
