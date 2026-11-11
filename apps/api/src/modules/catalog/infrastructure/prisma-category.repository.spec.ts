import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaCategoryRepository } from './prisma-category.repository';

/**
 * Integration test (Bài 7) – chạy trên Postgres thật vì ltree không giả lập được.
 * Mỗi lần chạy dùng tiền tố ngẫu nhiên để không đụng dữ liệu khác, và dọn sạch ở afterAll.
 */
describe('PrismaCategoryRepository (Bài 7, Postgres thật)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaCategoryRepository(prisma);
  const p = `t${Date.now().toString(36)}`; // tiền tố, ví dụ 't1a2b3c'
  const s = (name: string) => `${p}-${name}`; // slug

  //  dung-cu
  //  ├── cam-tay
  //  │   ├── co-le
  //  │   └── tua-vit
  //  └── dien
  //  bao-ho          (cây khác, không được lẫn vào)
  beforeAll(async () => {
    await repo.create({ name: 'Dụng cụ', slug: s('dung-cu'), parentSlug: null });
    await repo.create({ name: 'Cầm tay', slug: s('cam-tay'), parentSlug: s('dung-cu') });
    await repo.create({ name: 'Cờ lê', slug: s('co-le'), parentSlug: s('cam-tay') });
    await repo.create({ name: 'Tua vít', slug: s('tua-vit'), parentSlug: s('cam-tay') });
    await repo.create({ name: 'Dụng cụ điện', slug: s('dien'), parentSlug: s('dung-cu') });
    await repo.create({ name: 'Bảo hộ', slug: s('bao-ho'), parentSlug: null });
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM categories WHERE slug LIKE ${p + '-%'}`;
    await prisma.$disconnect();
  });

  const label = (name: string) => `${p}_${name}`.replace(/-/g, '_');

  it('create: path ghép từ cha, depth đúng, id là uuid', async () => {
    const [coLe] = await repo.findAncestors(s('co-le')).then((a) => a.slice(-1));
    expect(coLe).toMatchObject({
      name: 'Cờ lê',
      slug: s('co-le'),
      path: `${label('dung-cu')}.${label('cam-tay')}.${label('co-le')}`,
      depth: 3,
    });
    expect(coLe.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof coLe.path).toBe('string');
    expect(typeof coLe.depth).toBe('number');
  });

  it('create: parentSlug không tồn tại → null', async () => {
    await expect(
      repo.create({ name: 'Mồ côi', slug: s('orphan'), parentSlug: s('khong-co') }),
    ).resolves.toBeNull();
  });

  it('findSubtree: gồm chính nó + mọi con cháu, sắp theo path, không lẫn cây khác', async () => {
    const tree = await repo.findSubtree(s('dung-cu'));
    expect(tree.map((c) => c.slug)).toEqual([
      s('dung-cu'),
      s('cam-tay'),
      s('co-le'),
      s('tua-vit'),
      s('dien'),
    ]);
  });

  it('findSubtree: nút lá → chỉ chính nó; không tồn tại → []', async () => {
    expect((await repo.findSubtree(s('co-le'))).map((c) => c.slug)).toEqual([s('co-le')]);
    expect(await repo.findSubtree(s('khong-co'))).toEqual([]);
  });

  it('findAncestors: breadcrumb từ gốc xuống', async () => {
    const crumbs = await repo.findAncestors(s('tua-vit'));
    expect(crumbs.map((c) => [c.slug, c.depth])).toEqual([
      [s('dung-cu'), 1],
      [s('cam-tay'), 2],
      [s('tua-vit'), 3],
    ]);
    expect(await repo.findAncestors(s('khong-co'))).toEqual([]);
  });

  it('slug độc hại không gây SQL injection', async () => {
    await expect(repo.findSubtree(`x' OR '1'='1`)).resolves.toEqual([]);
  });
});
