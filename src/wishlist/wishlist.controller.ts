import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.wishlistService.list(user.userId);
  }

  @Post('items')
  add(@CurrentUser() user: CurrentUserPayload, @Body() body: AddWishlistItemDto) {
    return this.wishlistService.add(user.userId, body.productId);
  }

  @Delete('items/:productId')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('productId') productId: string) {
    return this.wishlistService.remove(user.userId, productId);
  }
}

