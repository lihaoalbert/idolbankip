import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get(':id')
  async getDetail(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    return this.contracts.getDetail(id, u.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.BUYER)
  @Post(':id/buyer-sign')
  async buyerSign(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const contract = await this.contracts.buyerSign(id, u.id);
    return { contract };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/platform-sign')
  async platformSign(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const contract = await this.contracts.platformSign(id, u.id);
    return { contract };
  }
}