import { Module } from '@nestjs/common';
import { BlueprintController } from './blueprint.controller';
import { BlueprintService } from './blueprint.service';

/**
 * FaceBlueprint 模块 — 8 层人脸分解向导(Phase 1 Layered Prompt Generator)
 *
 * Phase A Round 2: stub 实现,内存存储
 *   - Round 2 目标:模块/路由/DTO 验证通,真实 Prisma 落库留 Phase B
 *   - Phase B Round 4~7: 替换 service 内部 Map 为 PrismaService + 8 层真实校验
 *
 * 为什么不接 Prisma:Round 2 是 skeleton,目的是验证端点 shape.
 *                   提前接 Prisma 会引入 schema 测试 fixture + 测试 DB 隔离,
 *                   skeleton 阶段过度设计,Phase B 替换成本几乎为 0.
 */
@Module({
  controllers: [BlueprintController],
  providers: [BlueprintService],
  exports: [BlueprintService],
})
export class BlueprintModule {}