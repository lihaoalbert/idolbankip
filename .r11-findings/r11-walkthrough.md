# R11 体验走查 (buyer_001 + creator_001, 2026-07-14)

## 路径
- 本地 API: 127.0.0.1:3100 (vite proxy → /api)
- Web (vite dev): http://127.0.0.1:5173
- 账号: buyer_001@ibi.ren / creator_001@ibi.ren (Focus_2026!)

## 观察记录

### buyer_001


#### Step 1.1 — HomePage (/)
- 登录后跳转 / 是营销首页 (IP Catalogue 杂志风)
- 顶部 nav 出现「我的订单」「我的资产」+ 用户名 "张" 头像 + 通知图标(红点 1)
- **观察 [A]**: 登录用户首屏仍看到的是营销首页(01 SELECTED WORKS、02 PROCESS、03 DELIVERABLES 三段销售文案),没看到"我最近在做什么"的入口
- **观察 [B]**: 通知红点 1 不告诉用户是什么类型的通知
- 营销首页强但有"重复内容"之嫌 (CHRISTIE'S · 数字艺术品拍卖标准 出现 2 次, 流程 4 步 II/III 罗马数字标号)

#### Step 1.2 — /buyer/chat (chat-first 三分屏)
- 页面布局 OK:左 5 项 nav + 中 chat + 右 我的发包 list
- 顶部 R2/R3/R4 dev 脚注还在 ("R2 三分屏 · R3 将开放 AI 工具 · R4 全量上线") — 应该是内部标记,prod 应隐藏
- **观察 [C]**: 6 条 "W6-R6 T1 撤回bid-test..." / "edit-while-bidding 也允许" 都是 E2E 测试残留数据 — 数据污染,生产数据库有 6 条 buyer_001 的垃圾 brief
- **观察 [D]**: 卡片信息密度低 — 只有标题/状态/预算/平台,缺投标数(几条)/截止时间(几天后)/缩略图(IP 缩略)/中标创作者头像
- **观察 [E]**: 欢迎语 + 4 个 quick reply 看着像"机器人"开场,缺"最近在做什么"的承接
- **观察 [F]**: 中栏输入框底部 "📎" 附件按钮(浅灰色)看不出能否点击;右上 "↑" 发送按钮无 aria-label
- **观察 [G]**: "我的发包" 右栏标题下没"全部 →"链接,无法直接跳 /buyer/briefs 看完整列表

#### Step 1.3 — /buyer/chat 实际输入"我想做一个 30 秒的 AI 形象广告"
- LLM 误判意图 — 用户说"我想做"是 CREATE_BRIEF 强信号,助手却答"4 档授权 FAQ" + 2 个跳转 CTA
- **观察 [H]**: 助手把"我要发包"当 FAQ 答,没触发 CREATE_BRIEF intent → 买家要自己再去点"新建发包"按钮,绕了一圈
- **观察 [I]**: CTA 按钮"去形象库"/"联系商务"对"我要发包"无帮助 — 应优先给"开始创建发包 →"
- **观察 [J]**: 消息没"按日期分组"标记,长期使用分不清今天/昨天
- **观察 [K]**: 中栏只有"清空"按钮,无"导出对话"或"删除本轮" — 用户控制有限
- 发送按钮 "↑" 视觉 OK 但需 aria-label(已在 R10.3 部分加,但 R10.3 加的是 AI 估价按钮,不是这个)

#### Step 1.4 — /buyer/brief/new (P0 发现!)
- 表单 sections: 01 基本信息 / 02 品类 / 03 平台 / 05 套餐 / 06 截止 (04 IP 缺)
- **P0 [J]**: 04 数字人 IP 章节对 buyer_001 不显示 — 控制台看到 `GET /api/v1/ips/mine/list` 返回 403!
  - 后端 `ips.controller.ts:154` @Roles(CREATOR) 限制只创作者能查"我的 IP"
  - 前端 `BriefNewPage.vue:267` 不带角色直接调,403 后 catch 静默
  - **影响**: 已买过 IP 的买家永远看不到"让创作者用我的 IP 出镜"选项,断链
  - **修复**: 后端放开(buyer 可看自己买过的 IP,即 ipBuyer 关联)+ 前端 catch 时 console.warn 暴露
- AI 估价按钮守卫(R10.3)✅: title/description 填好后 disabled=false + tooltip 切到"基于 brief 内容..."
- 点击 AI 估价 → 调 /pricing/decompose + /pricing/estimate,本地 LLM mock 模式可能慢/失败
- **观察 [K]**: AI 估价返回 3 档推荐 + "⚡ 一键套用推荐档位 + 预算" 按钮 — 但点套用后会覆盖用户手动填的 budget,可能改用户心意

#### Step 1.5 — /buyer/briefs (我的发包)
- 共 20 条 brief,全部 E2E 测试残留(W6-R2/W6-R3/W6-R5/W6-R6/R10/EXPIRED 等)
- 顶部又有 dev 脚注 "R9 上线 · 列表 + chat 右栏 ResultsPane 各自独立..." 
- **观察 [L]**: 时间显示 ISO 格式 `2026-07-21T08:23:04.758Z` 对买家不友好 — 应该是"3 小时前"/"7 月 21 日 截止"
- **观察 [M]**: 状态徽标只有 bidding/in_progress/closed/draft 4 种,缺"已中标" "已交付" "待支付" 等更细的(和 /orders 状态对应)
- **观察 [N]**: 无排序选项(默认时间倒序,但不能切"按截止时间"/"按中标金额")
- **观察 [O]**: 无分页 — 20 条全显示,有 100 条会爆;新发包在最后(没置顶)
- **观察 [P]**: 每条 brief 卡片缺关键信息: 投标数(几条)/距离截止(几天)/中标创作者头像/最近操作时间
- **观察 [Q]**: 无批量操作(全部关闭 / 全部撤回 / 标星),管理效率低
- 4 个 tab (全部/草稿/投标中/已选标) 但没"已关闭" — 等等,有"已关闭"。5 个 tab。但状态 in_progress 在"已选标"里?语义混淆
- tab 切换无 URL 反映(刷新后丢失筛选态)

#### Step 1.6 — /orders (R10 P0-3 修复确认)
- 19 ENTRIES,R10 P0-3 修复确认:accept bid 同步创建 Order,所有 brief 中标都显示在 /orders
- 19 条全部 "中标待付" 状态 (E2E 测试残留)
- **观察 [S]**: 列表行没"去支付"快捷按钮,只能点行进详情再支付 → 19 条全要逐个点,体验差
- **观察 [T]**: 19 条全 ¥800-¥2000 状态待付,无"按状态筛选"tab — 后续真实用户也会积压,需"待支付/已支付/已退款"tab
- **观察 [U]**: 类型列 "中标待付" — 实际后端 orderType=DEPOSIT_INTENT(暂复用,R10.x 需补 BRIEF_DEPOSIT 枚举),前端已优雅降级
- 状态徽标 "I 待支付" 罗马数字不直观,普通用户不会懂 "I" = 待支付

#### Step 1.7 — /orders/:id (OrderDetailPage) 发现严重 P0
- 直接 URL `/orders/cmrkdw01k007kc5o6c0fladnj` 返回 API 404
- 因为 `/orders` 列表行 link 到 `/buyer/briefs/:briefId`(MyOrdersPage.vue:131),不是 `/orders/:orderId`
- 即使猜对 orderId, OrderDetailPage.vue:215 访问 `order.ip.displayName`,brief 订单 ip=null → 页面崩
- **P0 [T]**: brief-bid 订单 **没有支付入口** — 详情页没"去支付"按钮,BriefDetailPage 也没支付
- **P0 [U]**: OrderDetailPage 未适配 brief-bid 订单(`order.ip.displayName` 假设 ip 必存在)
- **影响**: buyer 中标后无法付款,业务流断在「中标 → 支付」环节
- **修复建议**:
  1. /orders 列表行 link 改 `/orders/:orderId`(统一路径)
  2. OrderDetailPage 兼容 brief(ip 显示 brief.title + 状态 + briefId 跳转)
  3. OrderDetailPage 加 "去支付" CTA(订单 status=CREATED 时显示)
  4. BriefDetailPage 顶部加 "💳 去支付" 按钮(¥amount 中标待付订单)

#### Step 1.8 — /buyer/briefs/:id (in_progress) → workspace (R10 P0-1 确认 ✅)
- in_progress brief 详情页正确显示 "WORKSPACE · 协作中" section + "进入工作区 →" 按钮 → `/workspaces/:wsId` ✅
- **注意**: brief 列表接口 `/buyer/briefs` 不含 workspace 关系(全 null),但**详情接口** `/buyer/briefs/:id` 含 workspace → R10 P0-1 判断在详情页生效,正确
- **观察 [V]**: 11 条 in_progress brief 里只有 "R10 验证 brief" 真有 workspace,其余 E2E 残留的 in_progress 没 workspace → 详情页会 fallback 到 "订单进行中,等待创作者开启协作"(R10 已处理),OK

#### Step 1.9 — /workspaces/:id (买家侧工作区)
- 页面渲染 OK:← 返回 brief + 标题「R10 验证 brief · 创作中」+ 预算/截止/打回次数 meta
- 中间稿 section(创作者上传,买家评论)+ 沟通记录 section(消息流 + 发送框)
- 空态文案友好:"还没有中间稿" / "还没有消息,发一条打个招呼吧"
- **观察 [W]**: workspace 顶栏无"去验收/去支付"入口 — 买家在工作区看到中间稿满意后,没有直接推进到「交付验收 → 支付」的 CTA(要退回 brief 详情)。工作区应是买家决策中心,缺闭环出口
- **观察 [X]**: meta 用美式日期 "7/21/2026"(brief 详情/列表是 ISO,orders 是 zh-CN)—— 全站时间格式 3 种混用,需统一

#### Step 1.10 — 通知(bell dropdown + /notifications)
- bell dropdown 正常:红点 1 + 列表(⏰ 任务包已过期关闭)+ "全部已读" + "查看全部通知 →" ✅
- /notifications 页做得好:杂志风 ALL/UNREAD tab + 相对时间"13 天前"+绝对时间"2026/7/1 15:57:34" + mark all read ✅
- **观察 [Y]**: 通知类型目前只见"过期关闭",投标到达/中标/中间稿上传/验收提醒等业务事件是否推通知未验证(数据里没有)— 需确认核心业务事件都发通知,否则买家/创作者错过关键节点

### buyer_001 小结
- **P0(3)**: [J] /ips/mine/list 403 断链 · [T] brief-bid 订单无支付入口 · [U] OrderDetailPage 未适配 brief 订单
- **闭环缺口**: 中标 → **支付**(整段缺失)· 工作区 → 验收/支付 出口缺失 [W]
- **数据污染**: buyer_001 有 20+ E2E 残留 brief / 19 残留 order,严重干扰真实体验(见 [C])
- **一致性**: 时间格式 3 种混用 [L][X] · 状态徽标罗马数字不直观 · dev 脚注未隐藏 [C]

---

### creator_001

#### Step 2.1 — /creator (控制台 三分屏)
- 三分屏渲染 OK:左 7 项 nav(AI助手/可接发包/我的任务/上传新IP/我的资产/API Key/实名)+ 中 chat + 右"可接发包"
- dev 脚注 "R3 三分屏 chat · AI 工具待开放" 仍在(同买家 [C])
- **观察 [Z0]**: 右栏只列"可接发包"(公开 bidding),**没有"我接的/进行中"tab** — 创作者中标后无处看进行中的 workspace(见 P0 [Z])

#### Step 2.2 — /creator/briefs (任务板 · R10 P0-4 确认 ✅)
- 20 条公开 brief,**0 条 EXPIRED**(R10 P0-4 双重过滤生效 ✅)
- 卡片信息密度**优于买家侧**:6D LEFT 倒计时 + 品类 + 套餐档 + 平台 + 当前价 ✅
- 有品类筛选 chips(全部/数字人广告/短视频/直播切片/营销海报/3D)

#### Step 2.3 — 投标流程 (R10.2 P1 确认 ✅)
- 打开一条已"已撤回"的 bid brief → 详情页 ACTION 区显示"你已报价 ¥800 / 已撤回 / 重新报价 →"(R10.2 撤回重投入口 ✅)
- 点"重新报价"→ SUBMIT BID 弹窗:价格 prefill 1500(= 当前价锚点)+ 红字"报价需在 ¥500-¥1,000 区间" + 提交按钮 disabled(R10.2 校验 ✅)
- 改价格→800(区间内)+ 提案填 31 字 → 提交按钮 enable ✅(未真正提交,避免污染数据)
- **观察 [AD]**: 数据异常 — brief 预算 ¥500-1,000 但"当前价 ¥1,500"(当前价 > budgetMax)。prefill 的 1500 一进来就不过自己的校验 → 困惑。要么 bump 逻辑越界,要么 seed 数据脏

#### Step 2.4 — /creator/tasks (我的任务) → P0 语义错位!
- **P0 [Z]**: nav "我的任务" 点进去是**「官方形象征集任务板 · 接单后版权归平台」**(0 ACTIVE / EMPTY BOARD)—— 与"我中标的发包"完全是两码事
  - 创作者中标 brief → 生成 workspace,但**全站没有一个列表页列出"我中标/进行中的 workspace"**
  - `bid mine` 接口是 per-brief 的(`creator/briefs/:briefId/bids/mine`),没有全局"我所有的投标/中标"聚合
  - workspace 只能靠 `/creator/workspace/:id` 深链(AI 工具生成流)进入 → **创作者投完标就"失联"了**
  - **影响**: 比买家侧 [W] 更严重 —— 买家至少能从 brief 详情进 workspace,创作者连列表入口都没有
  - **修复**: 新增 `/creator/workspaces` 列表页 + 后端 `GET creator/workspaces`(列 accepted bid 对应的 workspace);"我的任务"nav 指向它;官方征集板改名"官方征集"或移到别处

#### Step 2.5 — /creator/assets (我的资产) + IP 管理缺口
- /creator/assets = "Prompt 模板 / 数字人模型"(空态"还没有模板")
- **P1 [AA]**: **没有 `/creator/ips` 列表页** — 创作者已上传 1 个 IP(测试版权-IP, status PUBLIC_INTENT),但传完后无处回看/管理/查审核状态,只能靠 `/creator/ips/:id` 深链。上传→审核→上架 全链断在"看不到我传了什么"
- **观察 [AC]**: 术语跨角色冲突 —— 买家"我的资产"(/my-assets)= 买到的 IP 授权包;创作者"我的资产"(/creator/assets)= Prompt模板/模型。**同名"我的资产"两个角色含义完全不同**,用户切角色会懵

#### Step 2.6 — /creator/onboard (KYC)
- 页面做得好:杂志风 + SM2 加密说明 + 权益归属文案 ✅
- creator_001 KYC status=NOT_SUBMITTED,页面显示空白提交表单(正确)
- **观察 [AE]**: creator_001 **未 KYC 却已能投标 + 上传 IP** —— 业务门槛缺失?(要么 KYC 应前置到投标/上传前,要么至少 onboard 页反映"审核中/已认证"三态,现在永远是空表单)

### creator_001 小结
- **P0(1)**: [Z] 创作者无"我中标/进行中 workspace"列表 —— "我的任务"指向不相关的官方征集板,投标后失联
- **P1(1)**: [AA] 无 `/creator/ips` 列表,上传的 IP 无处管理/查状态
- **一致性**: [AC] "我的资产"跨角色同名异义 · [AD] 当前价越界 budgetMax · dev 脚注 · KYC 门槛缺失 [AE]
- **做得好**: R10 P0-4 EXPIRED 过滤 ✅ · R10.2 撤回重投+校验 ✅ · 任务板卡片密度 ✅ · KYC 页文案 ✅
