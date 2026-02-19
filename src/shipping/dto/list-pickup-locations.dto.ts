import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListPickupLocationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;
}
