import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PrLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;
}

export class CreatePrDto {
  @ApiProperty({ example: 'Vật tư bảo trì dây chuyền 2 – tháng 12' })
  @IsString()
  @Length(3, 200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [PrLineDto] })
  @ValidateNested({ each: true })
  @Type(() => PrLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  lines!: PrLineDto[];
}

export class DecisionDto {
  @ApiPropertyOptional({ description: 'Bắt buộc khi từ chối' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

const STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class ListPrQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class ApprovalRuleDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  level!: number;

  @ApiProperty({ example: 0, description: 'PR có tổng ≥ giá trị này thì cần cấp này (VND)' })
  @IsInt()
  @Min(0)
  minTotal!: number;

  @ApiProperty({ example: 50_000_000, description: 'Hạn mức tối thiểu của người duyệt cấp này' })
  @IsInt()
  @Min(0)
  minApproverLimit!: number;
}

export class ReplaceApprovalRulesDto {
  @ApiProperty({ type: [ApprovalRuleDto] })
  @ValidateNested({ each: true })
  @Type(() => ApprovalRuleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  rules!: ApprovalRuleDto[];
}
