import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** MST Việt Nam: 10 số (doanh nghiệp) hoặc 10 số + "-" + 3 số (chi nhánh). */
export const VN_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;

export class RegisterCompanyDto {
  @ApiProperty({ example: 'Công ty TNHH Cơ Khí ACME' })
  @IsString()
  @Length(2, 200)
  companyName!: string;

  @ApiProperty({ example: '0312345678', description: '10 số hoặc 10 số-3 số' })
  @Matches(VN_TAX_CODE_REGEX, { message: 'taxCode phải dạng 0123456789 hoặc 0123456789-001' })
  taxCode!: string;

  @ApiProperty({ example: 'admin@acme.vn' })
  @IsEmail()
  @MaxLength(254)
  adminEmail!: string;

  @ApiProperty({ example: 'Secret123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128) // chặn payload khổng lồ làm argon2 tốn CPU (DoS)
  adminPassword!: string;

  @ApiProperty({ example: 'Tran Thi B' })
  @IsString()
  @Length(1, 120)
  adminFullName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'admin@acme.vn' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Secret123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @ApiPropertyOptional({ description: 'true = đăng xuất khỏi mọi thiết bị' })
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}
