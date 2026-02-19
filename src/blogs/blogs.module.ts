import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlogsController } from './blogs.controller';
import { BlogsService } from './blogs.service';

@Module({
  imports: [PrismaModule],
  controllers: [BlogsController],
  providers: [BlogsService]
})
export class BlogsModule {}

