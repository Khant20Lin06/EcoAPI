import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class MarkChatReadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  messageId?: string;
}
