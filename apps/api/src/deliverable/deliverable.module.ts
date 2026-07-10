import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  BuyerDeliverableController,
  BuyerDeliverableItemController,
  BuyerWorkbenchController,
  CreatorDeliverableController,
  CreatorDeliverableItemController,
} from './deliverable.controller';
import { DeliverableService } from './deliverable.service';
import {
  DouyinPublisher,
  PublisherFactory,
  PublisherService,
  WechatPublisher,
  XiaohongshuPublisher,
} from './publishers/base.publisher';

@Module({
  imports: [ConfigModule],
  controllers: [
    CreatorDeliverableController,
    CreatorDeliverableItemController,
    BuyerDeliverableController,
    BuyerDeliverableItemController,
    BuyerWorkbenchController,
  ],
  providers: [
    DeliverableService,
    DouyinPublisher,
    WechatPublisher,
    XiaohongshuPublisher,
    PublisherFactory,
    PublisherService,
  ],
  exports: [DeliverableService, PublisherService],
})
export class DeliverableModule {}