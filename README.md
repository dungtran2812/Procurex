# ProcureX – B2B MRO Procurement Platform

Dự án học tập/portfolio: sàn B2B vật tư MRO (Maintenance, Repair & Operations) với luồng
AI Search → Purchase Request → Approval nhiều cấp → RFQ → Quote → Purchase Order → đồng bộ ERP/CRM.

Bắt đầu bằng **modular monolith** (`apps/api`), Giai đoạn 4 mới tách microservice (xem `docs/adr/0001`).

## Stack

NestJS 11 · Prisma 6 · PostgreSQL 17 (pgvector) · Redis 7 · pnpm workspaces + Turborepo · Jest ·
(sắp tới) Next.js, RabbitMQ, BullMQ, socket.io, Kubernetes.

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
pnpm test                             # unit test
pnpm dev                              # http://localhost:3001/api/v1 , Swagger: /docs
```

## Cấu trúc

```
apps/api/src
├── config/            env.ts (zod, fail-fast)
├── common/            auth (decorators, guards), errors (DomainError + filter)
├── infrastructure/    prisma, redis (hạ tầng dùng chung)
└── modules/identity/
    ├── domain/            entity + port repository (thuần TS)
    ├── application/       use cases + ports (PasswordHasher, TokenService)
    ├── infrastructure/    adapters: Prisma, argon2, JWT+Redis
    └── presentation/      controllers + DTO
```

Quy tắc phụ thuộc: `presentation → application → domain` và `infrastructure → application/domain`.
Domain không import gì từ framework/ORM.

## Đã học được gì

_(Cập nhật cuối mỗi giai đoạn.)_

### Giai đoạn 0

- Monorepo pnpm workspaces + Turborepo; Conventional Commits với husky/commitlint/lint-staged.
- docker-compose với healthcheck để `up --wait` chờ DB sẵn sàng thật.

### Giai đoạn 1a

- _(điền sau khi hoàn thành 5 bài)_
