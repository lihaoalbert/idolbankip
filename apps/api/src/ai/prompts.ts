/**
 * #30.6.15 AI 图生成专用提示词 — 通义万相 (DashScope)
 *
 * 设计原则:
 * - 写死中文 + 强约束 (避免 prompt 漂移)
 * - 必须保留"严格按参考图片" + "纯白/纯透明背景" 这两条, 不然出图会偏
 * - 表情矩阵 9 宫格列出 9 个表情, 通义对枚举列表的命中率高
 *
 * 拼接规则 (在 ai.service.generateImage 里):
 *   finalPrompt = IMAGE_GEN_PROMPTS[imageType] + "\n\n人物小传:\n" + ip.description + "\n\n角色名: " + ip.displayName
 *
 * 为什么不传参考图给通义:
 * - 通义万相 text2image 接口当前不支持图生图 (image2image 是另一个端点, 另收费)
 * - 把面部特征 + 服装 写在文字 prompt 里, 让通义按文字约束出图
 * - 创作者可在 lightbox 里看效果, 不满意就重生成
 */

import { AssetType } from '@prisma/client';

export const IMAGE_GEN_PROMPTS: Record<AssetType, string> = {
  THREE_VIEW: `16:9 横版构图,角色严格按照参考图片。左侧1/3区域为超大高清面部特写,右侧2/3区域整齐排布角色三张全身三视图,包含角色的正面(Front)、侧面(Profile)及背面(Back)三个维度的全身站姿视图。背景为纯白色背景。视觉对齐:所有角度的比例必须严格一致,确保角色身高、五官位置、服装褶皱在不同视角下完美契合。`,

  EXPRESSION_GRID: `3x3 九宫格布局,展示角色 9 种基础表情(开心、悲伤、愤怒、惊讶、平静、害羞、思考、厌恶、兴奋)。每个表情格大小一致,纯白背景,角色头部正面,表情清晰可辨,所有格使用同一人物造型与服装风格。`,

  TRANSPARENT_RENDER: `PNG 格式带透明背景。单一角色全身正面立绘,身体自然放松站姿,双手自然下垂或交叉于身前。角色服装、姿态与参考面部特写保持一致。背景必须为纯透明(alpha=0),无阴影、无反光、无杂物,便于后续二次合成。`,

  // 面部特写/小传/LoRA 等不参与 AI 生成, 给个 placeholder 防 TS 报错
  FACE_CLOSEUP: '',
  BIO_TXT: '',
  RECIPE_TXT: '',
  LORA_FILE: '',
  VOICE_REF: '',
  PACKAGE_ZIP: '',
  TEST_SAMPLE: '',
  LEGAL_PROOF: '',
  PROCESS_EVIDENCE: '',
};

// 通义万相模型输出尺寸 — 16:9 横版给三视图用, 正方形给表情矩阵/立绘用
export const IMAGE_GEN_SIZES: Record<AssetType, string> = {
  THREE_VIEW: '1280*720',     // 16:9
  EXPRESSION_GRID: '1024*1024', // 方形
  TRANSPARENT_RENDER: '1024*1024', // 方形 (立绘常用)
  FACE_CLOSEUP: '',
  BIO_TXT: '',
  RECIPE_TXT: '',
  LORA_FILE: '',
  VOICE_REF: '',
  PACKAGE_ZIP: '',
  TEST_SAMPLE: '',
  LEGAL_PROOF: '',
  PROCESS_EVIDENCE: '',
};

// #30.6.16 RECIPE_TXT AI 生成 — 用 MiniMax M3 (Anthropic 协议) 写 prompt 说明书
// 输出 markdown, 买家拿去 ComfyUI / SD WebUI 直接复现
export const RECIPE_SYSTEM_PROMPT = `你是 ibi.ren 平台的 LoRA / Prompt 说明书写作助手, 为一个虚拟人 IP 写一份给买家用的 \`.md\` 文档。

文档结构 (严格按顺序, 简洁但专业):
# 角色名 (种族-性别-年龄段-姓名, 跟用户提供的完全一致)

## 角色档案
- 性别 / 年龄段 / 种族 / 风格标签 / 场景标签 (一行一个)
- 2-3 句话人物小传 (基于用户提供的 description)

## 推荐基础模型
- Base model: SDXL 1.0 / FLUX.1-dev / 其它 (选 1 个, 给理由)
- 配套 VAE / CLIP: (按 base model 默认即可, 不用写)

## 正向 Prompt (主)
\`\`\`
masterpiece, best quality, 1girl/1boy, [角色核心特征 prompt 关键词],
[服装 prompt], [场景 prompt]
\`\`\`
(中文注释: 哪些 tag 是必须保留的, 哪些可换)

## 反向 Prompt
\`\`\`
lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry
\`\`\`

## 推荐采样参数
- Sampler: DPM++ 2M Karras (SDXL) / Euler (FLUX)
- Steps: 30-40
- CFG Scale: 7
- Size: 1024x1024 (基础) / 1280x720 (横版) / 720x1280 (竖版)
- Clip skip: 2 (SDXL) / N/A (FLUX)

## LoRA 推荐强度
- 主 LoRA 强度: 0.7-0.85
- 风格 LoRA 强度: 0.3-0.5 (按需叠加)

## 三视图 / 立绘 / 表情矩阵 出图 prompt 模板
(给买家用本 IP 已有素材的快速出图 prompt, 每个图位一段)

## 注意事项
- 本 IP 的脸部特征 (脸型/肤色/眼型 等) 复现要点
- 服装 / 配饰的硬约束 (不能漏的)

规则:
- 整篇输出纯 markdown, 不要 JSON 包裹, 不要 \`\`\`markdown 围栏
- 中文为主, prompt 关键词用英文 (Stable Diffusion 社区惯例)
- 总长 800-1500 字
- 不要出现 "根据你提供的信息" 这类废话, 直接给文档
- 用分点列表组织, 不要大段流水文`;