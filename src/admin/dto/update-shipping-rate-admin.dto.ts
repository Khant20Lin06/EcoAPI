import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateShippingRateAdminDto {
  @ApiProperty()
  @IsBoolean()
  active!: boolean;
}
