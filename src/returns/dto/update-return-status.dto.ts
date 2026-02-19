import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateReturnStatusDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
