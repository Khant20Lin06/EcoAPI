import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Length } from 'class-validator';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  title!: string;

  @ApiProperty()
  @IsString()
  @Length(10, 5000)
  description!: string;

  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];
}
