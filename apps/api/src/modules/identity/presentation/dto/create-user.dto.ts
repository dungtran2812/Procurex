import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ROLES, type Role } from '../../../../common/auth/role';

export class CreateUserDto {
  @ApiProperty({ example: 'buyer@acme.vn' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Secret123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Le Van C' })
  @IsString()
  @Length(1, 120)
  fullName!: string;

  @ApiProperty({ enum: ROLES, example: 'BUYER' })
  @IsIn(ROLES)
  role!: Role;

  @ApiPropertyOptional({ example: 50000000, description: 'Hạn mức phê duyệt (VND)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  approvalLimit?: number;
}
