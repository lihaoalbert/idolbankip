import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { PricingService } from './pricing.service';

class DecomposeDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() declaredCategory?: string;
}

class PriceDto {
  @IsObject() spec!: Record<string, any>;
  @IsOptional() @IsObject() budgetHint?: { min: number; max: number };
}

class CategorizeDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
}

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /**
   * 公开: brief 拆解
   * POST /api/v1/pricing/decompose
   * 任何登录用户可调(创作者接单时也想看拆解, 不只是 buyer)
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('decompose')
  async decompose(@Body() body: DecomposeDto) {
    const spec = await this.pricing.decompose(body);
    return { spec };
  }

  /**
   * 公开: brief 报价(3 档套餐)
   * POST /api/v1/pricing/estimate
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('estimate')
  async estimate(@Body() body: PriceDto) {
    const pricing = await this.pricing.price(body);
    return { pricing };
  }

  /**
   * 公开: brief 归类
   * POST /api/v1/pricing/categorize
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('categorize')
  async categorize(@Body() body: CategorizeDto) {
    const result = await this.pricing.categorize(body);
    return { result };
  }
}