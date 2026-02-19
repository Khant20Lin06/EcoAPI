import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListReviewsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;
}
