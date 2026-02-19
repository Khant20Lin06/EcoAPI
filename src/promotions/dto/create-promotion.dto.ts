import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum PromotionType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export class CreatePromotionDto {
  @ApiProperty({ example: 'ECO10' })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiProperty({ enum: PromotionType, example: PromotionType.PERCENT })
  @IsEnum(PromotionType)
  type!: PromotionType;

  @ApiProperty({ example: 10, description: 'Percent(0-100) or fixed amount' })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ example: '2026-12-31T23:59:59.999Z' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrder?: number;
}
