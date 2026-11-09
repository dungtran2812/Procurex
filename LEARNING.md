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
| 4a  | Refresh token rotation + reuse detection | `src/modules/identity/infrastructure/jwt-token.service.ts` (`consumeRefreshToken`, `revokeAll`) | `pnpm test jwt-token`             | ⬜         |
| 4b  | Refresh use case                         | `src/modules/identity/application/use-cases/refresh-token.use-case.ts`                          | `pnpm test refresh`               | ⬜         |
| 5   | Multi-tenant isolation                   | `src/modules/identity/application/use-cases/create-user.use-case.ts`                            | `pnpm test create-user`           | ⬜         |

Worked example để đọc trước: `register-company.use-case.ts` + `register-company.use-case.spec.ts` (đang xanh).

Sau khi xong cả 5 bài: chạy `pnpm dev` rồi thử toàn bộ kịch bản trong `apps/api/requests.http`.

### Trạng thái test lúc bàn giao (2026-11-08)

- Xanh: `register-company` (4), `jwt-token › issue()` (2)
- Đỏ (chờ bài tập): `guards` (12), `login` (7), `jwt-token › consume/revokeAll` (7), `refresh` (5), `create-user` (5)

## Giai đoạn 1b – Catalog (chưa bắt đầu)

ltree · specs jsonb + GIN · bảng giá theo bậc số lượng & theo công ty · faceted search · cache Redis + invalidation · seed ~5.000 SKU MRO.

## Ghi chú kỹ thuật / bẫy đã gặp

- Prisma ghim **6.19.x** (`prisma-client-js`); Prisma 7 đổi cấu hình.
- NestJS ghim **11.x** (npm `latest` đã là 12) · TypeScript ghim **5.9** (npm `latest` đã là 7) · ioredis ghim **5.x** (npm `latest` đã là 6).
- pnpm ≥ 10.26: dùng `allowBuilds` trong `pnpm-workspace.yaml` (thay `onlyBuiltDependencies`, bị bỏ ở pnpm 11).
- Postgres image pg17 (pg18 đổi đường dẫn volume).
- File phải UTF-8 **không BOM**; `.gitattributes` ép LF (quan trọng cho `.husky/*`).
- `.env` của API nằm ở `apps/api/.env` (gitignored), mẫu: `.env.example`.
