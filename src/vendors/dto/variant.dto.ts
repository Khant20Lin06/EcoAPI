import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class VariantOptionDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  value!: string;
}

export class CreateVariantDto {
  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiProperty({ type: [VariantOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOptionDto)
  options!: VariantOptionDto[];

  @ApiProperty()
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  stockQty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  weightG?: number;
}

export class UpdateVariantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ type: [VariantOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOptionDto)
  options?: VariantOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  weightG?: number;
}
