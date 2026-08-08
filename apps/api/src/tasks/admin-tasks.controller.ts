// #30 任务 — admin 端
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { IpTaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateTaskDto, UpdateTaskStatusDto } from './tasks.dto';

class RejectSubmissionDto {
  @IsString() reason!: string;
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async list(@Query('status') status?: IpTaskStatus) {
    return this.tasks.listAllTasks({ status });
  }

  @Post()
  async create(@CurrentUser() u: JwtUser, @Body() body: CreateTaskDto) {
    return this.tasks.createTask(u.id, {
      title: body.title,
      description: body.description,
      spec: body.spec,
      budgetFen: body.budgetFen,
      perIpFen: body.perIpFen,
      maxAccepts: body.maxAccepts,
      deadlineAt: new Date(body.deadlineAt),
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.tasks.getTaskDetail(id);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() u: JwtUser,
    @Body() body: UpdateTaskStatusDto,
  ) {
    return this.tasks.updateTaskStatus(id, u.id, body.action);
  }

  /**
   * admin 看任务的所有提交 (按 creatorId 分组, 前端自己组装)
   */
  @Get(':id/submissions')
  async submissions(@Param('id') id: string) {
    return this.tasks.listSubmissions(id);
  }

  @Post(':id/submissions/:ipId/approve')
  async approve(
    @Param('id') id: string,
    @Param('ipId') ipId: string,
    @CurrentUser() u: JwtUser,
  ) {
    return this.tasks.approveSubmission(id, ipId, u.id);
  }

  @Post(':id/submissions/:ipId/reject')
  async reject(
    @Param('id') id: string,
    @Param('ipId') ipId: string,
    @CurrentUser() u: JwtUser,
    @Body() body: RejectSubmissionDto,
  ) {
    return this.tasks.rejectSubmission(id, ipId, u.id, body.reason);
  }
}
