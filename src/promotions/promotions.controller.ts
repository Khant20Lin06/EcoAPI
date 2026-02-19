import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { ListPromotionsQueryDto } from './dto/list-promotions.dto';
import { ValidatePromotionDto } from './dto/validate-promotion.dto';
import { PromotionsService } from './promotions.service';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.VENDOR, Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: { userId: string; role: Role },
    @Body() dto: CreatePromotionDto,
  ) {
    return this.promotionsService.create(user.userId, user.role, dto);
  }

  @Get()
  list(@Query() query: ListPromotionsQueryDto) {
    return this.promotionsService.list(query);
  }

  @Post('validate')
  validate(@Body() dto: ValidatePromotionDto) {
    return this.promotionsService.validate(dto);
  }
}
