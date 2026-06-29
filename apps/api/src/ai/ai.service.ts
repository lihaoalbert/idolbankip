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
import { HonorAction } from '@prisma/client';
import { HonorService } from '../honor/honor.service';
import { AssetType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { DashScopeProvider } from './dashscope.provider';
import { LlmConfigService } from '../llm-config/llm-config.service';
import {
  ipWizardFields,
  adminTaskFields,
  validateIpWizardFields,
  validateTaskSpec,
} from './field-meta';
import { IMAGE_GEN_PROMPTS, IMAGE_GEN_SIZES, RECIPE_SYSTEM_PROMPT } from './prompts';
import { AI_GENERATABLE_ASSET_TYPES } from './dto/generate-image.dto';

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

// ===================== Track B: Blueprint 反推 prompt =====================
// 给 MiniMax M3 (Anthropic 协议兼容) 用 — 从一张人脸图反推 L1-L6 6 层 46 字段
// 复用现有 Anthropic client + model(recognizeFace 同款)
//
// Qwen-VL-Plus 实战:6/46 命中(13%)— 关键特征(脸型/眼型/鼻梁/唇厚/发型)全军覆没
// 改用 Claude 系后:schema 跟得住 + 真看图;但 prompt 仍需强调"看清图再写"
const BLUEPRINT_FACE_SYSTEM_PROMPT = `你是 ibi.ren 平台的人脸特征提取专家。用户上传一张人脸参考图,你需要从中提取 L1-L6 共 6 层 46 个数值/枚举字段,严格按 JSON schema 返回。

## 关键原则 (重要!)
- **仔细看图再写** — 脸型/眼型/鼻梁高度/唇厚/发型,这些是创作者最关心的。宁可标"看不清"也不要把所有人都猜成"中位默认值"。
- **数值字段给出你的真实估计** — 0.0~1.0 表示"该特征在人群中的相对位置"。例如:眼裂高度 0.7 表示眼裂偏大,0.3 表示偏小;不是"信息不足就填 0.5"。
- **枚举字段选最接近的** — 严格用 schema 给的选项,不允许自创值。
- **6 层全部输出** — 即使某些层你不确定,也要给一个合理猜测(基于同图其他层信息推断)。

## 严格规则
1. **只返回 JSON**,不要任何解释/前后缀/markdown 包裹
2. 数值字段严格在 [0, 1] (faceIndex 例外,在 [1.0, 1.6])
3. 枚举字段必须用 schema 里的选项字面量
4. 同一张图内部要自洽(例如:高眉弓 + 浓眉,发际线位置和头发长度协调)

## Schema

L1_skeleton (颅骨,9 字段):
- gender: "male" | "female"
- craniumShape: "long"(长颅) | "medium" | "round"(圆颅) | "flat"(扁颅)
- faceIndex: 1.0~1.6 脸长/脸宽(< 1.15 圆脸,1.15~1.35 标准,> 1.35 长脸)
- cheekboneWidth: 0~1 颧骨相对头宽
- cheekboneProminence: 0~1 颧骨突出度
- jawWidth: 0~1 下颌宽
- jawAngle: "sharp"(V 脸) | "medium" | "soft"(U 脸)
- upperThirdRatio: 0~1 额高三停占比
- midThirdRatio: 0~1 眉心到鼻底

L2_softTissue (软组织,6 字段,0~1):
- subcutaneousFat 皮下脂肪
- masseter 咬肌发达度
- buccalFat 苹果肌
- eyeSocketDepth 眼窝深浅
- browRidge 眉弓突出度
- nasolabialFold 法令纹

L3_features (五官定位,12 字段):
- eyeDistance: 0~1 瞳距(0=近,1=远)
- eyeShape: "single" | "inner" | "double" | "phoenix"(丹凤眼,眼尾上扬) | "round" | "narrow"
- eyeApertureHeight: 0~1 眼裂高度
- noseLength: 0~1
- noseWidth: 0~1
- noseBridge: "high"(希腊鼻/高鼻梁) | "medium" | "low"(山根低)
- lipWidth: 0~1 唇宽
- lipThickness: 0~1 唇厚(0=薄,1=厚)
- earPosition: 0~1
- earSize: 0~1
- philtrumLength: 0~1 人中
- chinProtrusion: 0~1 下巴前凸

L4_skin (皮肤,6 字段):
- skinTone: "fair" | "light" | "medium" | "olive" | "tan" | "brown" | "dark"
- skinTexture: "smooth" | "normal" | "rough" | "matte" | "oily"
- freckles: 0~1
- moles: 0~1
- wrinkles: 0~1
- pores: 0~1

L5_hair (毛发,8 字段):
- hairStyle: "straight_long" | "straight_short" | "wavy" | "curly" | "ponytail" | "bob" | "bald"
- hairColor: "black" | "brown" | "blonde" | "red" | "silver" | "gray" | "highlight"
- hairline: "high" | "medium" | "low" | "m_shape"
- browShape: "straight"(一字眉) | "arched"(弓形) | "upward" | "downward"(八字眉,眉尾低) | "thick" | "thin"
- browColor: "black" | "brown" | "gray" | "same_as_hair"
- browDensity: 0~1 眉密度
- lashes: "long_dense" | "short_dense" | "long_sparse" | "short_sparse"
- sideburns: 0~1 鬓角

L6_decoration (修饰,6 字段):
- makeup: "none" | "natural" | "light" | "heavy" | "costume"
- lipColor: "natural" | "red" | "pink" | "orange" | "nude" | "dark"
- blush: 0~1 腮红
- eyeshadow: 0~1 眼影
- accessory: "none" | "earrings" | "necklace" | "headband" | "mask" | "glasses"
- facePaint: 0~1

## 输出示例 (亚洲男性,25 岁,窄长脸,丹凤眼,希腊鼻,薄唇,有刘海)
{
  "L1_skeleton": {"gender":"male","craniumShape":"long","faceIndex":1.45,"cheekboneWidth":0.55,"cheekboneProminence":0.5,"jawWidth":0.5,"jawAngle":"sharp","upperThirdRatio":0.35,"midThirdRatio":0.35},
  "L2_softTissue": {"subcutaneousFat":0.3,"masseter":0.5,"buccalFat":0.3,"eyeSocketDepth":0.6,"browRidge":0.6,"nasolabialFold":0.1},
  "L3_features": {"eyeDistance":0.5,"eyeShape":"phoenix","eyeApertureHeight":0.5,"noseLength":0.65,"noseWidth":0.35,"noseBridge":"high","lipWidth":0.45,"lipThickness":0.2,"earPosition":0.5,"earSize":0.5,"philtrumLength":0.5,"chinProtrusion":0.4},
  "L4_skin": {"skinTone":"light","skinTexture":"normal","freckles":0.0,"moles":0.05,"wrinkles":0.05,"pores":0.2},
  "L5_hair": {"hairStyle":"straight_short","hairColor":"black","hairline":"medium","browShape":"downward","browColor":"black","browDensity":0.6,"lashes":"long_dense","sideburns":0.2},
  "L6_decoration": {"makeup":"none","lipColor":"natural","blush":0.0,"eyeshadow":0.0,"accessory":"none","facePaint":0.0}
}`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  /**
   * Anthropic client 按 configId 缓存. 切换 active 后:
   *   - 旧 configId 对应的 client 实例还在这里, 旧请求 in-flight 仍用它 (不会被打断)
   *   - 新请求解析的 configId 不同, 走新 client (新建)
   *   - 配置被删除时不会清缓存 (无害: GC 会收)
   *
   * 容量: 配置数量按个位数算, Map 永远 < 10 项, 无需 LRU.
   */
  private clientCache = new Map<string, Anthropic>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly dashscope: DashScopeProvider,
    private readonly honor: HonorService,
    private readonly llmConfig: LlmConfigService,
  ) {}

  /**
   * 取当前 active 的 Anthropic client + model. 内部缓存 client per configId.
   * 找不到 active 且 env 没 fallback → throw ServiceUnavailableException (前端 503)
   */
  private async getClient(): Promise<{ client: Anthropic; model: string; configId: string }> {
    const cfg = await this.llmConfig.getActive();
    let client = this.clientCache.get(cfg.configId);
    if (!client) {
      client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
      this.clientCache.set(cfg.configId, client);
      this.logger.log(
        `LLM client built: source=${cfg.source} configId=${cfg.configId} ` +
        `provider=${cfg.provider} model=${cfg.model} displayName=${cfg.displayName}`,
      );
    }
    return { client, model: cfg.model, configId: cfg.configId };
  }

  /**
   * 创作者侧: 面部特写图 → IP 元数据
   */
  async recognizeFace(creatorId: string, fileId: string): Promise<Prisma.JsonObject> {
    const { client, model } = await this.getClient();
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
      const resp = await client.messages.create({
        model,
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
      this.logger.error(`LLM API 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    const parsed = this.parseJson(text);
    if (!parsed) {
      this.logger.warn(`AI 输出无法解析: ${text.slice(0, 300)}`);
      throw new ServiceUnavailableException('AI 返回格式异常');
    }
    const validated = validateIpWizardFields(parsed);
    this.logger.log(`recognizeFace: ${fileId} → ${Object.keys(validated).join(',')}`);

    // 荣誉流水 — AI 面部识别 +20 (不 await, 失败不影响主流程)
    this.honor.record(creatorId, HonorAction.AI_RECOGNIZE, {
      refType: 'IpFile',
      refId: fileId,
    }).catch((e) =>
      this.logger.warn(`honor record (AI_RECOGNIZE) failed: ${e?.message ?? e}`),
    );

    return validated as Prisma.JsonObject;
  }

  /**
   * Track B: Blueprint 参考图反推 — 从一张人脸图反推 L1-L6 6 层 46 字段
   *
   * 复用当前 active 的 Anthropic client (同 recognizeFace 的来源, 通过 getClient 拿)。
   * 区别:接收 buffer+mime(由 controller 端 base64 解码得到),不读 OSS,不走 prisma。
   *
   * 失败语义:
   * - 网络/限流:throw ServiceUnavailableException(让上层包成 503)
   * - JSON 解析失败:throw 出去(由调用方负责把 status code 转 422)
   *
   * @returns 原始 JSON 字符串(由 BlueprintService 解析 + 严格 schema 校验)
   */
  async analyzeBlueprintFace(buffer: Buffer, mime: 'image/jpeg' | 'image/png' | 'image/webp'): Promise<string> {
    const { client, model } = await this.getClient();
    const resp = await client.messages.create({
      model,
      max_tokens: 4096, // 46 字段 × 描述,留余量
      system: BLUEPRINT_FACE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } },
          { type: 'text', text: '从这张人脸图反推 L1-L6 6 层 46 字段,严格按 system 里的 schema 输出 JSON。' },
        ],
      }],
    });
    const text = (resp.content[0] as any).text ?? '';
    this.logger.log(`analyzeBlueprintFace: model=${model} textLen=${text.length}`);
    return text;
  }

  /**
   * admin 侧: 任务描述 → 任务 spec
   */
  async suggestTask(adminId: string, description: string): Promise<Prisma.JsonObject> {
    const { client, model } = await this.getClient();
    let text = '';
    try {
      const resp = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SUGGEST_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: `任务需求: ${description}\n\n按 schema 输出 JSON。` }],
        }],
      });
      text = (resp.content[0] as any).text ?? '';
    } catch (e: any) {
      this.logger.error(`LLM API 失败: ${e?.message || e}`);
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
   * #30.6.15 创作者侧: 面部特写 + 人物小传 → AI 生成 三视图 / 立绘 / 表情矩阵
   *
   * 流程:
   *   1. 验证 IP 归属 + 状态必须是 PENDING_REVIEW (已提交审核不能改)
   *   2. 验证 imageType 是 3 种允许的 AI 生成类型之一
   *   3. 取面部特写 file (必须存在, 否则 400)
   *   4. 拼 prompt (专用提示词 + 人物小传 + 角色名)
   *   5. 调 DashScope.imageGen → 拿到 buffer + mime
   *   6. 上传到 private bucket (走专用目录 ips/{code}/ai/{type}/{ts}.{ext})
   *   7. 写 IpFile (isAiGenerated=true, aiPrompt=完整 prompt)
   *   8. 异步缩略图(若还没生成过)
   *
   * 失败: 503 (服务暂不可用) / 400 (参数) / 403 (无权限) / 404 (IP/文件)
   */
  async generateImage(
    creatorId: string,
    ipId: string,
    imageType: AssetType,
    size?: string,
    promptOverride?: string,
  ): Promise<{ fileId: string; assetType: AssetType; ossKey: string }> {
    if (!this.dashscope.isConfigured()) {
      throw new ServiceUnavailableException('AI 图生成服务未配置 (DASHSCOPE_API_KEY / DASHSCOPE_HOST 缺失)');
    }
    if (!(AI_GENERATABLE_ASSET_TYPES as readonly AssetType[]).includes(imageType)) {
      throw new BadRequestException(`仅支持 AI 生成: ${AI_GENERATABLE_ASSET_TYPES.join(', ')}`);
    }
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此 IP');
    // 允许 PENDING_REVIEW / PUBLIC_INTENT / OFFICIAL_REGISTERED 状态 (创作者总能补图)
    // 仅拒绝 REVIEWED_PROOFING (审核中, 等审完再补) / REJECTED (被拒) / ARCHIVED (归档)
    if (!['PENDING_REVIEW', 'PUBLIC_INTENT', 'OFFICIAL_REGISTERED'].includes(ip.status)) {
      throw new BadRequestException(`当前 IP 状态 ${ip.status} 不允许 AI 生成, 仅 PENDING_REVIEW/PUBLIC_INTENT/OFFICIAL_REGISTERED 可用`);
    }
    // 面部特写是参考基准 — 没有就不能 AI 生成
    const faceCloseupId = ip.faceCloseupFileId;
    if (!faceCloseupId) {
      throw new BadRequestException('请先上传【面部特写】, AI 生成需要面部特写作为参考');
    }
    const faceFile = await this.prisma.ipFile.findUnique({ where: { id: faceCloseupId } });
    if (!faceFile) throw new NotFoundException('面部特写文件不存在');

    // 拼 prompt: 专用提示词 + 人物小传 + 角色名
    const basePrompt = IMAGE_GEN_PROMPTS[imageType];
    if (!basePrompt) {
      throw new BadRequestException(`未配置 ${imageType} 的 AI 提示词`);
    }
    const desc = (ip.description || '').trim() || '(无)';
    const fullPrompt = promptOverride?.trim()
      ? promptOverride
      : `${basePrompt}\n\n人物小传:\n${desc}\n\n角色名: ${ip.displayName}`;

    // 调通义万相
    const t0 = Date.now();
    const { buffer, mime } = await this.dashscope.imageGen({
      prompt: fullPrompt,
      // 优先用前端传的 size, 否则用 prompts.ts 的默认值
      size: size || IMAGE_GEN_SIZES[imageType] || undefined,
    });
    const ms = Date.now() - t0;
    this.logger.log(`AI image gen done: ipId=${ipId} type=${imageType} ms=${ms} bytes=${buffer.length} mime=${mime}`);

    // 上传到 private bucket — 走专用目录便于区分 AI / 用户上传
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `ips/${ip.code}/ai/${imageType}/${Date.now()}.${ext}`;
    await this.upload.uploadPrivate(key, buffer);

    // 写 IpFile 行
    const file = await this.prisma.ipFile.create({
      data: {
        ipId,
        assetType: imageType,
        originalName: `ai_${imageType.toLowerCase()}_${Date.now()}.${ext}`,
        ossKey: key,
        sizeBytes: BigInt(buffer.length),
        mimeType: mime,
        // AI 生成的图不需要再做 sharp 尺寸校验 (生成时尺寸已知) — 跳过 deepValidate
        checksumSha256: '', // ETag 需要 OSS 回调才拿得到, 这里先空
        validated: true, // 通义万相返回的图片本身就是合规的, 标记 validated
        isAiGenerated: true,
        aiPrompt: fullPrompt,
      },
    });

    // 异步生成缩略图 (face closeup 不抢缩略图, 除非当前 ip 没有 thumbnailKey)
    if (!ip.thumbnailKey) {
      this.upload.generateThumbnailFromOssKey(ip.code, key, file.originalName).catch((e: any) =>
        this.logger.warn(`AI gen thumbnail regen failed for ${ip.code}: ${e?.message ?? e}`),
      );
    }

    // 荣誉流水 — AI 生成图各类型 +20
    const aiActionMap: Partial<Record<AssetType, HonorAction>> = {
      [AssetType.THREE_VIEW]: HonorAction.AI_GEN_THREE_VIEW,
      [AssetType.TRANSPARENT_RENDER]: HonorAction.AI_GEN_RENDER,
      [AssetType.EXPRESSION_GRID]: HonorAction.AI_GEN_EXPRESSION,
    };
    const honorAction = aiActionMap[imageType];
    if (honorAction) {
      this.honor.record(creatorId, honorAction, {
        refType: 'IpFile',
        refId: file.id,
        metadata: { ipCode: ip.code, assetType: imageType, ai: true },
      }).catch((e) =>
        this.logger.warn(`honor record (${honorAction}) failed: ${e?.message ?? e}`),
      );
    }

    return { fileId: file.id, assetType: imageType, ossKey: key };
  }

  /**
   * #30.6.16 AI 生成 RECIPE_TXT (Prompt 说明书 .md)
   * 流程: 拼 IP 上下文 → 调 MiniMax M3 → 写 .md 到 OSS → 写 IpFile
   * 不需要面部特写参考 (纯文本生成)
   * 复用现有 MiniMax client (recognizeFace 同款)
   */
  async generateRecipe(creatorId: string, ipId: string): Promise<{ fileId: string; assetType: AssetType; ossKey: string }> {
    const { client, model } = await this.getClient();
    const ip = await this.prisma.ipAsset.findUnique({ where: { id: ipId } });
    if (!ip) throw new NotFoundException('IP 不存在');
    if (ip.creatorId !== creatorId) throw new ForbiddenException('无权操作此 IP');
    if (!['PENDING_REVIEW', 'PUBLIC_INTENT', 'OFFICIAL_REGISTERED'].includes(ip.status)) {
      throw new BadRequestException(`当前 IP 状态 ${ip.status} 不允许 AI 生成, 仅 PENDING_REVIEW/PUBLIC_INTENT/OFFICIAL_REGISTERED 可用`);
    }
    // faceTags (Prisma Json) — 安全 stringify
    const faceTagsText = Array.isArray(ip.faceTags)
      ? (ip.faceTags as any[]).map((t) => `${t.category}: ${t.value}`).join(', ')
      : '无';

    // styleTags / scenarioTags 可能是逗号分隔 String 或 string[] (loadIp 已 normalize 为 array 但这里 DB 直读)
    const styleTags = (ip.styleTags || '').toString();
    const scenarioTags = (ip.scenarioTags || '').toString();

    const userMsg = `角色名: ${ip.displayName}
性别: ${ip.gender}
年龄段: ${ip.ageBucket}
种族: ${ip.ethnicity || '未指定'}
风格标签: ${styleTags || '无'}
场景标签: ${scenarioTags || '无'}
脸特征: ${faceTagsText}

人物小传 (description):
${ip.description}

请按 schema 输出完整 markdown 文档。`;

    const t0 = Date.now();
    let text = '';
    try {
      const resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system: RECIPE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      });
      text = (resp.content[0] as any).text ?? '';
    } catch (e: any) {
      this.logger.error(`LLM recipe gen 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
    const ms = Date.now() - t0;
    this.logger.log(`AI recipe gen done: ipId=${ipId} ms=${ms} bytes=${text.length}`);

    // 写到 private bucket
    const buf = Buffer.from(text, 'utf-8');
    const key = `ips/${ip.code}/ai/RECIPE_TXT/${Date.now()}.md`;
    await this.upload.uploadPrivate(key, buf);

    // 写 IpFile 行
    const file = await this.prisma.ipFile.create({
      data: {
        ipId,
        assetType: AssetType.RECIPE_TXT,
        originalName: `ai_recipe_${Date.now()}.md`,
        ossKey: key,
        sizeBytes: BigInt(buf.length),
        mimeType: 'text/markdown',
        checksumSha256: '',
        validated: true,
        isAiGenerated: true,
        aiPrompt: RECIPE_SYSTEM_PROMPT.slice(0, 500) + '...', // 截短, 完整 prompt 在 system 端
      },
    });

    // 荣誉流水 — AI 生成说明书 +10
    this.honor.record(creatorId, HonorAction.AI_GEN_RECIPE, {
      refType: 'IpFile',
      refId: file.id,
      metadata: { ipCode: ip.code, ai: true },
    }).catch((e) =>
      this.logger.warn(`honor record (AI_GEN_RECIPE) failed: ${e?.message ?? e}`),
    );

    return { fileId: file.id, assetType: AssetType.RECIPE_TXT, ossKey: key };
  }

  /**
   * 通用 chat — 复用 active Anthropic client, 接受自定义 system prompt + 多轮 messages。
   * 用于 AssistantModule 的只读型助手 (assistant.service)。
   *
   * 不主动 parseJson — 调用方自己解析返回。
   * 失败语义: 网络/限流 throw ServiceUnavailableException (上层包 503)。
   */
  async chat(opts: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    maxTokens?: number;
  }): Promise<{ text: string; model: string; latencyMs: number }> {
    const { client, model } = await this.getClient();
    const t0 = Date.now();
    try {
      const resp = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.systemPrompt,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = (resp.content[0] as any).text ?? '';
      const latencyMs = Date.now() - t0;
      this.logger.log(`assistant chat: model=${model} in=${opts.messages.length}turns out=${text.length}B ${latencyMs}ms`);
      return { text, model, latencyMs };
    } catch (e: any) {
      this.logger.error(`assistant chat 失败: ${e?.message || e}`);
      throw new ServiceUnavailableException('AI 服务暂不可用, 请稍后再试');
    }
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