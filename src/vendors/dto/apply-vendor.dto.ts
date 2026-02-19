import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class ApplyVendorDto {
  @ApiProperty()
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: 'US' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct?: number;
}
