import type { Role } from './role';

/** Payload nằm trong access token (giữ NHỎ: token đi kèm mọi request). */
export interface AccessPayload {
  sub: string; // userId
  cid: string; // companyId (tenant)
  role: Role;
}

/** Người dùng đã xác thực, được JwtAuthGuard gắn vào req.user. */
export interface AuthUser {
  id: string;
  companyId: string;
  role: Role;
}
