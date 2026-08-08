# 数字人陪伴 App API — 对接文档

> **状态**:Phase 1 Mock 阶段,5 端点已上线,真接口替换后此文档保持兼容。
> **Base URL**:`http://<host>/v1`(跟 ibi.ren 自己 `/api/v1/*` 互不重叠)
> **鉴权**:OAuth 2.0 Password Grant(mock 阶段任何 email/password 都过)

---

## 0. 接入步骤(60 秒)

```bash
# 1. 登录拿 token
curl -X POST http://<host>/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"any@example.com","password":"any"}'
# → { "access_token": "...", "expires_in": 3600, "token_type": "Bearer" }

# 2. 调业务接口(后面 4 个都带 Authorization header)
curl http://<host>/v1/ips \
  -H "Authorization: Bearer <access_token>"
```

App 端:
- access_token 有效期 **1 小时**,到期前调 `/v1/auth/login` 重登(mock 阶段直接换发;真接口会接 refresh_token)
- 全部请求走 HTTPS(生产),本地开发可走 HTTP

---

## 1. 错误信封(全局统一)

非 2xx 响应统一 shape:

```json
{
  "statusCode": 401,
  "code": "HTTP_401",
  "message": {
    "error": {
      "code": "unauthorized",
      "message": "missing or malformed Authorization header",
      "request_id": null
    }
  },
  "path": "/v1/ips",
  "timestamp": "2026-06-23T10:53:28.844Z"
}
```

错误码字典:

| HTTP | error.code | 含义 | App 处理建议 |
|---|---|---|---|
| 400 | `invalid_request` | 缺参 / 参数错 | 客户端 bug,展示用户提示 |
| 401 | `unauthorized` | token 无 / 过期 / 错 | 跳登录 |
| 404 | `ip_not_found` | IP 不存在或无授权 | 列表里删掉这个 id |
| 404 | `asset_not_found` | asset 名错 | 不重试,记录埋点 |
| 429 | (throttler) | 限流 | 退避后重试 |

`request_id` 字段:目前 mock 阶段为 `null`,真接口会带追踪 id,排查问题时贴给后端。

---

## 2. 端点契约

### 2.1 `POST /v1/auth/login`

OAuth 2.0 Password Grant(mock 简化版:任何 email/password 都过)。

**Request**:
```json
{
  "email": "dev@ni.example.com",
  "password": "any-string"
}
```

**Response 200**:
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**字段说明**:
- `access_token`: 调业务接口用,1h 过期
- `refresh_token`: mock 阶段暂未启用,真接口会接 refresh 流程
- `expires_in`: 3600 秒

**错误**:
- `400 invalid_request` — email 缺失

---

### 2.2 `GET /v1/ips`

列出当前用户已购 IP。Mock 阶段返 3 个 fixture:苏晚 / 傲云 / 李泽。

**Query params**:
| 参数 | 必填 | 类型 | 默认 | 说明 |
|---|---|---|---|---|
| `page` | 否 | int | 1 | 1-indexed |
| `page_size` | 否 | int | 20 | 最大 100 |
| `status` | 否 | string | — | `active`(perpetual+subscription)/ `expired` / 不传(全部) |

**Response 200**:
```json
{
  "items": [
    {
      "id": "ip_ni_suwan_001",
      "name": "苏晚",
      "avatar_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
      "preview_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
      "tags": ["温柔", "内敛", "建筑师", "上海"],
      "voice_id": "volcano_voice_zh_female_calm_01",
      "personality_summary": "28岁建筑设计师,独居上海,喜欢爵士乐和混凝土的质感。",
      "license_type": "personal_perpetual",
      "license_expires_at": null,
      "downloaded_at": "2026-06-15T10:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "page_size": 20,
  "has_more": false
}
```

`license_type` 枚举:`personal_perpetual` / `personal_subscription` / `commercial`

---

### 2.3 `GET /v1/ips/:id`

IP 详情 — 包含 character 子对象(性格/背景/说话风格/边界/memory_seed)+ assets + license。

**Response 200**(以苏晚为例):
```json
{
  "id": "ip_ni_suwan_001",
  "name": "苏晚",
  "avatar_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
  "preview_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
  "character": {
    "id": "char_suwan_001",
    "name": "苏晚",
    "personality_traits": ["温柔", "内敛", "理性", "略带幽默"],
    "backstory": "苏晚,28岁,建筑设计师,独居上海法租界老洋房...",
    "speaking_style": {
      "tone": "温和、克制、有分寸感",
      "catchphrases": ["我觉得...", "你这么说让我想到...", "让我想想..."],
      "sentence_style": "中等长度句子,多用逗号,少用感叹号"
    },
    "boundaries": ["不讨论政治", "不提供医疗/法律建议", "不主动评价他人外表"],
    "memory_seed": "我叫苏晚,是一名建筑设计师...",
    "voice_id": "volcano_voice_zh_female_calm_01",
    "metadata": { "era": "modern", "region": "上海", "occupation": "建筑设计师" }
  },
  "license": {
    "type": "personal_perpetual",
    "scope": "personal_companion_use",
    "allowed_platforms": ["ios", "android"],
    "download_quota": 3,
    "download_used": 0,
    "expires_at": null,
    "can_offline_use": true
  },
  "assets": {
    "preview_2k_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
    "preview_4k_url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg",
    "voice_sample_url": "https://placehold.co/300x50/png?text=SuWan+Voice+30s",
    "expression_set_url": "https://placehold.co/100x100/png?text=SuWan+Expressions"
  }
}
```

**character 字段是给对话系统用的**:
- `personality_traits` + `speaking_style` → 喂给 LLM system prompt
- `boundaries` → 喂给 LLM safety filter
- `memory_seed` → 初始人设,首次对话前注入
- `metadata` → 可选,UI 标签用

**错误**:
- `404 ip_not_found` — id 不存在或数据不完整

---

### 2.4 `GET /v1/ips/:id/license`

License 校验 — 在下载资源前先调一次,确认是否过期 / 是否允许离线。

**Response 200**:
```json
{
  "valid": true,
  "type": "personal_perpetual",
  "scope": "personal_companion_use",
  "download_quota_remaining": 3,
  "expires_at": null,
  "can_offline_use": true
}
```

`can_offline_use` 三种 license 的规则:
| license_type | download_quota | can_offline_use | expires_at |
|---|---|---|---|
| `personal_perpetual` | 3 | true | null(永不过期) |
| `personal_subscription` | 10 | true | 有到期日 |
| `commercial` | 999 | false | 有到期日 |

App 端建议:
- `valid=false` → 弹订阅续费
- `can_offline_use=false` → 不缓存资源,每次会话前重新拉 signed URL
- `download_quota_remaining<=0` → 弹"已用完下载次数"

---

### 2.5 `GET /v1/ips/:id/signed-url`

为指定 asset 生成临时签名 URL。

**Query params**:
| 参数 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `asset` | 是 | enum | `preview_2k` / `preview_4k` / `voice_sample` / `expression_set` |

**Response 200**:
```json
{
  "url": "https://ibi-public.oss-cn-shanghai.aliyuncs.com/mock-ni-api/suwan-portrait.jpg&mock_signed=true&expires=3600",
  "expires_at": "2026-06-23T11:53:28.832Z",
  "expires_in_seconds": 3600
}
```

**字段说明**:
- `expires_in_seconds`: mock 阶段固定 **3600 秒**,真接口会按 asset 类型分级(头像可能 24h,语音包可能 7d)
- App 缓存策略:URL 拿到后立刻下载,不要存 URL 反复用

**错误**:
- `400 invalid_request` — asset 参数缺失
- `404 asset_not_found` — asset 名错(可选值见上表)
- `404 ip_not_found` — IP 不存在

---

## 3. 完整 curl 示例(可复制)

```bash
HOST="http://127.0.0.1:3000"

# Login
TOKEN=$(curl -s -X POST "$HOST/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@ni.example.com","password":"any"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# List IPs
curl -s "$HOST/v1/ips?page=1&page_size=20&status=active" \
  -H "Authorization: Bearer $TOKEN"

# Detail
curl -s "$HOST/v1/ips/ip_ni_suwan_001" \
  -H "Authorization: Bearer $TOKEN"

# License check
curl -s "$HOST/v1/ips/ip_ni_suwan_001/license" \
  -H "Authorization: Bearer $TOKEN"

# Signed URL for voice_sample
curl -s "$HOST/v1/ips/ip_ni_suwan_001/signed-url?asset=voice_sample" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 4. Mock 阶段已知限制(跟真接口差异)

| 项 | Mock | 真接口 |
|---|---|---|
| 鉴权 | 任何 email/password 都过,固定 sub=mock-user-ni-v1 | 走 OAuth 真密码校验 + 用户表 |
| IP 列表 | 固定 3 个 fixture(苏晚/傲云/李泽),所有人看到同一份 | 按 user_id 查已购 IP |
| signed URL | 1h 固定 + `mock_signed=true` 标记 | OSS 真签名,分级 expiry |
| `download_used` | 始终 0,不会自增 | 真实计数 |
| License 过期判断 | 仅 `license_expires_at < now` | 加宽限期/续费状态 |
| Request ID | 始终 null | 接入阿里云 SLS / 自家 trace |

mock 阶段目的是 **shape 锁定 + 并行开发** — 真接口替换时仅改 service 层,controller / DTO / 端点 shape 不动。

---

## 5. 真接口切换 checklist(给 ibi.ren 团队)

- [ ] 替换 `ni-api.service.ts` 的 5 个方法,接 DB 查询(可参考 `apps/api/src/ips/`)
- [ ] `MockNiJwtGuard` 换成生产 `JwtAuthGuard`(已有,见 `auth/jwt.strategy.ts`)
- [ ] `fixtures.ts` 删掉,改成 Prisma 查询 + OSS 签名 URL 生成
- [ ] 苏晚/傲云/李泽 3 个 IP 落库 + 上传 OSS 真图(苏晚的 `mock-ni-api/suwan-portrait.jpg` 可复用)
- [ ] refresh_token 流程接入(目前 mock 直接重发 access_token)
- [ ] request_id 接入 trace 系统
- [ ] `BLUEPRINT_NI_API_MOCK` env 开关(默认 true,真接口稳定后 false,渐进切换)

---

## 6. 端到端测试覆盖

13 个 e2e 测试已绿,覆盖:
- OAuth login + 400 missing email
- list:401 no token / 401 bad token / 200 正常 / status filter
- detail:200 正常 / 404 unknown id
- license:perpetual vs commercial(can_offline_use 区分)
- signed-url:preview_2k / 400 missing asset / 404 invalid asset

跑测试:`pnpm --filter @ibi-ren/api test`
服务起停:`cd apps/api && node dist/main.js`

---

**更新**:2026-06-23 — Phase 1 Mock 首版
**Owner**:ibi.ren API 团队
**Contact**:见 memory `reference-ecs-deploy-paths`