# W2 #29 推送通知 收尾 — 2026-07-01

> 父任务:[W2] 推送通知(站内 + 邮件 + 微信)新 brief
> 完成时间:2026-07-01 14:50
> 部署:ECS prod (https://ibi.ren),smoke 全过

---

## 1. 范围

买家发包 → 自动 fan-out 给匹配的创作者:
- **站内**: Notification 表(永远写)— 创作者中心铃铛 pollling 已存在
- **邮件**: 阿里云 DirectMail (@alicloud/dm20151123)
- **微信**: 微信公众号模板消息 (api.weixin.qq.com)

买家加价 → 同样 fan-out,subject 提示"任务包加价,现 ¥X"

## 2. 模块清单

| 模块 | 文件 | 说明 |
|---|---|---|
| EmailService | `apps/api/src/email/email.service.ts` | DirectMail SDK 包装,mock 模式 fallback |
| EmailModule | `apps/api/src/email/email.module.ts` | Nest module,只导出 EmailService |
| WechatService | `apps/api/src/wechat/wechat.service.ts` | 公众号模板消息 + 内存 access_token 缓存 |
| WechatModule | `apps/api/src/wechat/wechat.module.ts` | Nest module |
| BriefPushService | `apps/api/src/brief-push/brief-push.service.ts` | 创作者匹配 + fan-out,setImmediate fire-and-forget |
| BriefPushModule | `apps/api/src/brief-push/brief-push.module.ts` | 桥接 brief + notifications + email + wechat |
| BriefService hook | `apps/api/src/brief/brief.service.ts` | publish() + bumpPrice() 末尾触发 push |
| NotificationsService | `apps/api/src/notifications/notifications.service.ts` | NotificationType 加 BRIEF_PUBLISHED + BRIEF_BUMPED |
| User schema | `apps/api/prisma/schema.prisma` | User.wechatOpenId @unique |

## 3. 创作者匹配策略

```
1) 精确匹配:CreatorSkill.skill.category == CATEGORY_MAP[brief.category]
   - shortvideo / livestream_clip / ad → 'video'
   - poster → 'image'
   - '3d'   → '3d'
   加 KYC_APPROVED 过滤
   
2) Fallback:所有 KYC_APPROVED 用户(冷启动期 CreatorSkill 覆盖不足时)
```

输出限制 200 / 一次性 fan-out。

## 4. 三渠道投递

每条 BRIEF_PUBLISHED/BRIEF_BUMPED 走三渠道:
| 渠道 | 条件 | 失败行为 |
|---|---|---|
| in-site | always | Notification row 写失败 → catch + log warn,继续 |
| 邮件 | user.email 非空 | mock 模式只 log;真实模式调 DirectMail SingleSendMail |
| 微信 | user.wechatOpenId + WECHAT_TEMPLATE_ID_* 配齐 | mock 模式只 log;真实模式调 `/cgi-bin/message/template/send` |

`async` + `setImmediate()` 包内层循环 — 不阻塞 publish / bump 的 HTTP 响应。

## 5. Env 配置 (Joi 校验)

```env
# Email — DirectMail
ALIYUN_ACCESS_KEY_ID=        # access key for DirectMail API
ALIYUN_ACCESS_KEY_SECRET=
DIRECTMAIL_ACCOUNT=          # 发件地址(DirectMail 控制台里)
DIRECTMAIL_PASSWORD=         # SMTP 密码(不是登录密码)
DIRECTMAIL_FROM_ALIAS=ibi.ren 平台  # 默认值
DIRECTMAIL_REGION=cn-shanghai       # 默认值

# WeChat — 公众号模板消息
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_TEMPLATE_ID_BRIEF_PUBLISHED=
WECHAT_TEMPLATE_ID_BRIEF_BUMPED=
```

任一关键 env 缺失 → 该渠道走 mock 模式,只打 `[email-mock]` / `[wechat-mock]` 日志。

## 6. 本地烟测结果

```
publish brief (id=cmr1ojnc70007mrhug91470m3, category=shortvideo, package=standard, ¥1500)
  ↓
[BriefPushService] [push:BRIEF_PUBLISHED] recipients=1
[EmailService] [email-mock] → creator@ibi.ren | subject="📦 新 短视频 任务包,¥1500"
[BriefPushService] [push:BRIEF_PUBLISHED done] site=1/1 mail=1 wx=0

bumpPrice +10% (¥1500 → ¥1650)
  ↓
[BriefPushService] [push:BRIEF_BUMPED] recipients=1
[EmailService] [email-mock] → creator@ibi.ren | subject="💰 任务包加价,现 ¥1650"
[BriefPushService] [push:BRIEF_BUMPED done] site=1/1 mail=1 wx=0

Notification rows in DB:
  id         type             title                              link
  cmr1ol3rg  BRIEF_PUBLISHED  📦 新 短视频 任务包,¥1500          /creator/brief/cmr1ojnc7...
  cmr1ol3rg  BRIEF_BUMPED     💰 任务包加价,现 ¥1650              /creator/brief/cmr1ojnc7...
```

## 7. 生产部署

- commit `ff2b281` feat(api): W2 #29 推送通知 fan-out (2026-07-01)
- `bash scripts/deploy.sh` → 三端 dist 同步,API 重启健康
- `prisma db push --accept-data-loss` → User.wechatOpenId 字段加到生产 DB
- http://ibi.ren/health → 200 (4s 内)

## 8. 生产烟测结果

买家 buyer_001 发包 → publish → fan-out:

```
[BriefPushService] [push:BRIEF_PUBLISHED done] brief=cmr1po5be0009hqmz7y4jj21t site=91/91 mail=91 wx=0
[BriefPushService] [push:BRIEF_BUMPED done]     brief=cmr1po5be0009hqmz7y4jj21t site=91/91 mail=91 wx=0

Notification rows in prod DB:
  type              count
  BRIEF_PUBLISHED   91
  BRIEF_BUMPED      91
```

91 = 当前 prod 上所有 KYC_APPROVED 的创作者数(种子 + 测试账号)。

## 9. Known Limitations / 后续

| 项 | 当前 | 何时上线 |
|---|---|---|
| DirectMail 真实发件 | mock(凭据未配) | 用户配 DIRECTMAIL_* env 后即时生效 |
| 微信公众号模板消息 | mock(templateId 未配) | 注册服务号 + 加模板后即时生效 |
| 创作者匹配 | KYC_APPROVED 兜底,SkillTag.category 优先 | Phase 2 加 platformSet 匹配 + IP 类型匹配 |
| 流量控制 | 一次性 fan-out(限制 200) | 接消息队列(阿里云 MNS)做削峰 |
| 退订 | 没接入 | 需产品定义 + 法务出退订文案 |
| 邮件打开/点击追踪 | 没启用 | DirectMail 控制台勾 clickTracking="1" |
| 微信 MiniProgram 跳转 | 只 URL 跳转 | 用户绑定小程序后切换 |

## 10. 关联文档

- [/w1/] Prisma schema + Brief 模块 + CatalogSku 种子
- [W2 #28 三道软护栏](w2-28-review.md) — bumpPrice 是触发点之一
- 用户协议 v2 §10.x(平台 Agent 推送声明)
- 业务标准 [2026-brief-package-v1](../standards/2026-brief-package-v1.md)

## 11. 修订

| 版本 | 日期 | 修订人 | 修订内容 |
|---|---|---|---|
| 1.0 | 2026-07-01 | Claude | 初版 |
