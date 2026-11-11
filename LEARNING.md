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
- Seed: `pnpm db:seed` (trong `apps/api`) → 19 danh mục (3 gốc, 5 nhóm, 11 lá), 5.000 SKU, 15.000 bậc giá, 40 hợp đồng/công ty; idempotent; cuối cùng `INCR catalog:version`.

### Trạng thái lúc xong 1b (2026-11-11)

80/80 test xanh (gồm integration trên Postgres thật), typecheck sạch, E2E các endpoint catalog trong `requests.http` đúng kỳ vọng.

## Giai đoạn 2 – Procurement: PR + duyệt nhiều cấp ✅ (mentor viết, 2026-11-11)

| Concept                                                                            | Ở đâu                                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| State machine là hàm domain thuần (`submit`, `decide`, `cancel`, `allowedActions`) | `src/modules/procurement/domain/purchase-request.ts`                          |
| Quy tắc duyệt cấu hình được (`approval_rules`), sinh bước duyệt lúc submit         | `buildSteps` (file trên) · `PUT /approval-rules`                              |
| Tách biệt nhiệm vụ: không tự duyệt, 1 người không duyệt 2 cấp, phải đủ hạn mức     | `approverProblem` (file trên)                                                 |
| Optimistic locking (`version`)                                                     | `procurement/infrastructure/prisma-purchase-request.repository.ts` → `save()` |
| Unit of Work bằng AsyncLocalStorage                                                | `src/infrastructure/persistence/prisma-unit-of-work.ts`                       |
| Snapshot giá vào dòng PR                                                           | bảng `purchase_request_lines` · `CatalogPricingAdapter`                       |
| Anti-corruption layer (procurement gọi catalog/identity qua port riêng)            | `procurement/application/ports` · `procurement/infrastructure/adapters.ts`    |
| Audit trail append-only + transactional outbox                                     | `src/common/persistence/ports.ts`                                             |
| Idempotency-Key cho POST                                                           | `src/common/http/idempotency.interceptor.ts`                                  |

API: `POST/GET /purchase-requests`, `GET /purchase-requests/:id[/history]`, `POST /purchase-requests/:id/{submit,approve,reject,cancel}`, `GET/PUT /approval-rules`.

## Giai đoạn 3 – Sourcing + workflow bất đồng bộ ✅ (mentor viết, 2026-11-11)

| Concept                                                                                                            | Ở đâu                                               |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| RFQ → báo giá → chọn thầu → PO (xếp hạng giá/lead time, bắt buộc lý do khi không chọn rẻ nhất)                     | `src/modules/sourcing/domain/sourcing.ts`           |
| Cổng NCC không đăng nhập: token 256-bit trong link, DB chỉ lưu SHA-256                                             | `SupplierPortalController` · `issueInviteToken`     |
| BullMQ: queue dùng chung, retry + backoff mũ, bật/tắt worker bằng `WORKERS_ENABLED`                                | `src/infrastructure/queue/bullmq-job-queue.ts`      |
| Outbox relay (`FOR UPDATE SKIP LOCKED`, jobId = event id)                                                          | `src/infrastructure/queue/outbox-relay.ts`          |
| Idempotent consumer (`processed_events`)                                                                           | `src/infrastructure/queue/event-bus.ts`             |
| Timer & SLA: đóng RFQ đúng hạn; nhắc duyệt sau `APPROVAL_SLA_HOURS`, escalate lên ADMIN                            | `sourcing.handlers.ts` · `procurement.handlers.ts`  |
| Đồng bộ ERP: retry; lần cuối vẫn lỗi → `FAILED` + báo ADMIN, có nút đồng bộ lại; ERP mock idempotent theo poNumber | `syncPoToErp` · `MockErpAdapter`                    |
| Thông báo có `dedupeKey` (job chạy lại không gửi trùng)                                                            | `src/infrastructure/persistence/prisma-notifier.ts` |

API: `/suppliers`, `/rfqs[/:id/{close,cancel,award}]`, `/purchase-orders[/:id[/erp-sync]]`, `/supplier-portal/rfq/:token[/quote]`.
Biến môi trường mới: `WORKERS_ENABLED`, `OUTBOX_POLL_MS`, `APPROVAL_SLA_HOURS`, `PUBLIC_APP_URL`, `ERP_MOCK_FAILURE_RATE` (xem `.env.example`).

### Trạng thái lúc xong GĐ 2–3

130/130 test xanh (unit + integration trên Postgres thật), typecheck và build sạch. E2E trên API thật: PR duyệt 2 cấp, idempotency trả lại response cũ, RFQ 2 NCC, chọn thầu có lý do, PO → ERP `SYNCED` qua worker, outbox không còn event tồn.

## Frontend – Next.js (`apps/web`) ✅ (mentor viết, 2026-11-11)

Next.js 16.4 App Router · React 19 · TanStack Query 5 · Tailwind 4. Chạy: `pnpm dev` ở gốc (API :3001 + web :3000).

| Concept                                                                            | Ở đâu                                                                  |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| BFF: token chỉ nằm trong cookie httpOnly, trình duyệt không thấy token lẫn API_URL | `src/lib/server/session.ts` · `src/app/api/auth/[action]/route.ts`     |
| Proxy gắn token + refresh khi 401, gửi lại 1 lần                                   | `src/app/api/proxy/[...path]/route.ts`                                 |
| Refresh SINGLE-FLIGHT (tránh kích hoạt reuse detection của Bài 4a)                 | `src/lib/server/refresh.ts` (+ test)                                   |
| Kiểm tra phiên ở server trước khi render (không nháy trang rỗng)                   | `src/app/(app)/layout.tsx`                                             |
| Server state = TanStack Query; giỏ hàng = client state (localStorage)              | `src/components/providers.tsx` · `src/components/cart.tsx`             |
| URL là nguồn sự thật cho bộ lọc catalog, debounce ô tìm, giữ dữ liệu cũ khi tải    | `src/lib/search-params.ts` (+ test) · `src/app/(app)/catalog/page.tsx` |
| Nút thao tác theo `allowedActions` của server, không tự đoán luật                  | `src/app/(app)/purchase-requests/[id]/page.tsx`                        |
| Idempotency-Key sinh 1 lần mỗi form                                                | `useIdempotencyKey` trong `src/lib/client/hooks.ts`                    |
| Map lỗi theo `code`, không theo message                                            | `src/lib/client/api.ts`                                                |
| Polling có điều kiện (RFQ đang mở, PO đang đồng bộ ERP)                            | `refetchInterval` ở trang RFQ/PO                                       |
| Cổng NCC công khai (ngoài nhóm route cần đăng nhập)                                | `src/app/rfq/[token]/page.tsx`                                         |

Kiểm chứng: 12 test vitest, typecheck + `next build` sạch; E2E bằng curl (5 request song song cùng refresh token đều 200, API không ghi nhận reuse, phiên vẫn còn hiệu lực) và bằng trình duyệt (đăng nhập → lọc facet → báo giá theo bậc → giỏ → tạo PR → gửi duyệt).

### Còn lại (chưa làm)

- Giai đoạn 4: tách procurement/sourcing thành service riêng + Kafka (ADR 0001); Saga cho PO ↔ hạn mức tín dụng.
- Postgres RLS cho các bảng tenant (hiện lọc `companyId` ở repository).
- socket.io realtime (thông báo hiện chỉ ghi vào bảng `notifications`; web dùng polling).
- Sinh type FE từ OpenAPI (hiện `apps/web/src/lib/types.ts` viết tay); test component/E2E Playwright cho web.
- Danh sách người dùng của công ty (API chưa có endpoint → UI hiện id rút gọn thay tên).
- Throttler lưu trên Redis khi chạy nhiều instance; OpenTelemetry; keyset pagination.

## Ghi chú kỹ thuật / bẫy đã gặp

- Prisma ghim **6.19.x** (`prisma-client-js`); Prisma 7 đổi cấu hình.
- NestJS ghim **11.x** (npm `latest` đã là 12) · TypeScript ghim **5.9** (npm `latest` đã là 7) · ioredis ghim **5.x** (npm `latest` đã là 6).
- pnpm ≥ 10.26: dùng `allowBuilds` trong `pnpm-workspace.yaml` (thay `onlyBuiltDependencies`, bị bỏ ở pnpm 11).
- Test Bài 7–8 chạy trên Postgres thật. DB tắt → lỗi "Can't reach database server" → `docker compose -f infra/docker-compose.yml up -d`.
- Query string luôn là chuỗi còn jsonb phân biệt `"12"` và `12` → filter số thử cả hai dạng (`OR`), vẫn dùng được GIN.
- `$queryRaw` bỏ qua Prisma client → `@default(uuid())` không chạy, phải `gen_random_uuid()`; Decimal/bigint trả về không phải `number` → ép `::int`/`::float8`.
- BullMQ ghim **5.81.x** (6.7.4 phát hành đúng ngày cài). BullMQ cần kết nối Redis riêng với `maxRetriesPerRequest: null`; jobId không được chứa `:`.
- Docker Desktop tắt → container dừng theo. Compose đã có `restart: unless-stopped`; nếu Docker không chạy thì mở Docker Desktop trước.
- Test dùng chung DB dev: `event-infra.spec.ts` chạy relay thật nên sẽ đánh dấu published cả các event đang chờ của dữ liệu dev.
- Next.js 16: `params`/`cookies()` là Promise (`use(params)` ở client, `await` ở server); `useSearchParams` cần bọc `<Suspense>` để build được.
- Dev server cũ còn giữ cổng 3001 → bản mới báo `EADDRINUSE` nhưng health vẫn 200 (đang gọi nhầm bản cũ). Kiểm tra `netstat -ano | findstr :3001`.
- Sau BFF, API thấy mọi request đến từ IP của server Next → throttler gộp MỌI người dùng vào 1 quota (login 5 lần/phút cho cả hệ thống → 429). Sửa: BFF chuyển IP client qua `X-Forwarded-For` (lấy hop cuối), API `trust proxy` chỉ với proxy khai báo (`TRUST_PROXY`, mặc định loopback). Production: reverse proxy trước Next phải GHI ĐÈ header này.
- Postgres image pg17 (pg18 đổi đường dẫn volume).
- File phải UTF-8 **không BOM**; `.gitattributes` ép LF (quan trọng cho `.husky/*`).
- `.env` của API nằm ở `apps/api/.env` (gitignored), mẫu: `.env.example`.
