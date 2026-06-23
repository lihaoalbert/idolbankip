import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  BlueprintService,
  BLUEPRINT_LAYERS,
  LayerKey,
} from './blueprint.service';
import {
  CreateBlueprintDto,
  UpdateLayerDto,
} from './dto/blueprint.dto';

// Phase A Round 2 stub:ownerId 从 body 显式传(真接口 Phase B 改 JWT 注入)
// 这避免 Round 2 stub 还要造 JWT,等 Phase B 接 Prisma 时一起换 JwtAuthGuard
@Controller('blueprint')
export class BlueprintController {
  constructor(private readonly service: BlueprintService) {}

  @Post()
  create(@Body() body: CreateBlueprintDto & { ownerId?: string }) {
    const ownerId = body.ownerId ?? 'stub-user-blueprint';
    return this.service.create({
      ownerId,
      title: body.title,
      description: body.description,
      tags: body.tags,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  // step 路径参数 1~8 → 映射到 L{step}_xxx 层 key
  // 为什么用 step 不用 L1_skeleton 等长名字:URL 更短,前端 router 也走 step
  // ParseIntPipe 把 "1" 转成 1,然后我们手动校验 1~8 范围(超过返 invalid_step)
  @Patch(':id/step/:step')
  updateLayer(
    @Param('id') id: string,
    @Param('step', ParseIntPipe) step: number,
    @Body() body: UpdateLayerDto,
  ) {
    const layerKey = stepToLayer(step);
    if (!layerKey) {
      throw new BadRequestException({
        error: {
          code: 'invalid_step',
          message: `step 必须是 1~8,收到 ${step}`,
          request_id: null,
        },
      });
    }
    return this.service.updateLayer(id, layerKey, step, { data: body.data });
  }

  @Post(':id/evaluate')
  evaluate(@Param('id') id: string) {
    return this.service.evaluate(id);
  }
}

function stepToLayer(step: number): LayerKey | null {
  if (step < 1 || step > BLUEPRINT_LAYERS.length) {
    return null;
  }
  return BLUEPRINT_LAYERS[step - 1];
}