import { Module } from '@nestjs/common';
import { ApiKeyController, AgentController } from './agent.controller';
import { ApiKeyService } from './api-key.service';
import { AgentService } from './agent.service';
import { IpsModule } from '../ips/ips.module';
import { UploadModule } from '../upload/upload.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [IpsModule, UploadModule, PrismaModule],
  controllers: [ApiKeyController, AgentController],
  providers: [ApiKeyService, AgentService],
  exports: [ApiKeyService],
})
export class AgentModule {}
