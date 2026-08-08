// #30 任务 — 创作者端
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { UserRole } from '../common/util/roles.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { AgeBucket, Ethnicity, Gender } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class FaceTagDto {
  @IsString() category!: string;
  @IsString() value!: string;
}

class CreateTaskIpDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() tagline?: string;
  @IsString() description!: string;
  @IsEnum(Gender) gender!: Gender;
  @IsEnum(AgeBucket) ageBucket!: AgeBucket;
  @IsOptional() @IsEnum(Ethnicity) ethnicity?: Ethnicity;
  @IsArray() @IsString({ each: true }) styleTags!: string[];
  @IsArray() @IsString({ each: true }) scenarioTags!: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FaceTagDto)
  faceTags?: FaceTagDto[];
  @IsOptional() @IsInt() @Min(0) depositPriceFen?: number;
  @IsInt() @Min(0) fullLicensePriceFen!: number;
}

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /**
   * 创作者任务板 — OPEN 状态, 未截止, 含 acceptedByMe 标记
   */
  @Get()
  async listOpen(@CurrentUser() u: JwtUser) {
    const items = await this.tasks.listOpenTasks(u.id);
    return { items };
  }

  /**
   * 创作者已接的任务
   */
  @Get('my/accepts')
  async myAccepts(@CurrentUser() u: JwtUser) {
    return this.tasks.listMyAccepts(u.id);
  }

  /**
   * 创作者接单
   */
  @Post(':id/accept')
  async accept(@Param('id') id: string, @CurrentUser() u: JwtUser) {
    return this.tasks.acceptTask(id, u.id);
  }

  /**
   * 创作者提交 IP 到已接任务
   * — 自动写 origin=TASK + taskId
   */
  @Post(':id/ips')
  async submit(@Param('id') id: string, @Body() body: CreateTaskIpDto, @CurrentUser() u: JwtUser) {
    const ip = await this.tasks.createTaskSubmission(u.id, id, body);
    return { ip };
  }
}
