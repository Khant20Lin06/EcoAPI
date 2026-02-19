import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageInputDto {
  @ApiProperty()
  @IsString()
  url!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class AddProductImagesDto {
  @ApiProperty({ type: [ProductImageInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  images!: ProductImageInputDto[];
}
