import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/util/roles.util';
import { LlmConfigService } from './llm-config.service';
import {
  CreateLlmConfigDto,
  SetActiveDto,
  TestConnectionDto,
  UpdateLlmConfigDto,
} from './dto/llm-config.dto';

@Controller('admin/llm-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LlmConfigController {
  constructor(private readonly svc: LlmConfigService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  @Post()
  create(@Body() body: CreateLlmConfigDto, @Req() req: any) {
    return this.svc.create({
      ...body,
      setActive: body.setActive,
      actorId: req.user?.id,
    });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateLlmConfigDto, @Req() req: any) {
    return this.svc.update({ ...body, id, actorId: req.user?.id });
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.svc.delete(id, req.user?.id);
  }

  @Post('set-active')
  setActive(@Body() body: SetActiveDto, @Req() req: any) {
    return this.svc.setActive(body.id, req.user?.id);
  }

  @Post('test')
  test(@Body() body: TestConnectionDto) {
    return this.svc.testConnection(body.id);
  }
}