import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDate,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Công ty TNHH Thiết Bị Minh Phát' })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiProperty({ example: 'sales@minhphat.vn' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: '0301234567' })
  @IsOptional()
  @Matches(/^\d{10}(-\d{3})?$/, { message: 'taxCode phải dạng 0123456789 hoặc 0123456789-001' })
  taxCode?: string;
}

export class CreateRfqDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  prId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  supplierIds!: string[];

  @ApiProperty({ example: '2026-11-20T10:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  deadline!: Date;
}

const RFQ_STATUSES = ['OPEN', 'CLOSED', 'AWARDED', 'CANCELLED'] as const;
export class ListRfqQueryDto {
  @ApiPropertyOptional({ enum: RFQ_STATUSES })
  @IsOptional()
  @IsIn(RFQ_STATUSES)
  status?: (typeof RFQ_STATUSES)[number];
}

export class AwardDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  quoteId!: string;

  @ApiPropertyOptional({ description: 'Bắt buộc nếu không chọn giá thấp nhất' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class QuoteLineDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  lineNo!: number;

  @ApiProperty({ example: 950000, description: 'Đơn giá VND (số nguyên)' })
  @IsInt()
  @Min(1)
  unitPrice!: number;
}

export class SubmitQuoteDto {
  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  @Max(365)
  leadTimeDays!: number;

  @ApiProperty({ example: '2026-12-31T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  validUntil!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [QuoteLineDto] })
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  lines!: QuoteLineDto[];
}
