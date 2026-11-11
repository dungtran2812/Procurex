/**
 * Seed catalog MRO ~5.000 SKU (idempotent: xoá catalog cũ rồi tạo lại).
 *   cd apps/api && pnpm db:seed
 *
 * - Dữ liệu sinh bằng PRNG có seed cố định → chạy lại ra đúng bộ SKU như cũ.
 * - Danh mục chèn bằng SQL thô vì cột path là ltree (Prisma không hỗ trợ).
 * - Mỗi công ty đang có trong DB nhận ~40 hợp đồng giá (rẻ hơn giá niêm yết 5–15%).
 * - Cuối cùng INCR catalog:version để vô hiệu toàn bộ cache catalog (Bài 9).
 */
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const TARGET_SKUS = 5000;
const CHUNK = 1000;

// ---- PRNG mulberry32: nhanh, xác định ----
let state = 20261110;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

type SpecGen = () => Record<string, string | number>;
interface Leaf {
  slug: string;
  name: string;
  unit: string;
  basePrice: [number, number]; // khoảng giá niêm yết (VND)
  moq?: number;
  specs: SpecGen;
}
interface Group {
  slug: string;
  name: string;
  children: Array<{ slug: string; name: string; leaves: Leaf[] }>;
}

const BRANDS = ['Stanley', 'Kingtony', 'Tolsen', 'Total', 'Makita', 'Bosch', 'Asaki', 'Yato'];
const MATERIALS = ['CrV', 'S2', 'Steel', 'Stainless'];

const TREE: Group[] = [
  {
    slug: 'dung-cu',
    name: 'Dụng cụ',
    children: [
      {
        slug: 'dung-cu-cam-tay',
        name: 'Dụng cụ cầm tay',
        leaves: [
          {
            slug: 'co-le',
            name: 'Cờ lê',
            unit: 'cái',
            basePrice: [40_000, 400_000],
            specs: () => ({
              brand: pick(BRANDS),
              size_mm: pick([8, 10, 12, 13, 14, 17, 19, 22, 24, 27, 32]),
              material: pick(MATERIALS),
              type: pick(['Vòng miệng', 'Hai đầu miệng', 'Tự động']),
            }),
          },
          {
            slug: 'tua-vit',
            name: 'Tua vít',
            unit: 'cái',
            basePrice: [20_000, 200_000],
            specs: () => ({
              brand: pick(BRANDS),
              tip: pick(['PH1', 'PH2', 'PH3', 'SL5', 'SL6', 'T20', 'T25']),
              length_mm: pick([75, 100, 150, 200]),
              material: pick(['CrV', 'S2']),
            }),
          },
          {
            slug: 'kim-kim',
            name: 'Kìm',
            unit: 'cái',
            basePrice: [60_000, 500_000],
            specs: () => ({
              brand: pick(BRANDS),
              type: pick(['Kìm điện', 'Kìm mũi nhọn', 'Kìm cắt', 'Kìm chết']),
              length_inch: pick([6, 7, 8, 10]),
            }),
          },
        ],
      },
      {
        slug: 'dung-cu-dien',
        name: 'Dụng cụ điện',
        leaves: [
          {
            slug: 'may-khoan',
            name: 'Máy khoan',
            unit: 'cái',
            basePrice: [600_000, 6_000_000],
            specs: () => ({
              brand: pick(['Makita', 'Bosch', 'Total', 'Dewalt', 'Hitachi']),
              power_w: pick([400, 550, 650, 750, 850, 1050]),
              voltage: pick(['220V', '18V pin', '12V pin']),
              chuck_mm: pick([10, 13]),
            }),
          },
          {
            slug: 'may-mai',
            name: 'Máy mài',
            unit: 'cái',
            basePrice: [500_000, 4_000_000],
            specs: () => ({
              brand: pick(['Makita', 'Bosch', 'Total', 'Dewalt']),
              disc_mm: pick([100, 125, 180, 230]),
              power_w: pick([720, 850, 1400, 2200]),
            }),
          },
        ],
      },
    ],
  },
  {
    slug: 'bao-ho-lao-dong',
    name: 'Bảo hộ lao động',
    children: [
      {
        slug: 'bao-ho-ca-nhan',
        name: 'Bảo hộ cá nhân',
        leaves: [
          {
            slug: 'gang-tay',
            name: 'Găng tay',
            unit: 'đôi',
            basePrice: [8_000, 150_000],
            moq: 10,
            specs: () => ({
              brand: pick(['3M', 'Ansell', 'Honeywell', 'Bảo Long']),
              material: pick(['Cotton', 'Nitrile', 'Da', 'Len phủ PU', 'Cao su']),
              size: pick(['S', 'M', 'L', 'XL']),
            }),
          },
          {
            slug: 'mu-bao-ho',
            name: 'Mũ bảo hộ',
            unit: 'cái',
            basePrice: [40_000, 400_000],
            specs: () => ({
              brand: pick(['3M', 'Honeywell', 'Bảo Long', 'SSEDA']),
              color: pick(['Trắng', 'Vàng', 'Xanh', 'Đỏ', 'Cam']),
              standard: pick(['TCVN 6407', 'EN 397', 'ANSI Z89.1']),
            }),
          },
          {
            slug: 'giay-bao-ho',
            name: 'Giày bảo hộ',
            unit: 'đôi',
            basePrice: [300_000, 2_500_000],
            specs: () => ({
              brand: pick(['Jogger', 'Safety Jogger', 'K2', 'Ziben']),
              size: pick([38, 39, 40, 41, 42, 43, 44]),
              toe: pick(['Mũi thép', 'Mũi composite']),
            }),
          },
        ],
      },
    ],
  },
  {
    slug: 'vat-tu-co-khi',
    name: 'Vật tư cơ khí',
    children: [
      {
        slug: 'bulong-oc-vit',
        name: 'Bu lông – ốc vít',
        leaves: [
          {
            slug: 'bu-long',
            name: 'Bu lông',
            unit: 'hộp',
            basePrice: [50_000, 800_000],
            moq: 5,
            specs: () => ({
              thread: pick(['M6', 'M8', 'M10', 'M12', 'M16', 'M20']),
              length_mm: pick([20, 30, 40, 50, 60, 80, 100]),
              grade: pick(['4.8', '8.8', '10.9']),
              finish: pick(['Mạ kẽm', 'Inox 304', 'Đen']),
            }),
          },
          {
            slug: 'oc-vit',
            name: 'Ốc vít',
            unit: 'hộp',
            basePrice: [30_000, 300_000],
            moq: 5,
            specs: () => ({
              size: pick(['3x10', '3x16', '4x20', '4x30', '5x40']),
              head: pick(['Đầu bằng', 'Đầu tròn', 'Đầu dù']),
              finish: pick(['Mạ kẽm', 'Inox 304']),
            }),
          },
        ],
      },
      {
        slug: 'vong-bi',
        name: 'Vòng bi',
        leaves: [
          {
            slug: 'vong-bi-cau',
            name: 'Vòng bi cầu',
            unit: 'cái',
            basePrice: [30_000, 900_000],
            specs: () => ({
              brand: pick(['SKF', 'NSK', 'FAG', 'NTN', 'Koyo']),
              code: pick(['6200', '6201', '6202', '6203', '6204', '6205', '6305', '6306']),
              seal: pick(['ZZ', '2RS', 'Open']),
            }),
          },
        ],
      },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const t0 = Date.now();
  try {
    // 1. Xoá catalog cũ (price_tiers/company_prices cascade theo products).
    await prisma.product.deleteMany();
    await prisma.$executeRaw`DELETE FROM categories`;

    // 2. Danh mục (ltree): gốc → nhóm → lá.
    const insertCat = async (name: string, slug: string, path: string) => {
      const [row] = await prisma.$queryRaw<[{ id: string }]>`
        INSERT INTO categories (id, name, slug, path)
        VALUES (gen_random_uuid(), ${name}, ${slug}, ${path}::ltree)
        RETURNING id::text AS id`;
      return row.id;
    };
    const label = (slug: string) => slug.replace(/-/g, '_');
    const leaves: Array<Leaf & { categoryId: string }> = [];
    for (const g of TREE) {
      await insertCat(g.name, g.slug, label(g.slug));
      for (const c of g.children) {
        const cPath = `${label(g.slug)}.${label(c.slug)}`;
        await insertCat(c.name, c.slug, cPath);
        for (const l of c.leaves) {
          const id = await insertCat(l.name, l.slug, `${cPath}.${label(l.slug)}`);
          leaves.push({ ...l, categoryId: id });
        }
      }
    }

    // 3. Sản phẩm + bậc giá (1 / 10 / 50 với chiết khấu 5% / 12%).
    const products: Array<{
      id: string;
      sku: string;
      name: string;
      categoryId: string;
      unit: string;
      specs: object;
      minOrderQty: number;
      isActive: boolean;
    }> = [];
    const tiers: Array<{ productId: string; minQty: number; unitPrice: number }> = [];
    const seen = new Set<string>();
    const ORIGINS = ['Việt Nam', 'Trung Quốc', 'Đài Loan', 'Nhật Bản', 'Đức', 'Mỹ'];

    // Chia lượt xoay vòng giữa các danh mục lá; tổ hợp thông số trùng thì bỏ qua.
    // Dừng khi đủ TARGET_SKUS hoặc quá nhiều lần thử (không gian tổ hợp đã cạn).
    for (let attempt = 0; products.length < TARGET_SKUS && attempt < TARGET_SKUS * 20; attempt++) {
      const leaf = leaves[attempt % leaves.length];
      const specs = { ...leaf.specs(), origin: pick(ORIGINS) };
      const key = `${leaf.slug}|${JSON.stringify(specs)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const prefix = leaf.slug
        .split('-')
        .map((w) => w[0].toUpperCase())
        .join('');
      const id = crypto.randomUUID();
      const sku = `${prefix}-${String(products.length + 1).padStart(5, '0')}`;
      const { origin, ...rest } = specs;
      products.push({
        id,
        sku,
        name: `${leaf.name} ${Object.values(rest).join(' ')} (${origin})`,
        categoryId: leaf.categoryId,
        unit: leaf.unit,
        specs,
        minOrderQty: leaf.moq ?? 1,
        isActive: rand() > 0.02, // ~2% ngừng bán
      });
      const [lo, hi] = leaf.basePrice;
      const price = roundTo(lo + rand() * (hi - lo), 1000);
      tiers.push({ productId: id, minQty: 1, unitPrice: price });
      tiers.push({ productId: id, minQty: 10, unitPrice: roundTo(price * 0.95, 1000) });
      tiers.push({ productId: id, minQty: 50, unitPrice: roundTo(price * 0.88, 1000) });
    }
    for (let i = 0; i < products.length; i += CHUNK) {
      await prisma.product.createMany({ data: products.slice(i, i + CHUNK) });
    }
    for (let i = 0; i < tiers.length; i += CHUNK * 3) {
      await prisma.priceTier.createMany({ data: tiers.slice(i, i + CHUNK * 3) });
    }

    // 4. Giá hợp đồng cho các công ty đang có.
    const companies = await prisma.company.findMany({ select: { id: true } });
    const listPrice = new Map(
      tiers.filter((t) => t.minQty === 1).map((t) => [t.productId, t.unitPrice]),
    );
    const contracts = companies.flatMap((c) =>
      Array.from({ length: 40 }, () => {
        const p = pick(products);
        return {
          companyId: c.id,
          productId: p.id,
          unitPrice: roundTo(listPrice.get(p.id)! * (0.85 + rand() * 0.1), 1000),
          validFrom: new Date('2026-01-01T00:00:00Z'),
          validTo: rand() > 0.5 ? null : new Date('2027-01-01T00:00:00Z'),
        };
      }),
    );
    if (contracts.length) await prisma.companyPrice.createMany({ data: contracts });

    // 5. Vô hiệu cache catalog.
    const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    try {
      await redis.incr('catalog:version');
    } finally {
      redis.disconnect();
    }

    console.log(
      `✅ Seed catalog: ${leaves.length} danh mục lá, ${products.length} SKU, ${tiers.length} bậc giá, ` +
        `${contracts.length} hợp đồng (${companies.length} công ty) – ${Date.now() - t0}ms`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
