import { Module } from '@nestjs/common';
import { BidService } from './bid.service';
import { BuyerBidController, CreatorBidController } from './bid.controller';

@Module({
  controllers: [BuyerBidController, CreatorBidController],
  providers: [BidService],
  exports: [BidService],
})
export class BidModule {}