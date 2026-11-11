# ProcureX – B2B MRO Procurement Platform

Dự án học tập/portfolio: sàn B2B vật tư MRO (Maintenance, Repair & Operations) với luồng
AI Search → Purchase Request → Approval nhiều cấp → RFQ → Quote → Purchase Order → đồng bộ ERP/CRM.

Bắt đầu bằng **modular monolith** (`apps/api`), Giai đoạn 4 mới tách microservice (xem `docs/adr/0001`).

## Stack

NestJS 11 · Prisma 6 · PostgreSQL 17 (pgvector) · Redis 7 · pnpm workspaces + Turborepo · Jest ·
BullMQ · Next.js 16 (App Router) + TanStack Query + Tailwind 4 ·
(sắp tới) socket.io, Kafka, Kubernetes.

## Workflow automation

Luồng mua hàng (Purchase Request → Approval → RFQ → Quote → PO → đồng bộ ERP/CRM) được mô hình
hoá như một **workflow** thay vì if/else rải rác trong service:

- **State machine** cho từng chứng từ (PR, RFQ, PO): trạng thái và chuyển trạng thái hợp lệ được
  khai báo tập trung; mỗi chuyển trạng thái phát ra domain event.
- **Quy tắc duyệt cấu hình được**: số cấp duyệt, người duyệt theo hạn mức/phòng ban, không hard-code.
- **Bước bất đồng bộ** (gửi RFQ cho nhà cung cấp, nhắc hạn báo giá, đồng bộ ERP) chạy qua hàng đợi
  BullMQ, có retry, backoff và idempotency.
- **Timer & SLA**: tự nhắc/escalate khi phê duyệt quá hạn, tự đóng RFQ khi hết hạn nhận báo giá.
- **Audit trail**: lưu lịch sử mọi bước (ai, khi nào, từ trạng thái nào sang trạng thái nào).

## Chạy nhanh (Windows PowerShell)

```powershell
pnpm install
pnpm infra:up                         # Postgres + Redis (Docker)
cd apps/api
copy .env.example .env                # lần đầu; đổi 2 JWT secret
pnpm exec prisma migrate dev          # tạo bảng
pnpm db:seed                          # catalog MRO ~5.000 SKU
pnpm test                             # unit test
pnpm dev                              # http://localhost:3001/api/v1 , Swagger: /docs
cd ../web && copy .env.example .env.local
cd ../.. && pnpm dev                  # chạy cả API + web: http://localhost:3000
```

## Cấu trúc

```
apps/api/src
├── config/            env.ts (zod, fail-fast)
├── common/            auth (decorators, guards), errors (DomainError + filter)
├── infrastructure/    prisma, redis (hạ tầng dùng chung)
└── modules/
    ├── identity/          auth, RBAC, multi-tenant
    │   ├── domain/            entity + port repository (thuần TS)
    │   ├── application/       use cases + ports (PasswordHasher, TokenService)
    │   ├── infrastructure/    adapters: Prisma, argon2, JWT+Redis
    │   └── presentation/      controllers + DTO
    ├── catalog/           danh mục ltree, faceted search jsonb, bảng giá, cache Redis
    ├── procurement/       Purchase Request, duyệt nhiều cấp cấu hình được, SLA
    └── sourcing/          nhà cung cấp, RFQ, báo giá, PO, đồng bộ ERP
        (mỗi module cùng 4 tầng: domain / application / infrastructure / presentation)

apps/web/src            Next.js App Router
├── app/(auth)/        đăng nhập, đăng ký
├── app/(app)/         catalog, giỏ, PR, RFQ, PO, NCC, cài đặt (cần đăng nhập)
├── app/rfq/[token]/   cổng báo giá cho nhà cung cấp (công khai)
├── app/api/           BFF: auth (cookie httpOnly) + proxy tới API (refresh single-flight)
└── lib/               client API, URL state, định dạng tiền/ngày

apps/api/src/infrastructure
├── persistence/       UnitOfWork (AsyncLocalStorage), audit log, outbox, notifier
└── queue/             BullMQ, event bus (idempotent consumer), outbox relay
```

Quy tắc phụ thuộc: `presentation → application → domain` và `infrastructure → application/domain`.
Domain không import gì từ framework/ORM.

## Đã học được gì

_(Cập nhật cuối mỗi giai đoạn.)_

### Giai đoạn 0

- Monorepo pnpm workspaces + Turborepo; Conventional Commits với husky/commitlint/lint-staged.
- docker-compose với healthcheck để `up --wait` chờ DB sẵn sàng thật.

### Giai đoạn 1a

- Dependency Inversion bằng abstract class làm DI token; use case chỉ biết port, test bằng fake.
- Guard toàn cục Throttler → JwtAuth → Roles; `@Public()` / `@Roles()` khai báo trên route.
- Login chống dò email (cùng thông báo, vẫn verify hash giả); refresh token rotation + phát hiện reuse → thu hồi mọi phiên.
- Multi-tenant: companyId lấy từ JWT, không bao giờ từ body; `forbidNonWhitelisted` là lớp phòng thủ thứ hai.

### Giai đoạn 1b

- Logic giá là hàm domain thuần (`quotePrice`), thời gian truyền vào → test xác định; tiền VND là số nguyên.
- Cây danh mục bằng ltree: con cháu `<@`, tổ tiên `@>`, một câu SQL thay cho `WITH RECURSIVE`.
- Faceted search: `specs @> jsonb` (GIN) để lọc, `jsonb_each_text` + `GROUP BY` để đếm facet; ghép điều kiện bằng `Prisma.sql`/`Prisma.join` để vẫn là tham số.
- Cache-aside với version key: invalidate = `INCR`, không cần xoá từng key; Redis lỗi thì fail-open.

### Giai đoạn 2–3

- Chứng từ là state machine thuần; quy tắc duyệt là dữ liệu; tách biệt nhiệm vụ khi duyệt.
- Ghi đồng thời an toàn bằng optimistic locking; nhiều bảng trong 1 transaction bằng Unit of Work.
- Transactional outbox + relay `SKIP LOCKED` + consumer idempotent = at-least-once mà không trùng tác dụng.
- Hệ thống ngoài (ERP) không rollback được → retry/backoff, dead-letter, idempotency phía ERP.
- Người ngoài hệ thống (NCC) xác thực bằng token entropy cao, chỉ lưu hash.

### Frontend

- BFF giữ token trong cookie httpOnly; refresh single-flight để không đá người dùng ra khi nhiều request cùng hết hạn token.
- Phân biệt server state (TanStack Query), URL state (bộ lọc), client state (giỏ hàng).
- UI đi theo `allowedActions` của server; lỗi xử lý theo mã nghiệp vụ.
