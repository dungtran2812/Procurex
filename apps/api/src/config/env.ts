import { z } from 'zod';

/**
 * Validate biến môi trường NGAY khi khởi động (fail fast).
 * Thiếu/sai cấu hình → app không chạy, thay vì chạy rồi lỗi lúc 2h sáng.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải >= 32 ký tự'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET phải >= 32 ký tự'),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
  })
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau',
    path: ['JWT_REFRESH_SECRET'],
  });

export type Env = z.infer<typeof EnvSchema>;

/** DI token cho cấu hình đã validate. */
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
