const ROADMAP_STATE = {
  "_note": "ibi.ren 战略路线图状态文件 v1（唯一事实源，本地使用）。route: main(主线·胜负手) / supply(供给线) / demand(需求线) / tech(平台与AI原生组织线) / side(支线)。critical: 关键任务（胜负手或卡点）。status: done / doing / todo。更新方式：用户勾选（仅本地）或告知 Kimi，由 Kimi 修改本文件。",
  "updated_at": "2026-08-07",
  "vision": {
    "title": "AI 原生的 AIGC 服务交易平台",
    "goal": "3 年内做到中国 AIGC 服务交易行业第一，年交易额（GMV）10 亿+",
    "thesis": "胜负手是「把非标创意服务做成标品」。上一代服务交易平台（猪八戒/特赞）死于服务非标导致的信任崩塌；AIGC 第一次让创意交付物可量化、可验收、可复制。平台不卖「找人」，卖「确定的结果」：标品 SKU + 平台担保交付 + 数据驱动派单。飞轮：标准定义质量 → 质量沉淀口碑 → 口碑带来订单 → 订单吸引供给 → 供给让标准更丰富。第二胜负手：先自营打样定义标准，再把验证过的 AI 工作流产品化给供给端——供给端是产能放大器，平台握的是标准和信任。"
  },
  "crux": [
    {
      "id": "d1",
      "level": "致命",
      "title": "双边冷启动（鸡生蛋）",
      "detail": "没供给没需求，没需求没供给。破法：单点楔入——选一个品类自营打样先做重，拿到真实订单再招募供给"
    },
    {
      "id": "d2",
      "level": "致命",
      "title": "非标交付的信任崩塌",
      "detail": "创意服务质量方差大，一单翻车毁一片市场。破法：SKU 标品化 + 满意再放款 + 平台兜底重做"
    },
    {
      "id": "d3",
      "level": "重",
      "title": "飞单（供需绕开平台）",
      "detail": "供需直连后撇开平台。破法：合同/发票/版权存证只在平台内有效 + 复购权益绑定，让飞单代价大于佣金"
    },
    {
      "id": "d4",
      "level": "重",
      "title": "劣币驱逐良币",
      "detail": "低价低质供给挤走优质供给。破法：认证分级 + 派单制而非竞价制，平台对质量负责而不是对价格负责"
    },
    {
      "id": "d5",
      "level": "重",
      "title": "B 端定制诉求拖垮标品",
      "detail": "每个客户都觉得自己特殊。破法：定制只接高客单，SKU 覆盖率 ≥80% 是红线"
    },
    {
      "id": "d6",
      "level": "中",
      "title": "AI 工作流快速过时",
      "detail": "今天的 SOP 明天被新模型颠覆。破法：工作流实验室每月重估 SOP——平台的元能力是「持续重写自己的生产流程」"
    },
    {
      "id": "d7",
      "level": "中",
      "title": "自营→平台过渡期的组织撕裂",
      "detail": "自营团队和供给端抢单，左右互搏。破法：自营定位为「标准定义者」，KPI 是标准被供给端的采用率，不是自营 GMV"
    }
  ],
  "cognitive": [
    "客户买的不是 AI，是结果：每条 SKU 按「客户要的结果」命名和定价——能带货的广告片，不是「AI 视频生成服务」",
    "平台的本质是信任机器：担保、品控、仲裁 > 撮合效率",
    "先需求后供给：拿到 10 个真实订单之前，不招募任何供给",
    "自营是手段不是目的：自营的唯一 KPI 是沉淀出可复制的标准",
    "AI 原生组织：能用 agent 完成的岗位不招人；人效对标软件公司，不是服务公司",
    "犹豫时回到原点：这件事是在降低交易成本（搜寻/信任/交付/维权），还是在增加我们的组织复杂度？"
  ],
  "route_order": ["main", "supply", "demand", "tech", "side"],
  "routes": {
    "main": {
      "name": "主线 · 胜负手（标品化 + 担保交付飞轮）",
      "items": [
        { "id": "m1", "title": "选定楔子品类：电商/门店广告片（高频、可验收、客单适中）", "status": "done", "critical": true },
        { "id": "m2", "title": "楔子品类 SKU 化：3 档标品，时长/镜头数/修改次数/交付物全部写死（docs/sku-ad-video-v1.md）", "status": "done", "critical": true },
        { "id": "m3", "title": "担保交易 v1：托管支付 + 满意再放款 + 翻车重做承诺（首页已承诺，平台机制待建）", "status": "todo", "critical": true },
        { "id": "m4", "title": "自营打样 30 单：跑通 SOP、成本结构、品控清单", "status": "todo", "critical": true },
        { "id": "m5", "title": "品类验收标准 v1：7 项验收清单已写入 SKU 文档，AI 初检待做", "status": "doing", "critical": true },
        { "id": "m6", "title": "案例与效果墙：/cases 已上线（8 条作品迁移 OSS，2026-07-24）；效果数据并入 d4 标杆案例", "status": "done", "critical": false },
        { "id": "m7", "title": "飞轮验证：50 单纠纷率 <5%、NPS ≥50", "status": "todo", "critical": true },
        { "id": "m8", "title": "开放供给端：首批 20 个认证工作室按标准接单", "status": "todo", "critical": false },
        { "id": "m9", "title": "第二品类复制（短剧/剧本 或 资产建模），验证标准可复制", "status": "todo", "critical": false },
        { "id": "m10", "title": "年度品类扩张节奏表：B 端优先，C 端情感品类殿后", "status": "todo", "critical": false }
      ]
    },
    "supply": {
      "name": "供给线（自由职业者 / AIGC 工作室）",
      "items": [
        { "id": "p1", "title": "供给端分级标准：工作室 / 自由职业者 / AI 工作室三档画像", "status": "todo", "critical": false },
        { "id": "p2", "title": "创作者工作台 v1：接单、交付、结算、评级", "status": "todo", "critical": false },
        { "id": "p3", "title": "AI 工作流工具包：自营验证过的 SOP 产品化给供给端", "status": "todo", "critical": true },
        { "id": "p4", "title": "品类认证考试：持证接单，按品类发证", "status": "todo", "critical": false },
        { "id": "p5", "title": "派单引擎：数据驱动匹配，不做竞价排名", "status": "todo", "critical": true },
        { "id": "p6", "title": "供给端留存：等级权益 + 稳定派单量承诺", "status": "todo", "critical": false },
        { "id": "p7", "title": "末位清退与差评降权机制", "status": "todo", "critical": false },
        { "id": "p8", "title": "供给端零摩擦上架：AI 助手代办入驻资料、自动初筛（参照 UUMit skill 包安装体验）", "status": "todo", "critical": false }
      ]
    },
    "demand": {
      "name": "需求线（B 端为主，C 端为辅）",
      "items": [
        { "id": "d1", "title": "B 端首批 10 个真实付费订单（3 个意向 ¥10,400：鞋子素材包 ¥4,000 / 婚礼短片 ¥1,000 / 培训 ¥5,400）", "status": "doing", "critical": true },
        { "id": "d2", "title": "B 端获客渠道验证：行业社群 / 私域 / 标杆案例 PR", "status": "todo", "critical": false },
        { "id": "d3", "title": "B 端复购机制：季度内容订阅包，把一次性买卖变订阅", "status": "todo", "critical": true },
        { "id": "d4", "title": "标杆案例 ×3：电商、门店、创业者各一，可公开引用；四段式结构（卡点→能力→交付→量化指标，参照 UUMit 案例墙）", "status": "todo", "critical": false },
        { "id": "d5", "title": "C 端情感品类试点：求婚影像 / 爱情叙事短片（复用 LuckyNemo 已验证模型）", "status": "todo", "critical": false },
        { "id": "d6", "title": "C 端裂变：交付物即传播，K 系数追踪", "status": "todo", "critical": false },
        { "id": "d7", "title": "需求侧 NPS 体系与转介绍激励", "status": "todo", "critical": false },
        { "id": "d8", "title": "培训服务试点：AI 个人 IP 短片课 900×6（学员=潜在供给，课件=p4 教材雏形）", "status": "doing", "critical": false }
      ]
    },
    "tech": {
      "name": "平台与 AI 原生组织线",
      "items": [
        { "id": "t1", "title": "Brief 结构化 agent：自然语言需求 → SKU + 报价，自动成交率追踪", "status": "todo", "critical": true },
        { "id": "t2", "title": "自动品控 agent：成片画面 / 音画 / 品牌合规自动初检", "status": "todo", "critical": true },
        { "id": "t3", "title": "纠纷仲裁流程：过程稿留痕 + 存证 + 仲裁 SOP", "status": "todo", "critical": false },
        { "id": "t4", "title": "供需匹配 / 动态定价引擎", "status": "todo", "critical": false },
        { "id": "t5", "title": "工作流实验室：每月重估各品类 SOP 是否被新模型颠覆", "status": "todo", "critical": true },
        { "id": "t6", "title": "AI 原生组织落地：每个新岗位先回答「为什么 agent 做不了」", "status": "todo", "critical": false },
        { "id": "t7", "title": "经营数据看板：GMV / 纠纷率 / 交付周期 / 人效，周更", "status": "todo", "critical": false },
        { "id": "t8", "title": "SKU 机器可读化：跟踪 A2A/Agent Card 标准，让采购方 Agent 能自动发现/比价/下单标品（参照 UUMit，见 docs/competitor-uumit.md）", "status": "todo", "critical": false }
      ]
    },
    "side": {
      "name": "支线任务",
      "items": [
        { "id": "s1", "title": "平台规则体系：服务协议 / 版权归属 / 退款规则 / AI 内容标识", "status": "todo", "critical": false },
        { "id": "s2", "title": "合同 / 发票 / 版权存证能力（反飞单基础设施）", "status": "todo", "critical": false },
        { "id": "s3", "title": "官网改版：首页 + 案例集已切「AIGC 服务交易」定位（2026-07-24），内页待跟进", "status": "doing", "critical": false },
        { "id": "s4", "title": "现有虚拟人 IP 资产库并入供给端品类", "status": "todo", "critical": false },
        { "id": "s5", "title": "财务模型：自营→平台过渡期现金流与融资节奏", "status": "todo", "critical": false },
        { "id": "s6", "title": "合规：AIGC 内容标识办法、肖像 / 版权授权链模板", "status": "todo", "critical": false }
      ]
    }
  },
  "hypotheses": [
    { "id": "h1", "text": "B 端愿为 AI 广告片付 ¥3,000–10,000（传统报价的 1/10）", "method": "首批 10 单的付费率与退款率。价格发现(07-24)：客单价 ¥4,000 成立，但品类裂为精品片 vs 批量素材包(¥400/条)", "target": "付费转化 ≥30%，退款 <10%", "status": "doing" },
    { "id": "h2", "text": "标品 SKU 能覆盖真实需求", "method": "30 单中无需定制的比例", "target": "≥80% 走标品", "status": "todo" },
    { "id": "h3", "text": "平台担保交付下纠纷可控", "method": "50 单纠纷 / 退款台账", "target": "纠纷率 <5%", "status": "todo" },
    { "id": "h4", "text": "AI 品控能达到人工验收水平", "method": "双盲对比 100 个交付物", "target": "与人工一致率 ≥90%", "status": "todo" },
    { "id": "h5", "text": "飞单率可控", "method": "3 单以上客户的复购路径追踪", "target": "平台内复购 ≥70%", "status": "todo" },
    { "id": "h6", "text": "供给端经济模型成立：月入 ≥¥8,000 才会持续接单", "method": "首批 20 个供给的 90 天留存", "target": "留存 ≥60%", "status": "todo" },
    { "id": "h7", "text": "B 端有复购（不是一次性买卖）", "method": "首单客户 90 天队列分析", "target": "复购 ≥30%", "status": "todo" },
    { "id": "h8", "text": "自营人效：单均人工 ≤0.5 人日", "method": "订单 A 素材包逐条工时 + 算力台账（¥400/条能否成立的实测）", "target": "素材包单条人工 ≤2h；精品片毛利 ≥60%", "status": "doing" },
    { "id": "h9", "text": "C 端情感品类可以裂变", "method": "订单 B 婚礼短片：片尾裂变卡 + 现场咨询追踪", "target": "K ≥0.5（每单 ≥0.5 个咨询）", "status": "doing" },
    { "id": "h10", "text": "撮合时效：需求 48h 内匹配到合格供给", "method": "平台订单数据", "target": "≥90% 订单达标", "status": "todo" }
  ]
};
