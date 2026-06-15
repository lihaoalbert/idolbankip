import { Module } from '@nestjs/common';
import { WatermarkService } from './watermark.service';
import { WATERMARK_CLIENT, MockWatermarkClient } from '@ibi-ren/shared-contracts';

@Module({
  providers: [
    WatermarkService,
    {
      provide: WATERMARK_CLIENT,
      useClass: MockWatermarkClient,
    },
  ],
  exports: [WatermarkService],
})
export class WatermarkModule {}