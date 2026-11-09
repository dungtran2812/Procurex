import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../../../common/auth/auth.types';
import { CurrentUser, Public } from '../../../common/auth/decorators';
import { GetMeUseCase } from '../application/use-cases/get-me.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../application/use-cases/refresh-token.use-case';
import { RegisterCompanyUseCase } from '../application/use-cases/register-company.use-case';
import { LoginDto, LogoutDto, RefreshDto, RegisterCompanyDto } from './dto/auth.dto';

/** Controller MỎNG: nhận DTO đã validate → gọi use case → trả kết quả. Không chứa nghiệp vụ. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerCompany: RegisterCompanyUseCase,
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshTokenUseCase,
    private readonly logout: LogoutUseCase,
    private readonly getMe: GetMeUseCase,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterCompanyDto) {
    return this.registerCompany.execute(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // chống brute-force: 5 lần/phút/IP
  @Post('login')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: LoginDto) {
    return this.login.execute(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshTokens(@Body() dto: RefreshDto) {
    return this.refresh.execute(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto): Promise<void> {
    await this.logout.execute(user, dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.getMe.execute(user);
  }
}
