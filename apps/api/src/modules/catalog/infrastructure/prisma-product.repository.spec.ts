import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaCategoryRepository } from './prisma-category.repository';
import { PrismaProductRepository } from './prisma-product.repository';

/**
 * Integration test (Bài 8) – Postgres thật: ltree + jsonb @> + jsonb_each_text.
 * Dữ liệu dùng tiền tố riêng; mọi truy vấn đều lọc theo danh mục gốc của tiền tố
 * để không lẫn dữ liệu seed.
 */
describe('PrismaProductRepository (Bài 8, Postgres thật)', () => {
  const prisma = new PrismaService();
  const categories = new PrismaCategoryRepository(prisma);
  const repo = new PrismaProductRepository(prisma);
  const p = `t${Date.now().toString(36)}`;
  const s = (name: string) => `${p}-${name}`;
  const base = { categorySlug: s('root'), page: 1, pageSize: 20 };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await categories.create({ name: 'Root', slug: s('root'), parentSlug: null });
    const coLe = await categories.create({
      name: 'Cờ lê',
      slug: s('co-le'),
      parentSlug: s('root'),
    });
    const gang = await categories.create({ name: 'Găng', slug: s('gang'), parentSlug: s('root') });

    const make = async (
      key: string,
      categoryId: string,
      name: string,
      specs: object,
      tiers: number[],
      isActive = true,
    ) => {
      const row = await prisma.product.create({
        data: {
          sku: `${p}-${key}`.toUpperCase(),
          name,
          categoryId,
          unit: 'cái',
          specs,
          isActive,
          priceTiers: {
            create: tiers.map((price, i) => ({ minQty: [1, 10, 50][i], unitPrice: price })),
          },
        },
      });
      ids[key] = row.id;
    };
    await make(
      'cl10',
      coLe!.id,
      'Cờ lê 10mm CrV',
      { size_mm: 10, material: 'CrV' },
      [80_000, 70_000],
    );
    await make('cl12', coLe!.id, 'Cờ lê 12mm CrV', { size_mm: 12, material: 'CrV' }, [90_000]);
    await make('cl12s', coLe!.id, 'Cờ lê 12mm thép', { size_mm: 12, material: 'Steel' }, [60_000]);
    await make('g1', gang!.id, 'Găng tay 50% cotton', { material: 'Cotton', size: 'L' }, [20_000]);
    await make('off', coLe!.id, 'Cờ lê ngừng bán', { size_mm: 12, material: 'CrV' }, [1], false);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { startsWith: p.toUpperCase() } } });
    await prisma.$executeRaw`DELETE FROM categories WHERE slug LIKE ${p + '-%'}`;
    await prisma.$disconnect();
  });

  const skus = (r: { items: Array<{ sku: string }> }) =>
    r.items.map((i) => i.sku.slice(p.length + 1).toLowerCase());

  it('lọc theo danh mục gồm cả cây con, bỏ sản phẩm ngừng bán, sắp theo tên', async () => {
    const r = await repo.search(base);
    expect(r.total).toBe(4);
    expect(skus(r)).toEqual(['cl10', 'cl12', 'cl12s', 'g1']);
    expect(r.items[0]).toMatchObject({ categorySlug: s('co-le'), fromPrice: 70_000 });
  });

  it('lọc specs: chuỗi + số (query string "12" khớp jsonb số 12)', async () => {
    const r = await repo.search({ ...base, specs: { size_mm: '12', material: 'CrV' } });
    expect(skus(r)).toEqual(['cl12']);
  });

  it('facets đếm trên tập đã lọc', async () => {
    const r = await repo.search({ ...base, categorySlug: s('co-le') });
    expect(r.facets.material).toEqual([
      { value: 'CrV', count: 2 },
      { value: 'Steel', count: 1 },
    ]);
    expect(r.facets.size_mm).toEqual([
      { value: '12', count: 2 },
      { value: '10', count: 1 },
    ]);
    expect(r.facets.size).toBeUndefined();
  });

  it('q tìm theo tên/SKU, không phân biệt hoa thường, % là ký tự thường', async () => {
    expect(skus(await repo.search({ ...base, q: 'THÉP' }))).toEqual(['cl12s']);
    expect(skus(await repo.search({ ...base, q: 'CL12' }))).toEqual(['cl12', 'cl12s']);
    expect(skus(await repo.search({ ...base, q: '50%' }))).toEqual(['g1']);
    expect(skus(await repo.search({ ...base, q: '%' }))).toEqual(['g1']);
  });

  it('phân trang: total là tổng, items là 1 trang', async () => {
    const r = await repo.search({ ...base, page: 2, pageSize: 3 });
    expect(r.total).toBe(4);
    expect(skus(r)).toEqual(['g1']);
  });

  it('findById: kèm bậc giá tăng dần; ngừng bán → null', async () => {
    const prod = await repo.findById(ids.cl10);
    expect(prod).toMatchObject({
      specs: { size_mm: 10, material: 'CrV' },
      tiers: [
        { minQty: 1, unitPrice: 80_000 },
        { minQty: 10, unitPrice: 70_000 },
      ],
    });
    expect(await repo.findById(ids.off)).toBeNull();
  });

  it('findCompanyPrices: chỉ của công ty được hỏi', async () => {
    const companies = await prisma.company.findMany({ take: 1, select: { id: true } });
    const companyId = companies[0]?.id ?? '00000000-0000-0000-0000-000000000000';
    await prisma.companyPrice.create({
      data: {
        companyId,
        productId: ids.cl12,
        unitPrice: 85_000,
        validFrom: new Date('2026-01-01'),
      },
    });
    expect(await repo.findCompanyPrices(companyId, ids.cl12)).toEqual([
      { unitPrice: 85_000, validFrom: new Date('2026-01-01'), validTo: null },
    ]);
    expect(await repo.findCompanyPrices('11111111-1111-1111-1111-111111111111', ids.cl12)).toEqual(
      [],
    );
  });
});
