import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateVendorAdminDto {
  @ApiProperty()
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty()
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(100)
  commissionPct!: number;

  @ApiPropertyOptional({ enum: VendorStatus })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus;
}

