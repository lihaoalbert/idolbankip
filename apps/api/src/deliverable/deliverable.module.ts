import { Module } from '@nestjs/common';
import {
  BuyerDeliverableController,
  BuyerDeliverableItemController,
  BuyerWorkbenchController,
  CreatorDeliverableController,
  CreatorDeliverableItemController,
} from './deliverable.controller';
import { DeliverableService } from './deliverable.service';

@Module({
  controllers: [
    CreatorDeliverableController,
    CreatorDeliverableItemController,
    BuyerDeliverableController,
    BuyerDeliverableItemController,
    BuyerWorkbenchController,
  ],
  providers: [DeliverableService],
  exports: [DeliverableService],
})
export class DeliverableModule {}