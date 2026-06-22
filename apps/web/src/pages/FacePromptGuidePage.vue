<script setup lang="ts">
/**
 * 捏脸提示词教程 — 公开 onboarding 文档
 * 路径: /guide/face
 *
 * 目标: 给老板自己看 + 分享给创作者参考,解决"通用词生成的人像容易侵权"问题。
 * 内容 100% 来自用户给的 Markdown 教程 (《可控面容 AI 人像提示词教程》)。
 */
const version = 'v1.0';
const lastUpdated = '2026-06-22';

// ===================== § 3.1 脸型 =====================
const faceShapes = [
  { label: '鹅蛋脸', desc: '额头宽下颌窄, 线条流畅无棱角', vibe: '古典, 通用' },
  { label: '圆脸', desc: '颧骨和下颌圆润, 脸长 ≈ 脸宽', vibe: '幼态, 亲和' },
  { label: '方脸', desc: '下颌角明显, 额头/颧骨/下颌同宽', vibe: '英气, 中性' },
  { label: '长脸', desc: '脸长 > 脸宽 1.3 倍以上', vibe: '成熟, 清冷' },
  { label: '心形脸', desc: '额头宽 → 颧骨 → 尖下巴', vibe: '精致, 上镜' },
];

// ===================== § 3.2 额发 / 刘海 =====================
const bangs = [
  { label: '无刘海露额头', desc: '发际线整齐', vibe: '成熟, 干练' },
  { label: '齐刘海', desc: '眉毛上方 1cm 横切', vibe: '幼, 减龄' },
  { label: '斜刘海', desc: '一侧长一侧短', vibe: '灵动, 不对称' },
  { label: '中分八字刘海', desc: '两侧弧形垂到颧骨', vibe: '气质, 修饰脸型' },
  { label: '碎刘海', desc: '不规则短碎发', vibe: '自然, 文艺' },
];

// ===================== § 3.3 眉毛 =====================
const eyebrows = [
  { label: '平直眉', desc: '眉头眉尾同高', vibe: '英气, 中性' },
  { label: '柳叶眉', desc: '眉峰圆弧, 弯细长', vibe: '古典, 温婉' },
  { label: '标准眉', desc: '微挑, 眉头粗眉尾细', vibe: '通用, 平衡' },
  { label: '欧式挑眉', desc: '眉峰高且靠后', vibe: '气场, 立体' },
  { label: '粗平眉 (韩式)', desc: '整体粗且平', vibe: '温柔, 减龄' },
  { label: '细弯眉', desc: '细且上挑', vibe: '妩媚, 复古' },
  { label: '剑眉', desc: '浓黑直且上扬', vibe: '英气, 男相' },
  { label: '野生眉', desc: '杂毛自然生长', vibe: '原生, 文艺' },
];

// ===================== § 3.4 眼睛 (四维组合) =====================
const eyeShapes = [
  { label: '杏眼', desc: '眼大且圆, 内双或外双', vibe: '可爱, 通用' },
  { label: '丹凤眼', desc: '眼尾上挑细长', vibe: '妩媚, 古典' },
  { label: '桃花眼', desc: '眼大且眼尾略弯下', vibe: '多情, 故事感' },
  { label: '瑞凤眼', desc: '细长内双', vibe: '贵气, 东方' },
  { label: '柳叶眼', desc: '形似柳叶, 中等大小', vibe: '温婉, 传统' },
  { label: '圆眼', desc: '眼裂高且圆', vibe: '幼, 减龄' },
  { label: '细长眼', desc: '眼裂窄且长', vibe: '精明, 成熟' },
];
const doubleEyelidTypes = [
  { label: '平行', desc: '内外同宽, 时尚' },
  { label: '新月', desc: '中间宽两头窄, 古典' },
  { label: '开扇', desc: '内窄外宽, 自然' },
  { label: '欧式大双', desc: '宽且深, 立体, 慎用易失真' },
];
const pupilColors = ['深棕', '浅棕', '琥珀', '灰蓝 (罕见, 需配合风格)'];
const eyeDistance = ['宽眼距 (呆萌)', '标准', '窄眼距 (精明)'];

// ===================== § 3.5 鼻子 =====================
const noseShapes = [
  { label: '高鼻梁 + 窄鼻翼', desc: '立体', vibe: '成熟, 上镜' },
  { label: '中等鼻梁 + 标准鼻翼', desc: '通用', vibe: '自然' },
  { label: '低鼻梁 + 圆鼻头', desc: '幼态', vibe: '减龄' },
  { label: '鹰钩鼻', desc: '鼻梁中部隆起', vibe: '英气 / 反派' },
  { label: '蒜头鼻', desc: '鼻翼肥厚', vibe: '敦厚, 个性' },
  { label: '希腊鼻', desc: '鼻梁直挺无明显鼻节', vibe: '精致' },
];

// ===================== § 3.6 嘴唇 =====================
const lipShapes = [
  { label: '薄唇', desc: '上下唇薄', vibe: '冷淡, 高级' },
  { label: '厚唇', desc: '上下唇饱满', vibe: '性感, 欧美' },
  { label: '标准唇', desc: '上下唇 1:1.2', vibe: '通用' },
  { label: 'M 型唇', desc: '上唇有明显唇珠', vibe: '精致, 上镜' },
  { label: '花瓣唇', desc: '唇角微微上翘', vibe: '甜美' },
  { label: '樱桃小嘴', desc: '整体小巧', vibe: '古典' },
  { label: '微笑唇', desc: '静止时嘴角略上扬', vibe: '亲和, 治愈' },
  { label: '下挂唇', desc: '嘴角略下垂', vibe: '忧郁, 严肃' },
];

// ===================== § 3.7 肤色 =====================
const skinTones = [
  { label: '冷白皮', desc: '粉调白, 不易晒黑', note: '慎用"瓷白/无瑕", 易失真' },
  { label: '暖黄皮', desc: '黄调均匀, 大众肤色', note: '最安全, 训练集多' },
  { label: '自然健康', desc: '略带日晒后的蜜色', note: '通用, 自然' },
  { label: '小麦色', desc: '明显日晒', note: '运动感, 健康' },
  { label: '瓷白', desc: '极白无瑕', note: '易失真/塑料感, 慎用' },
  { label: '古铜', desc: '深棕调', note: '异域, 戏剧' },
];

// ===================== § 3.8 表情 / 眼神 (自由组合) =====================
const gazes = ['平视', '看向镜头', '侧视', '俯视', '仰视', '看远方'];
const emotions = ['平静', '微笑', '严肃', '思考', '沉思', '微笑但眼神忧郁', '好奇', '冷峻'];
const mouthActions = ['闭合', '微笑露齿', '抿嘴', '张嘴说话', '咬唇'];

// ===================== § 4 服装 / 环境 / 光照 / 镜头 =====================
const clothing = {
  '领口': ['圆领', 'V 领', '高领', '一字领', '抹胸', '衬衫领', '西装领'],
  '袖型': ['无袖', '短袖', '长袖', '喇叭袖', '泡泡袖', '灯笼袖'],
  '材质': ['棉麻', '丝绸', '羊绒', '雪纺', '皮革', '牛仔', '针织'],
};
const envIndoor = ['咖啡馆', '办公室', '居家书房', '卧室', '厨房', '图书馆', '老式客厅'];
const envOutdoor = ['公园', '樱花树下', '海边', '街道', '城市夜景', '山间小路', '老巷子'];
const bgElements = ['窗帘', '落地窗', '书架', '绿植', '砖墙', '霓虹灯', '远处山峰'];

const lighting = [
  { label: '蝴蝶光', desc: '主光从正前方 45° 向下', use: '商业肖像, 显瘦' },
  { label: '伦勃朗光', desc: '侧光在脸颊形成三角光区', use: '男士, 戏剧感' },
  { label: '环形光', desc: '鼻影呈环形', use: '时尚 / 美容' },
  { label: '窗光', desc: '窗户自然光', use: '自然, 文艺' },
  { label: '黄金时刻', desc: '日出后 / 日落前 1 小时', use: '户外, 暖调' },
  { label: '蓝色时刻', desc: '日落后 30 分钟', use: '城市夜景' },
  { label: '顶光', desc: '从上往下', use: '神秘, 戏剧' },
  { label: '逆光 / 轮廓光', desc: '从背后打', use: '发丝勾边, 梦幻' },
];

const focalLengths = [
  { label: '85mm f/1.4', use: '标准人像, 背景虚化强 (默认推荐)' },
  { label: '50mm f/1.8', use: '自然透视, 接近人眼' },
  { label: '35mm', use: '环境人像, 露更多背景' },
  { label: '135mm', use: '远距离压缩感, 高级商业' },
];
const grading = [
  { label: '胶片感', examples: '富士色调 / Kodak Portra 400 / 浅颗粒 / 漏光' },
  { label: '写实', examples: 'photorealistic / 高清摄影 / RAW' },
  { label: '修饰肤质', examples: 'airbrush skin / smooth skin / porcelain skin' },
  { label: '氛围', examples: 'cinematic / moody / dreamy / ethereal' },
];

// ===================== § 5 平台差异 =====================
const platforms = [
  {
    name: 'Midjourney',
    style: '英文 tag, 逗号分隔, --ar 3:4 控制比例, --style raw 更写实',
    caveats: '中文效果差, 必须翻译成英文',
  },
  {
    name: 'Stable Diffusion (SD/ComfyUI)',
    style: '自然语言 + 权重 (word:1.3), 配合 LoRA',
    caveats: '需负面提示词, 显存够才能出高清',
  },
  {
    name: '即梦 / 豆包 / Kling',
    style: '中文自然语言最有效, 段落式',
    caveats: '描述具体场景比堆关键词好, 别用 masterpiece, best quality 这类英文',
  },
  {
    name: 'DALL-E 3',
    style: '详细自然语言 (中英文都行), 像跟人描述',
    caveats: '拒绝生成真人脸, 适合风格化肖像',
  },
  {
    name: 'Suno / Runway',
    style: '—',
    caveats: '视频 / 音频生成, 本教程不涉及',
  },
];

// ===================== § 6 实战示例 =====================
const examples = [
  {
    id: 'ex-1',
    stamp: 'EX 01',
    tagline: '文艺清冷女',
    title: '长脸 + 圆钝下颌 — 反差混搭',
    zh: `28 岁东亚女性,

脸型: 长脸, 额头饱满, 下颌线清晰但略圆钝, 显清冷,
额发: 中分八字刘海, 两侧弧形垂到颧骨,
眉毛: 柳叶眉, 眉峰圆润, 颜色深棕,
眼睛: 杏眼, 新月形双眼皮, 瞳孔深棕, 眼距标准,
鼻子: 中等鼻梁, 鼻翼不宽, 鼻尖圆润,
嘴唇: 标准唇, 嘴角略上翘, 浅哑光豆沙色,
肤色: 冷白皮, 肤质细腻有透明感,

表情: 平视镜头, 眼神安静略带疏离, 嘴闭合,
服装: 浅灰色高领羊绒衫,
环境: 室内, 浅米色窗帘背景,
光照: 左侧窗户自然光,
镜头: 85mm f/1.4, 浅景深,
色调: 富士胶片, 浅冷调, 写实摄影`,
    en: `28-year-old East Asian woman, long face with rounded jawline, middle-parted curtain bangs, willow leaf eyebrows in dark brown, almond eyes with crescent double eyelid, dark brown pupils, standard eye distance, medium nose bridge with rounded tip, standard lips with slight upturned corners, matte rosewood lip color, cool-toned fair skin with translucent texture, calm slightly distant expression looking at camera, closed mouth, light grey turtleneck cashmere sweater, indoor setting with beige curtain background, natural window light from left, 85mm f/1.4 shallow DOF, Fujifilm color grading, cool tone, photorealistic portrait photography --ar 3:4 --style raw`,
    highlight: '长脸 + 圆钝下颌 = 清冷反差;冷白皮 + 富士胶片 = 文艺氛围;杏眼 + 新月双眼皮 + 柳叶眉 = 古典气质。',
  },
  {
    id: 'ex-2',
    stamp: 'EX 02',
    tagline: '都市干练女',
    title: '窄眼距 + 高鼻梁 + 薄唇 — 三硬特征',
    zh: `35 岁东亚女性,

脸型: 鹅蛋脸, 颧骨略高, 下颌线明显, 显干练,
额发: 无刘海, 短发齐耳, 发际线整齐, 鬓角别在耳后,
眉毛: 标准眉, 略粗, 深棕色,
眼睛: 杏眼, 平行双眼皮, 瞳孔深棕, 眼距略窄 (显精明),
鼻子: 高鼻梁, 鼻翼窄, 鼻尖微翘,
嘴唇: 薄唇, 嘴角平直, 正红哑光唇,
肤色: 暖黄皮, 底妆无瑕哑光,

表情: 平视镜头, 眼神自信坚定, 嘴闭合,
服装: 黑色西装内搭白色真丝衬衫,
环境: 落地窗前, 城市夜景虚化,
光照: 顶部蝴蝶光 + 侧逆光勾边, 棚拍布光,
镜头: 85mm f/1.2, 高清商业修图`,
    en: null,
    highlight: '窄眼距 + 高鼻梁 + 薄唇 = 三硬特征全部上线,气场最强;鹅蛋脸 + 短发 = 现代职业女性标配。',
  },
  {
    id: 'ex-3',
    stamp: 'EX 03',
    tagline: '邻家温柔女',
    title: '宽眼距 + 低鼻梁 + 花瓣唇 — 三软特征',
    zh: `26 岁东亚女性,

脸型: 圆脸, 颧骨和下颌圆润, 显幼态亲和,
额发: 齐刘海, 眉毛上方 1cm,
眉毛: 粗平眉 (韩式), 颜色深棕,
眼睛: 圆眼, 内双, 瞳孔深棕, 眼距略宽 (显呆萌),
鼻子: 低鼻梁, 鼻头圆润,
嘴唇: 花瓣唇, 嘴角自然上翘, 浅水红色,
肤色: 自然健康, 略带日晒后的蜜色,

表情: 看向镜头外右侧, 微笑露齿, 眼神温暖,
服装: 浅粉色针织开衫, 内搭白色 T 恤,
环境: 户外公园, 樱花树背景虚化,
光照: 下午 4 点侧逆光, 暖调,
镜头: 50mm f/1.8, 自然抓拍感`,
    en: null,
    highlight: '宽眼距 + 低鼻梁 + 花瓣唇 = 三软特征凑齐,亲和度拉满;圆脸 + 圆眼 = 显小 5 岁的幼态。',
  },
];

// ===================== § 7 防侵权铁律 =====================
const donts = [
  '不要写"像某某明星/网红" — 模型会直接采样训练集原图, 侵权风险最高',
  '不要写"完美无瑕的瓷白皮/黄金比例脸" — 模型会取训练集里最极端的样本, 容易撞脸',
  '不要堆品牌形容词 — "高级脸 / 高级感 / ins 风 / 杂志封面感" 这些是营销词, 模型不识别, 输出随机',
  '不要只写"漂亮 / 精致 / 有气质" — 训练集里几万张脸都符合, 输出就是平均脸',
  '不要跨 prompt 复用通用段 — "高质量人像, 极致细节, 8K" 这类英文 tag, 国产模型不识别, 国外模型会撞库',
];
const dos = [
  '把模糊词换成可量化特征 (本教程的核心)',
  '矛盾特征混搭 — 例 1 (清冷 + 长脸 + 圆钝下颌), 例 2 (干练 + 鹅蛋 + 窄眼距), 例 3 (温柔 + 圆脸 + 宽眼距)',
  '加环境锚定 — 同一个脸, 换不同光照/镜头/服装, 看起来像"同一个人的不同照片", 是 IP 化的开始',
  '固定 seed — 如果平台支持 (ComfyUI / 即梦高级模式), 固定随机种子 + 微调 prompt, 比每次随机生成稳定',
  '记录 prompt + seed — 每次成功的 prompt 和 seed 记下来, 后续同 IP 出图可以直接复用',
];

// ===================== § 8 进阶用法 =====================
const advanced = [
  {
    title: '8.1 固定面容变量, 只换场景',
    formula: `面容描述 (从例 1-3 复制一份完整的) — 不变
+
[场景 A]: 咖啡馆 + 下午阳光 + 浅景深
[场景 B]: 雨夜街角 + 霓虹灯 + 全身照
[场景 C]: 办公室 + 落地窗 + 半身职业装
[场景 D]: 海边 + 夕阳逆光 + 飘逸长发`,
    note: '配合固定 seed — 即梦 / ComfyUI 支持, 同一张脸会复现, 但场景元素自然变化。',
  },
  {
    title: '8.2 同一人, 不同情绪',
    formula: `面容描述不变
+
[情绪 A]: 微笑露齿, 眼睛弯弯
[情绪 B]: 平视, 表情平静, 眼神略带思考
[情绪 C]: 侧脸 3/4, 低头看手中物品
[情绪 D]: 仰头大笑, 闭眼`,
    note: '适合做表情包 / 头像系列。',
  },
  {
    title: '8.3 同一人, 不同年龄段',
    formula: `面容描述不变, 只调整:
[18 岁]: 婴儿肥, 圆脸明显, 眉眼间距略宽
[28 岁]: 标准面容, 颧骨略高
[40 岁]: 法令纹初现, 眼角细纹, 下颌线略松
[60 岁]: 银发, 皱纹明显, 但保持眼神明亮`,
    note: '适合做人物成长故事 / 品牌时间线。',
  },
];

// ===================== § 9 翻车排查 =====================
const troubleshoots = [
  {
    q: '出来像明星/网红',
    cause: 'prompt 里有"完美脸 / 精致五官"这种空泛词',
    fix: '删除空泛词, 替换成 12 项词典里的具体描述。加矛盾特征 (例: "高颧骨 + 圆下巴")。',
  },
  {
    q: '每次出来都是同一张脸',
    cause: 'seed 固定了, 或 prompt 太短',
    fix: '加矛盾特征 (例: "柳叶眉 + 圆眼" 概率比 "标准眉 + 标准眼" 更独特)。检查平台是否锁了种子。',
  },
  {
    q: '五官扭曲 (眼睛不对称, 嘴巴歪)',
    cause: '描述太多太杂, 模型抓不住主次',
    fix: '简化描述, 一段只写一个主题。例: "脸型" 一段, "表情" 一段, 别混着写。SD 用户加负面提示词 asymmetric eyes, cross-eyed。',
  },
  {
    q: '风格飘忽 (一会儿写实一会儿卡通)',
    cause: '风格词没统一',
    fix: '末尾加一个明确的风格锚, 例如: "写实摄影风格, Canon EOS R5, RAW" 或 "新海诚动画风格, 4K 壁纸" — 别混搭。',
  },
  {
    q: '肤色 / 光照不对',
    cause: '中文 prompt 对"暖光" "冷光" 解析不稳定',
    fix: '改用具体光源 (例: "下午 4 点侧逆光, 黄金时刻色温"), 或加色温数值 ("色温 5500K")。',
  },
  {
    q: '同一人, 脸型不一致',
    cause: '每次生成的随机性',
    fix: '方案 A (简单): 固定 seed + 调小 random 范围 · 方案 B (进阶): 用 LoRA / IP-Adapter 锁定面容 (需要 ComfyUI) · 方案 C (妥协): 接受差异, 选 5 张里最像的, 后续 prompt 强化那部分的描述。',
  },
];

// ===================== § 10 速查卡 =====================
const cheatSheet = {
  faces: [
    { label: '脸型', items: '鹅蛋 / 圆 / 方 / 长 / 心形' },
    { label: '额发', items: '露额 / 齐刘 / 斜刘 / 八字 / 碎刘' },
    { label: '眉形', items: '平直 / 柳叶 / 标准 / 欧挑 / 粗平 / 细弯 / 剑眉 / 野生' },
    { label: '眼型', items: '杏 / 丹凤 / 桃花 / 瑞凤 / 柳叶 / 圆 / 细长' },
    { label: '双眼皮', items: '平行 / 新月 / 开扇 / 欧式' },
    { label: '瞳孔', items: '深棕 / 浅棕 / 琥珀 / 灰蓝' },
    { label: '眼距', items: '宽 / 标 / 窄' },
    { label: '鼻', items: '高窄 / 中标 / 低圆 / 鹰钩 / 蒜头 / 希腊' },
    { label: '唇', items: '薄 / 厚 / 标 / M / 花瓣 / 樱桃 / 微笑 / 下挂' },
    { label: '肤色', items: '冷白 / 暖黄 / 自然 / 小麦 / 瓷白 / 古铜' },
    { label: '情绪', items: '平静 / 微笑 / 严肃 / 思考 / 沉思 / 忧郁 / 好奇 / 冷峻' },
    { label: '眼神', items: '平 / 看镜 / 侧 / 俯 / 仰 / 远方' },
    { label: '嘴动', items: '闭 / 露齿 / 抿 / 张 / 咬' },
  ],
  camera: [
    { label: '镜头', items: '35 / 50 / 85 / 135 (mm)' },
    { label: '光圈', items: 'f/1.2 / f/1.4 / f/1.8 / f/2.8' },
    { label: '光照', items: '蝴蝶 / 伦勃朗 / 环形 / 窗光 / 黄金 / 蓝色 / 顶光 / 逆光' },
    { label: '色调', items: '富士 / Kodak Portra / 胶片 / RAW / 写实 / 电影感' },
  ],
  donts: [
    '像某某明星',
    '完美 / 高级 / ins 风',
    '只写 "漂亮 / 精致"',
    '跨 prompt 复用通用段',
  ],
  dos: [
    '12 项填空替代空泛词',
    '矛盾特征混搭 (原创度关键)',
    '加环境锚定 (形成 IP)',
    '固定 seed + 记录 prompt',
    '段间不混主题, 末尾风格锚定',
  ],
};

// ===================== 目录 (侧边 sticky) =====================
const toc = [
  { id: 'sec-0', no: '§ 0', title: '核心理念' },
  { id: 'sec-1', no: '§ 1', title: '通用结构' },
  { id: 'sec-2', no: '§ 2', title: '12 项填空模板' },
  { id: 'sec-3', no: '§ 3', title: '12 项可控词典' },
  { id: 'sec-4', no: '§ 4', title: '服装环境光照' },
  { id: 'sec-5', no: '§ 5', title: '平台差异' },
  { id: 'sec-6', no: '§ 6', title: '实战示例' },
  { id: 'sec-7', no: '§ 7', title: '防侵权铁律' },
  { id: 'sec-8', no: '§ 8', title: '形成 IP 进阶' },
  { id: 'sec-9', no: '§ 9', title: '翻车排查' },
  { id: 'sec-10', no: '§ 10', title: '一页速查卡' },
  { id: 'sec-11', no: '§ 11', title: '版本' },
];
</script>

<template>
  <div class="bg-cream paper-grain min-h-screen">

    <!-- 顶部条 -->
    <header class="hairline-b border-line sticky top-0 bg-cream/95 backdrop-blur z-30 no-print">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
        <div class="catalog-no text-ink/50">ibi.ren · FACE PROMPT MANUAL</div>
        <div class="catalog-no text-ink/40">VOL. I — PROMPTING</div>
        <div class="catalog-no text-ink/30">VERSION {{ version }}</div>
      </div>
    </header>

    <div class="max-w-[1320px] mx-auto px-6 lg:px-10 grid lg:grid-cols-[1fr_220px] gap-10 py-12">

      <!-- 主内容 -->
      <main>

        <!-- HERO -->
        <header class="mb-12 md:mb-16 no-print">
          <div class="flex items-center justify-between mb-6">
            <div class="catalog-no text-ink/50">№ 200 · FACE PROMPT</div>
            <div class="catalog-no text-ink/30">HANGZHOU · CN</div>
          </div>
          <h1 class="font-display text-4xl md:text-6xl text-ink leading-[0.95]">
            可控面容 <span class="font-display-italic text-gold">提示词</span> 教程
          </h1>
          <p class="mt-6 font-display-italic text-lg text-ink/70 leading-relaxed max-w-2xl">
            通用词生成的人像容易侵权, 容易和别人雷同。
            本教程的目标是让老板能<strong>自己设计一张脸</strong>,
            而不是从模型训练集里抽平均脸。
          </p>
          <div class="mt-8 flex flex-wrap items-center gap-6 text-sm text-ink/60">
            <div>
              <span class="catalog-no text-ink/40 mr-2">VERSION</span>
              <span class="font-mono">{{ version }}</span>
            </div>
            <div class="w-px h-4 bg-line"></div>
            <div>
              <span class="catalog-no text-ink/40 mr-2">LAST UPDATED</span>
              <span class="font-mono">{{ lastUpdated }}</span>
            </div>
            <div class="w-px h-4 bg-line"></div>
            <div>
              <span class="catalog-no text-ink/40 mr-2">适用平台</span>
              <span class="font-mono">MJ · SD · 即梦 · 豆包 · Kling</span>
            </div>
          </div>
        </header>

        <!-- § 0 核心理念 -->
        <section id="sec-0" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 0 — CORE IDEA · 核心理念
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            <span class="font-display-italic text-gold">模糊词</span> 是雷同的根源
          </h2>
          <div class="bg-surface border-0.5 border-ink p-8 md:p-10 space-y-4 leading-relaxed text-ink/80">
            <p>通用形容词 ("25 岁东亚女性, 高颜值, 精致妆容") → 模型会从训练集里抽<strong>最像这个描述的平均脸</strong>。几百万人用过同款描述, 出来的脸高度雷同, 且往往对应真实明星/网红。</p>
            <p><strong class="text-ink">反侵权思路</strong>: 把"高颜值"这种模糊词, 替换成<strong class="text-gold">可量化的具体特征</strong>:</p>
            <div class="grid md:grid-cols-2 gap-3 text-sm">
              <div class="bg-cream/50 p-4 border-0.5 border-line space-y-2">
                <div class="text-danger font-medium">❌ 模糊词</div>
                <div class="text-ink/70">"漂亮的脸" · "大眼睛" · "高鼻梁"</div>
              </div>
              <div class="bg-gold/5 p-4 border-0.5 border-gold/30 space-y-2">
                <div class="text-success font-medium">✅ 具体词</div>
                <div class="text-ink/70">"鹅蛋脸, 颧骨略高, 下颌线清晰但略圆钝" · "杏眼, 新月形双眼皮, 瞳孔深棕, 眼距标准" · "鼻梁高度中等偏上, 鼻翼窄, 鼻尖微翘"</div>
              </div>
            </div>
            <p><strong class="text-ink">矛盾特征混搭</strong>是原创度的关键。例: "长脸 + 圆钝下颌" / "杏眼 + 窄眼距" / "高鼻梁 + 厚唇" — 这些组合在训练集真人里不常见, 生成出来天然原创。</p>
          </div>
        </section>

        <!-- § 1 通用结构 -->
        <section id="sec-1" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 1 — UNIVERSAL STRUCTURE · 通用结构 (5 段式)
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            <span class="font-display-italic text-gold">5 段式</span> 公式
          </h2>
          <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative">
            <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">§ 1</div>
            <pre class="font-mono text-sm whitespace-pre-wrap leading-relaxed bg-cream/50 p-6 border-0.5 border-line text-ink">[主体面容 12 项] + [姿势/表情] + [服装/造型] + [环境/背景] + [光照/镜头/风格]</pre>
            <p class="mt-6 text-sm text-ink/70 leading-relaxed">
              <strong class="text-ink">中文场景下, 段落语序比逗号 tag 更重要</strong> —
              中文模型 (即梦/豆包/Kling) 对自然语序敏感。英文 tag 风格 (逗号分隔) 在 MJ/SD 才有效。
            </p>
          </article>
        </section>

        <!-- § 2 12 项填空模板 -->
        <section id="sec-2" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 2 — FILL-IN TEMPLATE · 12 项填空模板
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            直接复制这一段,<span class="font-display-italic text-gold">逐项替换</span>
          </h2>
          <article class="bg-surface border-0.5 border-ink p-8 md:p-12 relative">
            <div class="absolute top-6 right-6 stamp text-gold border-gold hidden md:block">§ 2</div>
            <pre class="font-mono text-xs md:text-sm whitespace-pre-wrap leading-relaxed bg-cream/50 p-6 border-0.5 border-line text-ink">一位 [1 年龄段] [2 国籍] [3 性别],

脸型: [4 脸型: 颧骨 + 下颌 + 比例],
额发: [5 刘海类型 + 发际线],
眉毛: [6 眉形 + 粗细 + 眉峰],
眼睛: [7 眼型 + 双眼皮 + 瞳孔色 + 眼距],
鼻子: [8 鼻梁 + 鼻翼 + 鼻尖],
嘴唇: [9 唇厚 + 唇形 + 嘴角 + 唇色],
肤色: [10 基础色 + 冷暖调 + 肤质],

表情: [11 主导情绪 + 眼神方向 + 嘴部动作],
服装: [12 领口/袖型/材质/颜色],
环境: [室内外 + 背景元素],
光照: [光源方向 + 类型],
镜头: [焦段 + 光圈 + 色调 + 风格]</pre>
          </article>
        </section>

        <!-- § 3 12 项可控词典 -->
        <section id="sec-3" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 3 — 12-ITEM DICTIONARY · 可控词典
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            <span class="font-display-italic text-gold">8 张</span> 选择表
          </h2>

          <div class="space-y-6">

            <!-- § 3.1 脸型 -->
            <article id="dict-face" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.1 · FACE SHAPE</div>
              <h3 class="font-display text-xl text-ink mb-2">脸型 (5 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in faceShapes" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="mt-4 p-3 bg-gold/5 border-0.5 border-gold/30 text-xs text-ink/70">
                <strong class="text-ink">💡 混搭建议:</strong>
                鹅蛋脸 + 高颧骨 = 模特脸 ·
                圆脸 + 尖下巴 = 显瘦的幼态 ·
                长脸 + 圆钝下颌 = 清冷反差 ·
                方脸 + 高颧骨 = 高级感
              </div>
            </article>

            <!-- § 3.2 额发 / 刘海 -->
            <article id="dict-bangs" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.2 · BANGS</div>
              <h3 class="font-display text-xl text-ink mb-4">额发 / 刘海 (5 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in bangs" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- § 3.3 眉毛 -->
            <article id="dict-brows" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.3 · EYEBROWS</div>
              <h3 class="font-display text-xl text-ink mb-4">眉毛 (8 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in eyebrows" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- § 3.4 眼睛 (四维组合) -->
            <article id="dict-eyes" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.4 · EYES</div>
              <h3 class="font-display text-xl text-ink mb-2">眼睛 (10 选组合)</h3>
              <p class="text-xs text-ink/60 mb-4">眼型 × 双眼皮 × 瞳孔色 × 眼距 · 四维自由组合</p>

              <h4 class="catalog-no text-ink/60 mt-4 mb-2 text-xs">眼型 (7 选)</h4>
              <table class="w-full text-sm mb-6">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in eyeShapes" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>

              <h4 class="catalog-no text-ink/60 mb-2 text-xs">双眼皮类型 (4 选)</h4>
              <ul class="grid md:grid-cols-2 gap-2 text-sm mb-6">
                <li v-for="t in doubleEyelidTypes" :key="t.label" class="bg-cream/50 p-3 border-0.5 border-line">
                  <strong class="text-ink">{{ t.label }}</strong> · {{ t.desc }}
                </li>
              </ul>

              <h4 class="catalog-no text-ink/60 mb-2 text-xs">瞳孔色 (4 选)</h4>
              <p class="text-sm text-ink/70 mb-6 leading-relaxed">{{ pupilColors.join(' · ') }}</p>

              <h4 class="catalog-no text-ink/60 mb-2 text-xs">眼距 (3 选)</h4>
              <p class="text-sm text-ink/70 leading-relaxed">{{ eyeDistance.join(' · ') }}</p>
            </article>

            <!-- § 3.5 鼻子 -->
            <article id="dict-nose" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.5 · NOSE</div>
              <h3 class="font-display text-xl text-ink mb-4">鼻子 (6 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in noseShapes" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- § 3.6 嘴唇 -->
            <article id="dict-lips" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.6 · LIPS</div>
              <h3 class="font-display text-xl text-ink mb-4">嘴唇 (8 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">气质</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in lipShapes" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60 italic">{{ row.vibe }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- § 3.7 肤色 -->
            <article id="dict-skin" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.7 · SKIN TONE</div>
              <h3 class="font-display text-xl text-ink mb-4">肤色 (6 选)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">选项</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">注意事项</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in skinTones" :key="row.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ row.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ row.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60">{{ row.note }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- § 3.8 表情 / 眼神 (自由组合) -->
            <article id="dict-expression" class="bg-surface border-0.5 border-ink p-6 md:p-8 relative scroll-mt-24">
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">3.8 · EXPRESSION</div>
              <h3 class="font-display text-xl text-ink mb-4">表情 / 眼神 (自由组合)</h3>
              <div class="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">眼神方向 (6 选)</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="g in gazes" :key="g" class="px-2 py-1 bg-cream border-0.5 border-line text-xs">{{ g }}</span>
                  </div>
                </div>
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">主导情绪 (8 选)</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="e in emotions" :key="e" class="px-2 py-1 bg-cream border-0.5 border-line text-xs">{{ e }}</span>
                  </div>
                </div>
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">嘴部动作 (5 选)</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="m in mouthActions" :key="m" class="px-2 py-1 bg-cream border-0.5 border-line text-xs">{{ m }}</span>
                  </div>
                </div>
              </div>
            </article>

          </div>
        </section>

        <!-- § 4 服装 / 环境 / 光照 / 镜头 -->
        <section id="sec-4" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 4 — WARDROBE / ENV / LIGHT / LENS · 服装环境光照镜头
          </div>
          <div class="space-y-6">

            <!-- 服装四要素 -->
            <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
              <h3 class="font-display text-xl text-ink mb-3">服装描述四要素</h3>
              <pre class="font-mono text-sm bg-cream/50 p-4 border-0.5 border-line leading-relaxed">[领口] + [袖型] + [材质] + [颜色]</pre>
              <div class="grid md:grid-cols-2 gap-3 mt-4 text-sm">
                <div v-for="(items, label) in clothing" :key="label">
                  <div class="catalog-no text-ink/60 mb-2 text-xs">{{ label }}</div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="i in items" :key="i" class="px-2 py-1 bg-cream border-0.5 border-line text-xs">{{ i }}</span>
                  </div>
                </div>
              </div>
              <p class="text-xs text-ink/60 mt-3">⚠️ 颜色要写具体色名 (浅杏色 / 砖红色 / 墨绿色), 不要"好看的颜色"。</p>
            </article>

            <!-- 环境关键词 -->
            <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
              <h3 class="font-display text-xl text-ink mb-3">环境关键词</h3>
              <div class="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">室内</div>
                  <p class="text-ink/80 leading-relaxed">{{ envIndoor.join(' · ') }}</p>
                </div>
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">室外</div>
                  <p class="text-ink/80 leading-relaxed">{{ envOutdoor.join(' · ') }}</p>
                </div>
              </div>
              <div class="mt-3 text-xs text-ink/70 leading-relaxed">
                <strong class="text-ink">背景元素:</strong> {{ bgElements.join(' · ') }}
              </div>
            </article>

            <!-- 光照 — 表格 -->
            <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
              <h3 class="font-display text-xl text-ink mb-3">光照 (决定画面情绪)</h3>
              <table class="w-full text-sm">
                <thead class="bg-cream">
                  <tr>
                    <th class="text-left font-medium py-2 px-2">类型</th>
                    <th class="text-left font-medium py-2 px-2">描述</th>
                    <th class="text-left font-medium py-2 px-2">适用</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in lighting" :key="l.label" class="border-t border-line">
                    <td class="py-2 px-2 font-medium text-ink">{{ l.label }}</td>
                    <td class="py-2 px-2 text-xs text-ink/70">{{ l.desc }}</td>
                    <td class="py-2 px-2 text-xs text-ink/60">{{ l.use }}</td>
                  </tr>
                </tbody>
              </table>
            </article>

            <!-- 镜头参数 -->
            <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
              <h3 class="font-display text-xl text-ink mb-3">镜头参数</h3>
              <div class="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">焦段选择</div>
                  <ul class="space-y-1.5 text-ink/80">
                    <li v-for="f in focalLengths" :key="f.label">
                      <code class="font-mono text-gold text-xs">{{ f.label }}</code> — {{ f.use }}
                    </li>
                  </ul>
                </div>
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">色调与后期</div>
                  <ul class="space-y-1.5 text-ink/80">
                    <li v-for="g in grading" :key="g.label">
                      <strong class="text-ink">{{ g.label }}:</strong> {{ g.examples }}
                    </li>
                  </ul>
                </div>
              </div>
            </article>

          </div>
        </section>

        <!-- § 5 平台差异 -->
        <section id="sec-5" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 5 — PLATFORM DIFFERENCES · 不同平台的差异
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            同一个 prompt,<span class="font-display-italic text-gold">写法不同</span>
          </h2>
          <article class="bg-surface border-0.5 border-ink p-8 md:p-10 relative">
            <table class="w-full text-sm">
              <thead class="bg-cream">
                <tr>
                  <th class="text-left font-medium py-2 px-2">平台</th>
                  <th class="text-left font-medium py-2 px-2">偏好写法</th>
                  <th class="text-left font-medium py-2 px-2">注意事项</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in platforms" :key="p.name" class="border-t border-line align-top">
                  <td class="py-2 px-2 font-medium text-ink">{{ p.name }}</td>
                  <td class="py-2 px-2 text-xs text-ink/70 leading-relaxed">{{ p.style }}</td>
                  <td class="py-2 px-2 text-xs text-ink/60 leading-relaxed">{{ p.caveats }}</td>
                </tr>
              </tbody>
            </table>

            <div class="mt-8 p-5 bg-cream/50 border-0.5 border-line">
              <div class="catalog-no text-ink/60 mb-2 text-xs">负面提示词模板 (SD/ComfyUI 用)</div>
              <pre class="font-mono text-xs whitespace-pre-wrap text-ink/80 leading-relaxed">ugly, deformed, bad anatomy, extra fingers, blurry,
low quality, watermark, text, signature, asymmetric eyes,
cross-eyed, poorly drawn face, mutation, disfigured</pre>
              <p class="text-xs text-ink/60 mt-3">国产模型 (即梦/豆包) 一般不需要负面提示词, 用正面描述即可。</p>
            </div>
          </article>
        </section>

        <!-- § 6 实战示例 — 3 套原创脸 -->
        <section id="sec-6" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 6 — EXAMPLES · 实战示例 (3 套原创脸)
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            <span class="font-display-italic text-gold">3 套</span> 原创脸 prompt
          </h2>
          <div class="space-y-6">
            <article
              v-for="ex in examples"
              :key="ex.id"
              :id="ex.id"
              class="bg-surface border-0.5 border-ink p-8 md:p-10 relative scroll-mt-24"
            >
              <div class="absolute -top-3 left-8 stamp text-gold bg-cream">{{ ex.stamp }}</div>
              <div class="catalog-no text-ink/60 mb-1">{{ ex.tagline }}</div>
              <h3 class="font-display text-2xl text-ink mb-4">{{ ex.title }}</h3>

              <div :class="ex.en ? 'grid md:grid-cols-2 gap-4 mb-4' : ''">
                <div>
                  <div class="catalog-no text-ink/60 mb-2 text-xs">中文 prompt (即梦/豆包/Kling)</div>
                  <pre class="font-mono text-xs whitespace-pre-wrap leading-relaxed bg-cream/50 p-4 border-0.5 border-line">{{ ex.zh }}</pre>
                </div>
                <div v-if="ex.en">
                  <div class="catalog-no text-ink/60 mb-2 text-xs">英文 prompt (Midjourney)</div>
                  <pre class="font-mono text-xs whitespace-pre-wrap leading-relaxed bg-cream/50 p-4 border-0.5 border-line">{{ ex.en }}</pre>
                </div>
              </div>

              <div class="p-3 bg-gold/5 border-0.5 border-gold/30 text-xs text-ink/70 leading-relaxed">
                <strong class="text-ink">💡 混搭亮点:</strong> {{ ex.highlight }}
              </div>
            </article>
          </div>
        </section>

        <!-- § 7 防侵权铁律 -->
        <section id="sec-7" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 7 — ANTI-INFRINGEMENT · 防侵权 5 条铁律
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            <span class="font-display-italic text-danger">❌ 不要做</span> /
            <span class="font-display-italic text-success">✅ 要做</span>
          </h2>
          <div class="grid md:grid-cols-2 gap-6">
            <article class="bg-danger/5 border-0.5 border-danger/40 p-6 md:p-8">
              <h3 class="font-display text-xl text-danger mb-4">❌ 不要做 (5 条)</h3>
              <ol class="space-y-3 text-sm text-ink/80 leading-relaxed">
                <li v-for="d in donts" :key="d">
                  <strong class="text-ink">{{ d }}</strong>
                </li>
              </ol>
            </article>
            <article class="bg-success/5 border-0.5 border-success/40 p-6 md:p-8">
              <h3 class="font-display text-xl text-success mb-4">✅ 要做 (5 条)</h3>
              <ol class="space-y-3 text-sm text-ink/80 leading-relaxed">
                <li v-for="d in dos" :key="d">
                  <strong class="text-ink">{{ d }}</strong>
                </li>
              </ol>
            </article>
          </div>
        </section>

        <!-- § 8 形成 IP 的进阶用法 -->
        <section id="sec-8" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 8 — ADVANCED · 形成 IP 的进阶用法
          </div>
          <h2 class="font-display text-2xl md:text-3xl text-ink mb-6">
            从<span class="font-display-italic text-gold">单张脸</span>到<span class="font-display-italic text-gold">系列</span>
          </h2>
          <p class="text-sm text-ink/70 leading-relaxed mb-6 max-w-2xl">
            当老板生成出一张满意的脸, 想把它变成"系列" (博主形象 / 品牌 IP), 用以下技巧:
          </p>
          <div class="space-y-6">
            <article v-for="adv in advanced" :key="adv.title" class="bg-surface border-0.5 border-ink p-6 md:p-8">
              <h3 class="font-display text-xl text-ink mb-3">{{ adv.title }}</h3>
              <pre class="font-mono text-xs whitespace-pre-wrap bg-cream/50 p-4 border-0.5 border-line text-ink leading-relaxed">{{ adv.formula }}</pre>
              <p class="text-sm text-ink/70 mt-3 leading-relaxed">{{ adv.note }}</p>
            </article>
          </div>
        </section>

        <!-- § 9 翻车排查 -->
        <section id="sec-9" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 9 — TROUBLESHOOTING · 常见翻车与排查
          </div>
          <div class="bg-surface border-0.5 border-ink p-6 md:p-8 space-y-5">
            <details
              v-for="(t, idx) in troubleshoots"
              :key="idx"
              class="group hairline-b border-line last:border-b-0 pb-4 last:pb-0"
            >
              <summary class="cursor-pointer list-none flex items-baseline gap-3 hover:text-gold transition">
                <span class="catalog-no text-ink/40 text-xs shrink-0 w-8">Q{{ String(idx + 1).padStart(2, '0') }}</span>
                <span class="font-medium text-ink flex-1">{{ t.q }}</span>
                <span class="font-display-italic text-ink/30 group-open:rotate-45 transition">+</span>
              </summary>
              <div class="mt-3 ml-11 text-sm text-ink/70 leading-relaxed space-y-2">
                <p><strong class="text-danger">原因:</strong> {{ t.cause }}</p>
                <p><strong class="text-success">修复:</strong> {{ t.fix }}</p>
              </div>
            </details>
          </div>
        </section>

        <!-- § 10 速查卡 — 打印样式 -->
        <section id="sec-10" class="scroll-mt-24 mb-12 md:mb-16 face-cheatsheet">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 10 — CHEAT SHEET · 一页速查卡
          </div>
          <p class="text-sm text-ink/60 mb-4 flex items-center gap-2">
            <span>📠</span>
            <span>老板可打印 · 按 <code class="font-mono text-xs">Cmd + P</code> 即可导出 A4 单页</span>
          </p>
          <article class="bg-surface border-0.5 border-ink p-6 md:p-8 space-y-6">

            <!-- 面部词典速查 -->
            <div>
              <h3 class="font-display text-lg text-ink mb-3">面部词典</h3>
              <div class="grid md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <div v-for="cat in cheatSheet.faces" :key="cat.label" class="leading-relaxed">
                  <div class="catalog-no text-ink/60 mb-1 text-[10px]">{{ cat.label }}</div>
                  <div class="font-mono">{{ cat.items }}</div>
                </div>
              </div>
            </div>

            <hr class="border-line" />

            <!-- 镜头 / 光照速查 -->
            <div>
              <h3 class="font-display text-lg text-ink mb-3">镜头 / 光照 / 色调</h3>
              <div class="grid md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div v-for="cat in cheatSheet.camera" :key="cat.label" class="leading-relaxed">
                  <div class="catalog-no text-ink/60 mb-1 text-[10px]">{{ cat.label }}</div>
                  <div class="font-mono">{{ cat.items }}</div>
                </div>
              </div>
            </div>

            <hr class="border-line" />

            <!-- 防侵权铁律 -->
            <div class="grid md:grid-cols-2 gap-4">
              <div class="p-4 bg-danger/5 border-0.5 border-danger/40">
                <div class="catalog-no text-danger mb-2 text-[10px]">反面铁律</div>
                <ul class="text-xs space-y-1.5 text-ink/80">
                  <li v-for="d in cheatSheet.donts" :key="d">❌ {{ d }}</li>
                </ul>
              </div>
              <div class="p-4 bg-success/5 border-0.5 border-success/40">
                <div class="catalog-no text-success mb-2 text-[10px]">正面铁律</div>
                <ul class="text-xs space-y-1.5 text-ink/80">
                  <li v-for="d in cheatSheet.dos" :key="d">✅ {{ d }}</li>
                </ul>
              </div>
            </div>

          </article>
        </section>

        <!-- § 11 版本 -->
        <section id="sec-11" class="scroll-mt-24 mb-12 md:mb-16">
          <div class="catalog-no text-ink/50 mb-4 pb-3 hairline-b border-line">
            § 11 — VERSION · 版本
          </div>
          <article class="bg-surface border-0.5 border-ink p-6 md:p-8">
            <ul class="space-y-2 text-sm text-ink/80">
              <li><strong class="text-ink">v1.0 (2026-06-22)</strong> — 初版, 基于老板需求"控制脸型/眉毛/眼睛/肤色 等原创脸, 防侵权"</li>
              <li>后续: 根据老板实战反馈补充更多反例和修复方案</li>
            </ul>
          </article>
        </section>

        <!-- 底部操作 -->
        <div class="mt-14 grid md:grid-cols-12 gap-6 items-center no-print">
          <div class="md:col-span-7">
            <p class="font-display-italic text-ink/60 leading-relaxed">
              看完就试一张脸 ·
              把 prompt 复制到 即梦 / 豆包 / MJ, 看效果。
            </p>
          </div>
          <div class="md:col-span-5 md:text-right">
            <RouterLink
              to="/guide/creator"
              class="inline-flex items-center gap-3 px-6 py-3 border-0.5 border-ink text-ink hover:bg-ink hover:text-cream transition text-sm"
            >
              <span>捏者 onboarding 手册</span>
              <span class="font-display-italic">→</span>
            </RouterLink>
          </div>
        </div>
      </main>

      <!-- 侧边目录 (sticky, lg 才显示) -->
      <aside class="hidden lg:block no-print">
        <nav class="sticky top-24">
          <div class="catalog-no text-ink/50 mb-3 text-xs">CONTENTS · 目录</div>
          <ul class="space-y-2 text-sm">
            <li v-for="item in toc" :key="item.id">
              <a :href="`#${item.id}`" class="text-ink/70 hover:text-gold transition flex items-baseline gap-2">
                <span class="catalog-no text-ink/40 text-[10px] shrink-0">{{ item.no }}</span>
                <span>{{ item.title }}</span>
              </a>
            </li>
          </ul>
        </nav>
      </aside>
    </div>

    <!-- 底部 colophon -->
    <footer class="hairline-t border-line no-print">
      <div class="max-w-[1320px] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between catalog-no text-ink/40">
        <span>CAT. GUIDE-200</span>
        <span>SET IN CORMORANT GARAMOND · INTER TIGHT · JETBRAINS MONO</span>
        <span>© 2026 IBI.REN</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* § 10 速查卡打印样式 — 老板 Cmd+P 导出 A4 单页 (单页 A4, 只保留 §10) */
@media print {
  /* 隐藏非核心元素 (用 .no-print 类标记) */
  .no-print {
    display: none !important;
  }

  /* 隐藏所有 section (除了 §10 速查卡) */
  main > section:not(.face-cheatsheet) {
    display: none !important;
  }

  /* 重置 main 布局为单列 (去掉 sticky 间距) */
  main {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* 速查卡本身: 黑白, 无背景色, 无阴影, 无圆角 */
  .face-cheatsheet article {
    background: white !important;
    border: 1px solid #000 !important;
    color: #000 !important;
    box-shadow: none !important;
    page-break-inside: avoid;
  }

  /* 红绿提示 box 改成纯黑框 (黑白复印友好) */
  .face-cheatsheet .bg-danger\/5,
  .face-cheatsheet .bg-success\/5,
  .face-cheatsheet .bg-cream\/50,
  .face-cheatsheet .bg-gold\/5 {
    background: white !important;
    border: 1px solid #000 !important;
  }

  /* 字体大小, 适合 A4 */
  .face-cheatsheet {
    font-size: 10pt !important;
    color: #000 !important;
  }

  /* catalog-no 类: 打印时使用纯黑 */
  .face-cheatsheet .catalog-no {
    color: #000 !important;
  }

  /* 避免分页 */
  .face-cheatsheet article,
  .face-cheatsheet .grid > div {
    break-inside: avoid;
  }

  /* 页面边距 + A4 尺寸 */
  @page {
    margin: 1.5cm;
    size: A4;
  }
}
</style>
