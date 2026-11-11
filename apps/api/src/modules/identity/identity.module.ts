import { Module } from '@nestjs/common';
import { IdentityRepository } from './domain/identity.repository';
import { PasswordHasher, TokenService } from './application/ports';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { RegisterCompanyUseCase } from './application/use-cases/register-company.use-case';
import { AuthController } from './presentation/auth.controller';
import { UsersController } from './presentation/users.controller';
import { PrismaIdentityRepository } from './infrastructure/prisma-identity.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { JwtTokenService } from './infrastructure/jwt-token.service';

/**
 * ============================================================
 *  BÀI 1 – Dependency Inversion (DIP) bằng NestJS DI
 *  Kiểm tra: `pnpm dev` khởi động KHÔNG lỗi DI
 *  (hiện tại sẽ lỗi kiểu: "Nest can't resolve dependencies of the RegisterCompanyUseCase (?, ...)")
 * ============================================================
 * Use case chỉ biết tới các PORT (abstract class):
 *   IdentityRepository  (domain/identity.repository.ts)
 *   PasswordHasher      (application/ports/password-hasher.ts)
 *   TokenService        (application/ports/token-service.ts)
 * Nhiệm vụ: "nối dây" mỗi port với ADAPTER tương ứng trong infrastructure/:
 *   PrismaIdentityRepository, Argon2PasswordHasher, JwtTokenService
 *
 * Gợi ý cú pháp: một custom provider dạng  { provide: <token>, useClass: <class> }
 * (đọc: https://docs.nestjs.com/fundamentals/custom-providers)
 *
 * ❓ Vì sao token DI là abstract class mà không phải interface TypeScript?
 * ❓ Muốn chạy test e2e với Redis giả, hoặc đổi argon2 sang bcrypt, bạn phải sửa những file nào?
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    RegisterCompanyUseCase,
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    GetMeUseCase,
    CreateUserUseCase,
    { provide: IdentityRepository, useClass: PrismaIdentityRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
  ],
  // Procurement cần tra approvalLimit của người duyệt (không có trong JWT).
  exports: [GetMeUseCase],
})
export class IdentityModule {}
