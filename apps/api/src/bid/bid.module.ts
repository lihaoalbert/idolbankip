import { Module } from '@nestjs/common';
import { BidService } from './bid.service';
import { BuyerBidController, CreatorBidController } from './bid.controller';
import { WorkspaceModule } from '../workspace/workspace.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WorkspaceModule, NotificationsModule],
  controllers: [BuyerBidController, CreatorBidController],
  providers: [BidService],
  exports: [BidService],
})
export class BidModule {}