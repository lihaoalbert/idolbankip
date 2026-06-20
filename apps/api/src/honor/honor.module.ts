import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HonorService } from './honor.service';
import { HonorController } from './honor.controller';

@Module({
  imports: [PrismaModule],
  providers: [HonorService],
  controllers: [HonorController],
  exports: [HonorService],
})
export class HonorModule {}