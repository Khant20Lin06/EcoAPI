import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty()
  @IsString()
  filename!: string;

  @ApiProperty()
  @IsString()
  contentType!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  size!: number;
}
