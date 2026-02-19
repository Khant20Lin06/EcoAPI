import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactMessageDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @ApiPropertyOptional({ example: 'Order support' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @ApiProperty({ example: 'I need help with my last order and delivery timeline.' })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}
