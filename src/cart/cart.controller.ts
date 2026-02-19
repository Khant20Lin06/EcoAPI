import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CartService } from './cart.service';
import { ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  getCart(@CurrentUser() user: CurrentUserPayload) {
    return this.cartService.getCart(user.userId);
  }

  @Post('items')
  @UseGuards(JwtAuthGuard)
  addItem(@CurrentUser() user: CurrentUserPayload, @Body() body: AddCartItemDto) {
    return this.cartService.addItem(user.userId, body);
  }

  @Patch('items/:id')
  @UseGuards(JwtAuthGuard)
  updateItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdateCartItemDto
  ) {
    return this.cartService.updateItem(user.userId, id, body);
  }

  @Delete('items/:id')
  @UseGuards(JwtAuthGuard)
  removeItem(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.cartService.removeItem(user.userId, id);
  }
}
