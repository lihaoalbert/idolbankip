import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import {
  BuyerWorkspaceController,
  CreatorWorkspaceController,
} from './workspace.controller';

@Module({
  controllers: [BuyerWorkspaceController, CreatorWorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}