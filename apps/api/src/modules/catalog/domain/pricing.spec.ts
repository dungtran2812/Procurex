import { DomainError } from '../../../common/errors/domain-error';
import { PricingInput, quotePrice } from './pricing';

describe('quotePrice (Bài 6)', () => {
  const at = new Date('2026-11-10T00:00:00Z');
  const base: PricingInput = {
    minOrderQty: 1,
    // cố ý không sắp xếp
    tiers: [
      { minQty: 50, unitPrice: 80_000 },
      { minQty: 1, unitPrice: 100_000 },
      { minQty: 10, unitPrice: 90_000 },
    ],
    companyPrices: [],
    quantity: 1,
    at,
  };
  const q = (patch: Partial<PricingInput>) => quotePrice({ ...base, ...patch });
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof DomainError ? e.code : 'NOT_DOMAIN_ERROR';
    }
    return 'NO_THROW';
  };

  it.each([
    [1, 100_000],
    [9, 100_000],
    [10, 90_000],
    [49, 90_000],
    [50, 80_000],
    [200, 80_000],
  ])('mua %i → đơn giá bậc %i', (quantity, unitPrice) => {
    expect(q({ quantity })).toEqual({ unitPrice, lineTotal: unitPrice * quantity, source: 'TIER' });
  });

  it('dưới minOrderQty, số âm, số lẻ → BELOW_MIN_ORDER_QTY', () => {
    expect(code(() => q({ minOrderQty: 5, quantity: 4 }))).toBe('BELOW_MIN_ORDER_QTY');
    expect(code(() => q({ quantity: 0 }))).toBe('BELOW_MIN_ORDER_QTY');
    expect(code(() => q({ quantity: 2.5 }))).toBe('BELOW_MIN_ORDER_QTY');
  });

  it('giá hợp đồng rẻ hơn bậc → CONTRACT', () => {
    const r = q({
      quantity: 10,
      companyPrices: [{ unitPrice: 85_000, validFrom: new Date('2026-01-01'), validTo: null }],
    });
    expect(r).toEqual({ unitPrice: 85_000, lineTotal: 850_000, source: 'CONTRACT' });
  });

  it('bậc rẻ hơn hợp đồng → vẫn lấy TIER (giá tốt nhất cho người mua)', () => {
    const r = q({
      quantity: 50,
      companyPrices: [{ unitPrice: 85_000, validFrom: new Date('2026-01-01'), validTo: null }],
    });
    expect(r.source).toBe('TIER');
    expect(r.unitPrice).toBe(80_000);
  });

  it('bằng giá → ưu tiên CONTRACT', () => {
    const r = q({
      quantity: 10,
      companyPrices: [{ unitPrice: 90_000, validFrom: new Date('2026-01-01'), validTo: null }],
    });
    expect(r.source).toBe('CONTRACT');
  });

  it('bỏ qua hợp đồng chưa hiệu lực / đã hết hạn (validTo nửa mở)', () => {
    const r = q({
      companyPrices: [
        { unitPrice: 1_000, validFrom: new Date('2026-12-01'), validTo: null }, // chưa tới
        { unitPrice: 2_000, validFrom: new Date('2026-01-01'), validTo: at }, // hết hạn đúng lúc `at`
      ],
    });
    expect(r.source).toBe('TIER');
  });

  it('nhiều hợp đồng hiệu lực → lấy rẻ nhất', () => {
    const r = q({
      companyPrices: [
        { unitPrice: 95_000, validFrom: new Date('2026-01-01'), validTo: null },
        { unitPrice: 70_000, validFrom: at, validTo: new Date('2027-01-01') },
      ],
    });
    expect(r).toMatchObject({ unitPrice: 70_000, source: 'CONTRACT' });
  });

  it('không có bậc nào ≤ quantity nhưng có hợp đồng → CONTRACT', () => {
    const r = q({
      tiers: [{ minQty: 100, unitPrice: 50_000 }],
      companyPrices: [{ unitPrice: 60_000, validFrom: new Date('2026-01-01'), validTo: null }],
      quantity: 5,
    });
    expect(r).toMatchObject({ unitPrice: 60_000, source: 'CONTRACT' });
  });

  it('không có giá nào → PRICE_NOT_AVAILABLE', () => {
    expect(code(() => q({ tiers: [] }))).toBe('PRICE_NOT_AVAILABLE');
    expect(code(() => q({ tiers: [{ minQty: 100, unitPrice: 1 }], quantity: 5 }))).toBe(
      'PRICE_NOT_AVAILABLE',
    );
  });
});
