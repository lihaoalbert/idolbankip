import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { UploadService } from './upload.service';

@ApiTags('upload')
@Controller('upload')
export class OssCallbackController {
  constructor(private readonly upload: UploadService) {}

  @Public()
  @Post('oss-callback')
  @HttpCode(200)
  async callback(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') _auth: string,
  ) {
    // MVP: 简化签名校验;生产需解析 OSS 签名
    const result = await this.upload.handleOssCallback(body, _auth);
    if (!result.ok) {
      // 把详细校验错误回给前端(由前端 toast 提示用户)
      return { Status: 'FAIL', Message: result.error || 'invalid callback' };
    }
    return { Status: 'OK', fileId: result.fileId };
  }
}
