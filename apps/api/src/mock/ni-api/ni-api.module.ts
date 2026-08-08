import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NiApiController } from './ni-api.controller';
import { NiApiService } from './ni-api.service';
import { MOCK_NI_JWT_SECRET } from './fixtures';

/**
 * Mock 数字人陪伴 App API 模块
 *
 * why 独立 JwtModule: 用自己的 mock secret,不跟生产 JWT_ACCESS_SECRET 混,
 *                 防止 mock token 误被生产 JwtAuthGuard 当真.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: MOCK_NI_JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [NiApiController],
  providers: [NiApiService],
})
export class NiApiModule {}