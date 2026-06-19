import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { AdminTasksController } from './admin-tasks.controller';
import { TasksService } from './tasks.service';
import { IpsModule } from '../ips/ips.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [IpsModule, NotificationsModule],
  controllers: [TasksController, AdminTasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
