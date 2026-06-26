import { Module } from '@nestjs/common';
import { CopyrightService } from './copyright.service';
import { CopyrightFeeResolver } from './copyright-fee.resolver';
import {
  CopyrightController,
  AdminCopyrightController,
  CopyrightFeeConfigController,
} from './copyright.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadModule } from '../upload/upload.module';
import { AuditModule } from '../audit/audit.module';

/**
 * #30.6.26 著作权代申请模块 — 复用既有 CopyrightRegistration 模型,
 * 加 CopyrightFeeConfig 配置表 + 申请状态机 + (后续) PDF 生成 + admin 队列.
 */
@Module({
  imports: [NotificationsModule, UploadModule, AuditModule],
  providers: [CopyrightService, CopyrightFeeResolver],
  controllers: [CopyrightController, AdminCopyrightController, CopyrightFeeConfigController],
  exports: [CopyrightService, CopyrightFeeResolver],
})
export class CopyrightModule {}