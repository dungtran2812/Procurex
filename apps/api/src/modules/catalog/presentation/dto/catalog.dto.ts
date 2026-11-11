import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SearchProductsQueryDto {
  @ApiPropertyOptional({ example: 'dung-cu-cam-tay', description: 'Gồm cả danh mục con' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'cờ lê', description: 'Tìm theo tên hoặc SKU' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['material:CrV', 'size_mm:12'],
    description: 'Lọc thông số dạng key:value, lặp lại tham số để AND nhiều điều kiện',
  })
  @IsOptional()
  // ?spec=a:1 → "a:1" (chuỗi); ?spec=a:1&spec=b:2 → mảng. Chuẩn hoá về mảng.
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*:.+$/, { each: true, message: 'spec phải dạng key:value' })
  spec?: string[];

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class QuoteQueryDto {
  @ApiPropertyOptional({ example: 10, description: 'Số lượng mua' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  qty!: number;
}
