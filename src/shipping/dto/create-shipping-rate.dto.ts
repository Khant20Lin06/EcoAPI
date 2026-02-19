import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateShippingRateDto {
  @ApiProperty({ example: 'US' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: 1299, description: 'Flat shipping fee in smallest unit' })
  @IsInt()
  @Min(0)
  flatRate!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
