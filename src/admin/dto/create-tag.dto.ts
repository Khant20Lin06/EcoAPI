import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: 'English name' })
  @IsString()
  @Length(2, 50)
  en_name!: string;

  @ApiProperty({ description: 'Myanmar name' })
  @IsString()
  @Length(2, 50)
  mm_name!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 50)
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  @Length(2, 50)
  name?: string;
}
