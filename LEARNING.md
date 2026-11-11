# LEARNING.md – Nhật ký bài tập ProcureX

> File này để **người học và agent/mentor sau** biết đang ở đâu. Cập nhật mỗi khi xong 1 bài.
> Quy ước trạng thái: ⬜ chưa làm · 🟡 đang làm · ✅ xong (đã review) · 🔁 cần sửa

## Phương pháp

- Mentor viết boilerplate/hạ tầng + 1 worked example mỗi giai đoạn.
- Người học viết phần cốt lõi: tìm `throw new Error('TODO Bài N ...')`, đọc comment gợi ý và câu hỏi ❓.
- Test đỏ → code → test xanh → báo mentor review → trả lời 1–2 câu hỏi kiểm tra → bài tiếp.
- Bí: xin gợi ý theo 3 mức (1) nhắc concept → (2) chỉ API/hàm → (3) pseudo-code. Chỉ xin lời giải khi nói "cho đáp án".

## Lệnh chung (chạy trong `apps/api`)

```powershell
cd apps/api
pnpm test                # toàn bộ unit test
pnpm test <tên-file>     # lọc theo tên, ví dụ: pnpm test guards
pnpm typecheck           # kiểm tra kiểu toàn bộ code
pnpm dev                 # chạy API ở http://localhost:3001 (Swagger: /docs)
```

## Giai đoạn 0 – Nền móng ✅ (mentor dựng)

Monorepo pnpm + Turborepo · husky + commitlint + lint-staged · docker-compose (Postgres pgvector + Redis) · Prisma migrate `init_identity`.

## Giai đoạn 1a – Identity (Auth, RBAC, Multi-tenant)

| Bài | Concept                                  | File cần sửa                                                                                    | Lệnh kiểm tra                     | Trạng thái |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------- | ---------- |
| 1   | Dependency Inversion (DI)                | `src/modules/identity/identity.module.ts`                                                       | `pnpm dev` khởi động không lỗi DI | ✅         |
| 2   | Guards: AuthN (JWT) + AuthZ (RBAC)       | `src/common/auth/guards.ts`                                                                     | `pnpm test guards`                | ✅         |
| 3   | Login an toàn                            | `src/modules/identity/application/use-cases/login.use-case.ts`                                  | `pnpm test login`                 | ✅         |
| 4a  | Refresh token rotation + reuse detection | `src/modules/identity/infrastructure/jwt-token.service.ts` (`consumeRefreshToken`, `revokeAll`) | `pnpm test jwt-token`             | ✅         |
| 4b  | Refresh use case                         | `src/modules/identity/application/use-cases/refresh-token.use-case.ts`                          | `pnpm test refresh`               | ✅         |
| 5   | Multi-tenant isolation                   | `src/modules/identity/application/use-cases/create-user.use-case.ts`                            | `pnpm test create-user`           | ✅         |

Worked example để đọc trước: `register-company.use-case.ts` + `register-company.use-case.spec.ts` (đang xanh).

Sau khi xong cả 5 bài: chạy `pnpm dev` rồi thử toàn bộ kịch bản trong `apps/api/requests.http`.

### E2E `requests.http` ✅ (2026-11-10)

42/42 unit test xanh, typecheck sạch. Cả 10 kịch bản đúng kỳ vọng: email login không phân biệt hoa thường · inject `companyId` → 400 · reuse refresh token → 401 và token mới cũng bị thu hồi · logout 204 · brute-force → 429 · taxCode sai → 400.
Ghi chú: login bị throttle chung 5 lần/phút/IP, nên lần đăng nhập thành công ở bước 2 cũng tính → 429 xuất hiện ở lần sai thứ 5. Body 429 chưa đi qua exception filter (thiếu `error`/`path`) – có thể chuẩn hoá sau.

### Trạng thái test lúc bàn giao (2026-11-08)

- Xanh: `register-company` (4), `jwt-token › issue()` (2)
- Đỏ (chờ bài tập): `guards` (12), `login` (7), `jwt-token › consume/revokeAll` (7), `refresh` (5), `create-user` (5)

## Giai đoạn 1b – Catalog ✅

Mentor đã dựng: migration `init_catalog` (extension `ltree`, bảng `categories` + index GiST, `products.specs` jsonb + index GIN, `price_tiers`, `company_prices`), mã lỗi `BELOW_MIN_ORDER_QTY` / `PRICE_NOT_AVAILABLE` → 422.

| Bài | Concept                                          | File cần sửa                                                                                      | Lệnh kiểm tra                       | Trạng thái |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------- |
| 6   | Domain thuần: giá theo bậc + giá hợp đồng        | `src/modules/catalog/domain/pricing.ts`                                                           | `pnpm test pricing`                 | ✅         |
| 7   | Cây danh mục với ltree (`<@`, `@>`, `$queryRaw`) | `src/modules/catalog/infrastructure/prisma-category.repository.ts`                                | `pnpm test category` (cần DB chạy)  | ✅         |
| 8   | Faceted search trên specs jsonb + GIN            | `src/modules/catalog/infrastructure/prisma-product.repository.ts`                                 | `pnpm test prisma-product` (cần DB) | ✅         |
| 9   | Cache-aside Redis + version-key invalidation     | `src/modules/catalog/infrastructure/redis-catalog-cache.ts`, `application/ports/catalog-cache.ts` | `pnpm test catalog`                 | ✅         |

Bài 8–9 do mentor viết đáp án trực tiếp (người học yêu cầu "làm hết"). Đọc để hiểu, kèm phần còn lại của module:

- Use case: `application/use-cases/catalog-use-cases.ts` (GetProduct, SearchProducts, QuoteProduct, GetCategoryTree) + spec.
- HTTP (chỉ đọc, mọi role đã đăng nhập): `GET /categories/:slug` · `GET /products?category=&q=&spec=key:value&page=&pageSize=` · `GET /products/:id` · `GET /products/:id/quote?qty=`.
- Ghi catalog chỉ qua seed, không mở cho admin công ty (tránh một tenant sửa dữ liệu mọi tenant thấy).
- Seed: `pnpm db:seed` (trong `apps/api`) → 17 danh mục (11 lá), 5.000 SKU, 15.000 bậc giá, 40 hợp đồng/công ty; idempotent; cuối cùng `INCR catalog:version`.

### Trạng thái lúc xong 1b (2026-11-11)

80/80 test xanh (gồm integration trên Postgres thật), typecheck sạch, E2E các endpoint catalog trong `requests.http` đúng kỳ vọng.

## Ghi chú kỹ thuật / bẫy đã gặp

- Prisma ghim **6.19.x** (`prisma-client-js`); Prisma 7 đổi cấu hình.
- NestJS ghim **11.x** (npm `latest` đã là 12) · TypeScript ghim **5.9** (npm `latest` đã là 7) · ioredis ghim **5.x** (npm `latest` đã là 6).
- pnpm ≥ 10.26: dùng `allowBuilds` trong `pnpm-workspace.yaml` (thay `onlyBuiltDependencies`, bị bỏ ở pnpm 11).
- Test Bài 7–8 chạy trên Postgres thật. DB tắt → lỗi "Can't reach database server" → `docker compose -f infra/docker-compose.yml up -d`.
- Query string luôn là chuỗi còn jsonb phân biệt `"12"` và `12` → filter số thử cả hai dạng (`OR`), vẫn dùng được GIN.
- `$queryRaw` bỏ qua Prisma client → `@default(uuid())` không chạy, phải `gen_random_uuid()`; Decimal/bigint trả về không phải `number` → ép `::int`/`::float8`.
- Postgres image pg17 (pg18 đổi đường dẫn volume).
- File phải UTF-8 **không BOM**; `.gitattributes` ép LF (quan trọng cho `.husky/*`).
- `.env` của API nằm ở `apps/api/.env` (gitignored), mẫu: `.env.example`.
