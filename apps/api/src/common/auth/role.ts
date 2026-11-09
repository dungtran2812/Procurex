export const ROLES = ['ADMIN', 'APPROVER', 'BUYER'] as const;
export type Role = (typeof ROLES)[number];
