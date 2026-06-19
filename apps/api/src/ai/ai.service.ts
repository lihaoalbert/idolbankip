/**
 * #30.6 AI 服务 — MiniMax M3 (Anthropic 协议兼容) 集成
 *
 * 端点:
 *   - recognizeFace(creatorId, fileId)  创作者侧 — 面部特写图 → IP 元数据 JSON
 *   - suggestTask(adminId, description) admin 侧 — 任务描述 → 任务 spec
 *
 * 隐私: API 不存图, 仅用于推断 (用户已确认 MiniMax 端不存训练数据)。
 *
 * 错误处理: MiniMax 不可用返 503, 前端按钮显示「服务暂不可用」。
 * 限流: 全局 ThrottlerGuard 300/min 已够, 不加额外限流 (后续按需加 per-IP 限制)。
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AssetType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import {
  ipWizardFields,
  adminTaskFields,
  validateIpWizardFields,
  validateTaskSpec,
} from './field-meta';

const RECOGNIZE_SYSTEM_PROMPT = `你是 ibi.ren 平台的形象 IP 元数据助手, 根据用户上传的面部特写图, 推断出这个人物 IP 的结构化字段。

严格按以下 JSON schema 输出, 字段顺序无所谓, 不要遗漏, 不要添加额外字段:
{
  "displayName": "<**严格** 格式 [种族-性别-年龄段-姓名] — 种族标签(中文): 东亚/东南亚/南亚/非洲/欧洲/混血;性别(中文): 女/男/非二元;年龄段(中文): 少年/青年/中年/老年;姓名: 2-4 字中文 (欧美面孔 3-6 字英文)。例: '东亚-女-青年-苏清禾' / '欧洲-男-中年-Liam' / '南亚-非二元-少年-Anika'>",
  "tagline": "<8-20 字人设, 突出视觉+性格关键词>",
  "description": "<150-400 字人物小传, 含姓名/年龄/性格/背景/视觉印象>",
  "gender": "FEMALE" | "MALE" | "NONBINARY",
  "ageBucket": "CHILD" | "YOUNG" | "MIDDLE" | "ELDERLY",
  "ethnicity": "EAST_ASIAN" | "SOUTHEAST_ASIAN" | "SOUTH_ASIAN" | "AFRICAN" | "EUROPEAN" | "MIXED",
  "faceTags": [{"category": "FaceShape|SkinTone|HairStyle|HairColor|EyeShape|Vibe", "value": "<枚举值>"}],
  "styleTags": ["现代"|"古风"|"赛博"|"二次元"|"民国"|"未来"|"复古"|"国潮"|"日系"|"韩系"|"欧美"|"港风", 选 1-3 个],
  "scenarioTags": ["短剧(单集)"|"短剧(系列)"|"品牌合作"|"平面拍摄"|"游戏角色"|"直播"|"广告"|"电影角色"|"电商模特"|"MV/短片", 选 1-3 个]
}

faceTags 类别枚举值:
- FaceShape: OVAL, FACE_ROUND, SQUARE, LONG, HEART, DIAMOND
- SkinTone: PORCELAIN, FAIR, MEDIUM, OLIVE, TAN, DEEP
- HairStyle: LONG_STRAIGHT, LONG_CURLY, SHORT, BUZZCUT, BALD, PONYTAIL, TWINTAIL, BUN, BRAIDS
- HairColor: BLACK, BROWN, BLONDE, RED, GREY, WHITE, FANTASY
- EyeShape: ALMOND, PHOENIX, PEACH, WILLOW, EYE_ROUND, MONOLID, DOUBLE
- Vibe: COOL, WARM, HEROIC, SEDUCTIVE, QUIET, FIERCE, CUTE

规则:
- 输出严格 JSON, 不要 markdown 包裹, 不要解释, 不要道歉
- 描述/小传部分用中文, 字段值用枚举原值
- faceTags 必须 6 类各 1 个
- displayName **必须严格** 按 [种族-性别-年龄段-姓名] 4 段, 用半角横线 - 连接。种族/性别/年龄用上面 schema 注释里给的中文标签 (如 '东亚' '女' '青年'), 不要写成 enum 原值 (不要 'EAST_ASIAN-FEMALE-YOUNG')。整体不超过 16 字。`;

const SUGGEST_SYSTEM_PROMPT = `你是 ibi.ren 平台的任务发布助手, 帮平台运营从自然语言描述生成结构化任务 spec。

严格按以下 JSON schema 输出:
{
  "title": "<6-15 字标题, 突出数量+特征+场景>",
  "description": "<80-200 字详细描述, 含需求/风格/合同条款/报酬>",
  "spec": {
    "count": <期望产出数, 1-100 整数>,
    "gender": "FEMALE" | "MALE" | "NONBINARY" (或省略 = 不限),
    "ageBuckets": ["CHILD"|"YOUNG"|"MIDDLE"|"ELDERLY", 多选, 可空],
    "ethnicities": ["EAST_ASIAN"|"SOUTHEAST_ASIAN"|"SOUTH_ASIAN"|"AFRICAN"|"EUROPEAN"|"MIXED", 多选, 可空],
    "styleTags": ["现代"|"古风"|"赛博"|"二次元"|"民国"|"未来"|"复古"|"国潮"|"日系"|"韩系"|"欧美"|"港风", 至少 1 个],
    "scenarioTags": ["短剧(单集)"|"短剧(系列)"|"品牌合作"|"平面拍摄"|"游戏角色"|"直播"|"广告"|"电影角色"|"电商模特"|"MV/短片", 至少 1 个]
  }
}

规则:
- 输出严格 JSON, 不要 markdown 包裹, 不要解释
- 中文输出所有文字
- styleTags / scenarioTags 至少各 1 个, count 必填 1-100`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
  ) {
    const apiKey = this.config.get<string>('MINIMAX_API_KEY', '');
    const baseURL = this.config.get<string>('MINIMAX_BASE_URL', 'https://api.minimaxi.com');
    this.model = this.config.get<string>('MINIMAX_MODEL', 'claude-sonnet-4-6');
    if (!apiKey || apiKey === 'sk-api-PLACEHOLDER') {
      this.logger.warn('MINIMAX_API_KEY 未配置或为占位符, AI 端点会 503');
      this.client = null;
    } else {
      this.client = new Anthropic({ apiKey, baseURL });
    }
  }

  /**
   * 创作者侧: 面部特写图 → IP 元数据
   */
  async recognizeFace(creatorId: string, fileId: string): Promise<Prisma.JsonObject> {
    if (!this.client) throw new ServiceUnavailableException('AI 服务未配置');
    const file = await this.prisma.ipFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('文件不存在');
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: file.ipId }, select: { creatorId: true } });
    if (!ip || ip.creatorId !== creatorId) throw new ForbiddenException('无权访问此文件');
    if (file.assetType !== AssetType.FACE_CLOSEUP) {
      throw new BadRequestException('仅面部特写图支持 AI 识别, 请切换文件类型');
    }
    // 读 OSS 原图 → base64 inline (避免 MiniMax 拉不到 ECS 公网 OSS URL)
    const buf = await this.upload.getCertBuffer(file.ossKey, 30 * 1024 * 1024);
    const mediaType = (file.mimeType === 'image/jpeg' ? 'image/jpeg' : file.mimeType === 'image/webp' ? 'image/webp' : 'image/png') as
      | 'image/jpeg' | 'image/webp' | 'image/png';
    let text = '';
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: RECOGNIZE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } },
            { type: 'text', text: '识别这张面部特写, 按 schema 输出 JSON。' },
          ],
        }],
      });
      text = (resp.content[0] as any).text ?? '';
    } catch (e: any) {
      this.logger.error(`MiniMax API 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    const parsed = this.parseJson(text);
    if (!parsed) {
      this.logger.warn(`AI 输出无法解析: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI 返回格式异常');
    }
    const validated = validateIpWizardFields(parsed);
    this.logger.log(`recognizeFace: ${fileId} → ${Object.keys(validated).join(',')}`);
    return validated as Prisma.JsonObject;
  }

  /**
   * admin 侧: 任务描述 → 任务 spec
   */
  async suggestTask(adminId: string, description: string): Promise<Prisma.JsonObject> {
    if (!this.client) throw new ServiceUnavailableException('AI 服务未配置');
    let text = '';
    try {
      const resp = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SUGGEST_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: `任务需求: ${description}\n\n按 schema 输出 JSON。` }],
        }],
      });
      text = (resp.content[0] as any).text ?? '';
    } catch (e: any) {
      this.logger.error(`MiniMax API 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    const parsed = this.parseJson(text);
    if (!parsed) {
      this.logger.warn(`AI 输出无法解析: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI 返回格式异常');
    }
    const validated = validateTaskSpec(parsed);
    this.logger.log(`suggestTask by admin ${adminId} → ${Object.keys(validated).join(',')}`);
    return validated as Prisma.JsonObject;
  }

  /**
   * 模型返的 text 可能是 ```json {...} ``` 包裹或纯 JSON, 这里 extract
   */
  private parseJson(text: string): any {
    // 1) 尝试整体 parse
    let trimmed = text.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) trimmed = fenceMatch[1].trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // 2) 尝试抓第一个 {...}
      const objMatch = trimmed.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch { /* fallthrough */ }
      }
      return null;
    }
  }
}