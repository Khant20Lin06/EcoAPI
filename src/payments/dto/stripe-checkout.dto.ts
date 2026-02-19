import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class StripeCheckoutDto {
  @ApiProperty()
  @IsString()
  orderId!: string;
}
