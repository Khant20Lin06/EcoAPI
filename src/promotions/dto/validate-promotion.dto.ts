import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ValidatePromotionDto {
  @ApiProperty({ example: 'ECO10' })
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @ApiProperty({ example: 10000, description: 'Order total in smallest unit' })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  orderTotal!: number;

  @ApiPropertyOptional({
    description: 'Vendor id to validate vendor-specific promotions',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;
}
