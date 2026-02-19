import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FulfillmentType } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  fulfillment!: FulfillmentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingAddrId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLocId?: string;
}
