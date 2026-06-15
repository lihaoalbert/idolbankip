import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LicenseScope, OrderStatus, OrderType } from '@prisma/client';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

class CreateOrderDto {
  @IsString() ipId!: string;
  @IsEnum(OrderType) orderType!: OrderType;
  @IsOptional() @IsEnum(LicenseScope) licenseScope?: LicenseScope;
  @IsOptional() @IsEnum({} as any) paymentChannel?: 'mock_alipay' | 'mock_wechat';
}

class PayOrderDto {
  @IsEnum({} as any) channel!: 'mock_alipay' | 'mock_wechat';
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(@CurrentUser() u: JwtUser, @Body() body: CreateOrderDto) {
    const { order, charge } = await this.orders.create({
      buyerId: u.id,
      ipId: body.ipId,
      orderType: body.orderType,
      licenseScope: body.licenseScope,
      paymentChannel: body.paymentChannel,
    });
    return { order, payment: charge };
  }

  @Post(':id/pay')
  async pay(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() body: PayOrderDto) {
    const order = await this.orders.pay(id, u.id, body.channel);
    return { order };
  }

  @Post(':id/accept-conditional-risk')
  async acceptRisk(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const order = await this.orders.acceptConditionalRisk(id, u.id);
    return { order };
  }

  @Get('mine/list')
  async listMine(@CurrentUser() u: JwtUser, @Query('status') status?: OrderStatus) {
    const items = await this.orders.listMine(u.id, status);
    return { items };
  }

  @Get(':id')
  async getDetail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const order = await this.orders.getDetail(id);
    if (order.buyerId !== u.id) {
      throw new (await import('@nestjs/common')).ForbiddenException();
    }
    return { order };
  }
}