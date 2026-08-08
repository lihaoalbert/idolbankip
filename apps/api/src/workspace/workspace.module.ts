import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import {
  BuyerWorkspaceController,
  CreatorWorkspaceController,
} from './workspace.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BuyerWorkspaceController, CreatorWorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}