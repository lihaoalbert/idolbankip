# CLAUDE.md — Claude 在 ibi.ren 项目的工作约定

> 给 Claude 的全局协作准则。每次会话开头会自动加载。
>
> **目录**
> - 用户偏好与跨会话记忆 → `~/.claude/projects/-Users-app-ibi-ren/memory/`
> - 项目级约定、部署状态、已知坑 → [`AGENTS.md`](AGENTS.md)(506 行,接手 AI 必读)
> - 工程方法论(7 护栏 + 3-Phase Loop Engineering) → [`docs/loop-engineering.md`](docs/loop-engineering.md)
> - 架构总览 → [`docs/architecture.md`](docs/architecture.md)
> - 部署手册 → [`docs/deploy.md`](docs/deploy.md)
> - 凭据指针(ECS IP / SSH key / 域名 / bucket 名)→ memory `reference-ecs-deploy-paths`

---

## 1. 用户偏好 (default)

- **语言**:中文回复,技术名词 (API / deploy / commit 等) 保留英文;commit message 中文。
- **技术沟通**:用户非专业开发者,给技术决策要附"为什么",不要甩裸命令;关键选择给 1–2 个方案对比。
- **自动化优先**:重复 ≥3 步的操作 (部署、smoke、prisma 改 schema) 写成 `scripts/*.sh`;**不要让用户手抄多行命令**。
- **部署协助**:用户说"上线/发布/部署"时,**默认准备完整 SOP + 一键脚本**,不要等用户要。
- **决策边界**:Claude 可自主决定技术细节 (库选型、文件位置、命名);产品方向 (新功能上线、改价格) 由用户决定,Claude 提供方案让他选。

---

## 2. 严禁事项

| 类型 | 规则 |
|---|---|
| **凭据** | ❌ 任何账号/Key/密码/连接串/SSH 私钥/创世管理员密码**不入 git、不上传 GitHub、不贴到任何会被分享的地方**。`intfocus-albert.pem`、`.env`、`infra/.env` 永远是 git ignored,只在本机。 |
| **破坏性操作** | ❌ 未经确认前不要 `rm -rf`、`git reset --hard`、`git push --force`、`drop table`、`systemctl stop` 关键服务。 |
| **对外动作** | ❌ 未经确认前不要 push 到主仓 / 发 issue / 发 PR / 发邮件。 |
| **外部凭据泄漏** | ❌ `Bash(env)` 会 dump 所有环境变量,生产 ECS 上跑会把 `DATABASE_URL`、`OSS_ACCESS_KEY_SECRET` 等打印出来 — **生产 ECS 上一律禁止**;开发本机可临时用。 |
| **瞎猜 API** | ❌ 改 schema 后必跑 `pnpm exec prisma generate` (AGENTS §5.14);改 NestJS 模块后必跑 `timeout 6 node dist/main.js` smoke (§5.13)。 |

**commit 前自动扫描** (在 hooks 里固化,见 §6):

```bash
git diff --staged | grep -iE "LTAI[A-Za-z0-9]{12,}|AccessKey|password\s*[:=]|secret\s*[:=]|BEGIN.*PRIVATE|BEGIN.*RSA"
```

命中即 abort commit,人工 review。

---

## 3. 开发流程 — "完成" 的定义

每次改完代码必须跑完以下三步才算完成,**任何一步失败都不能算 done**:

```bash
# 1. 改 deps 后
pnpm install

# 2. 改哪个端 build 哪个 (三个端独立)
pnpm --filter @ibi-ren/api run build
pnpm --filter @ibi-ren/web run build
pnpm --filter @ibi-ren/admin run build

# 3. smoke
bash scripts/smoke.sh local          # 本地
bash scripts/smoke.sh ecs            # 远端
# 或一键:
bash scripts/deploy.sh               # build + sync + restart + smoke
```

**按改动的端验证**:

| 改动 | 必跑 |
|---|---|
| 改 `apps/api/src/**` | `pnpm exec prisma generate`(若改 schema) + `pnpm --filter @ibi-ren/api run build` + `cd apps/api && timeout 6 node dist/main.js`(看 Nest 启动日志,不要直接 restart) |
| 改 `apps/api/prisma/schema.prisma` | `pnpm exec prisma generate` + `pnpm --filter @ibi-ren/api exec prisma db push`(本地) + build + smoke |
| 改 `apps/web/src/**` 或 `apps/admin/src/**` | build + `grep -c "localhost:3000" dist/assets/client-*.js` 必须为 0 (§5.10) |
| 改 `apps/web/vite.config.ts` 或 `.env.production` | build + 验证 dist 里的 `baseURL` 是相对路径而非硬编码 |

---

## 4. 部署 SOP (ECS 单机,当前方案)

完整步骤见 [`AGENTS.md` §3.5 §4.6 §5](AGENTS.md)。骨架:

```bash
KEY="$HOME/Downloads/intfocus-albert.pem"
ECS="<公网 IP,见 memory reference-ecs-deploy-paths>"

# 本地 build 三端
pnpm --filter @ibi-ren/api run build
pnpm --filter @ibi-ren/web run build
pnpm --filter @ibi-ren/admin run build

# ECS (tar 走 ssh 管道,避免 rsync 路径空格问题;三端必须都同步)
for app in api web admin; do
  (cd "apps/$app/dist" && tar czf - .) | \
    ssh -i "$KEY" root@"$ECS" "(cd /opt/ibiren/apps/$app/dist && tar xzf -)"
done

# 软链 .env (systemd WorkingDirectory 是 apps/api)
ssh -i "$KEY" root@"$ECS" "cd /opt/ibiren/apps/api && ln -sf /opt/ibiren/.env .env"

# 重启 + smoke
ssh -i "$KEY" root@"$ECS" "systemctl restart ibiren-api && nginx -s reload"
ssh -i "$KEY" root@"$ECS" "ls -la /opt/ibiren/apps/{api,web,admin}/dist/{main.js,index.html}"
curl -s -o /dev/null -w "web:%{http_code} " http://$ECS:8080/
curl -s -o /dev/null -w "admin:%{http_code} " http://$ECS:8081/
curl -s -o /dev/null -w "health:%{http_code}\n" http://$ECS:8080/health
```

**一键版 (推荐):** `bash scripts/deploy.sh` — 内部完成上面所有步骤 (见 §6)。

**部署后必查**:三端 dist 时间戳都应是当天;若不同,说明某端没同步 (AGENTS §5.16 是经典踩坑)。

---

## 5. 已知坑速查 (致命 TOP-5)

完整 17 条见 [`AGENTS.md` §5 已踩过的坑](AGENTS.md)。最致命的:

1. **三端 dist 必须都同步**(§5.16)— 只 sync api 会出现"API 数据正常,页面是昨天版本",最容易被误判为"线上有 bug"。
2. **`pnpm install` 后必跑 `prisma generate`**(§5.14)— 不跑 `IsEnum` 装饰器在生产秒 crash,API 退到 0。
3. **systemd `WorkingDirectory` 是 `apps/api`,`ConfigModule` `.env` 相对它**(§5.15)— ECS 部署必须 `ln -sf /opt/ibiren/.env /opt/ibiren/apps/api/.env`。
4. **`AuthService.validatePayload` 必须返回 `{id, email, roles}`**(§5.2)— 直接返回 payload 导致 `req.user.id === undefined`,ownership 查询全过宽。
5. **Vite `VITE_API_BASE_URL` 用 `??` 不用 `||`**(§5.10)— `||` 把空字符串当未设,fallback 到 `http://localhost:3000`,部署后浏览器 Network Error。

---

## 6. 自动化与一键脚本

| 脚本 | 用途 | 用法 |
|---|---|---|
| `scripts/deploy.sh` | 一键部署 ECS (build + tar\|ssh + restart + smoke) | `bash scripts/deploy.sh` / `build` / `sync` / `restart` / `smoke` / `backup` |
| `scripts/rollback.sh` | 独立回滚 (vs deploy.sh 内嵌) | `bash scripts/rollback.sh` / `<backup>` / `--list` |
| `scripts/smoke.sh` | 三端冒烟 (web:8080/admin:8081/api:3100/health + ips) | `bash scripts/smoke.sh {local\|ecs\|<url>}` |
| `scripts/seed-deploy.sh` | ECS 上跑种子 (source .env + tsx) | `bash scripts/seed-deploy.sh {users\|ips\|all\|gen-images\|upload-thumbs\|status}` |
| `scripts/git-hooks/pre-commit` | commit 前 secret 扫描,命中 abort | `git config core.hooksPath scripts/git-hooks`(已设) |
| `scripts/git-hooks/pre-push` | push 前**增量** build 改动的端 (diff 范围判定, 慢但稳) | 共用 hooksPath;`IBI_REN_FULL_BUILD=1` 强制全量 |
| `scripts/deploy.env.example` | 部署凭据模板 | `cp scripts/deploy.env.example scripts/deploy.env` 后填值 |
| `scripts/deploy.env` | 本机部署凭据 (**gitignored**, ECS_IP/SSH_KEY_PATH) | deploy/rollback/seed-deploy 自动 source |

部署前确认 `scripts/deploy.env` 存在并填了 `ECS_IP` / `SSH_KEY_PATH`;首次 clone 后要 `git config core.hooksPath scripts/git-hooks` 装 hook。

---

## 7. 提交与仓库约定

- **commit message**: 中文,格式 `<type>(<scope>): <desc>`
  - 类型:`feat` / `fix` / `refactor` / `chore` / `docs` / `test`
  - scope: `api` / `web` / `admin` / `infra` / `docs` / `deps`
  - 例:`fix(api): JWT validatePayload 返回 id 而非 sub (§5.2)`
- **节奏**:一个完整 commit 就 `git push origin main`,**不攒批**(用户偏好)。
- **push 前**:`git status` 看是否有 `.env` / `*.pem` / `*.log`;有就 `git restore --staged <file>` 取消。
- **仓库**:`github.com/lihaoalbert/idolbankip`

---

## 8. 紧急情况处理

- **部署出问题**:`bash scripts/rollback.sh` 一键回滚到上一个 backup (`/opt/ibiren-backup-<date>.tar.gz`);`--list` 看所有 backup。
- **API 502 / 启动失败**:`AGENTS.md §9 故障排查 checklist` 优先看;常见是 dist 没同步、`prisma generate` 没跑、`KYC_CLIENT` 等 Symbol token 不匹配。
- **OSS 403**:桶权限 (RAM 子账号) + Block Public Access (§5.12) + CORS 三件套。
- **SSH 连不上 ECS**:`nc -zv -w 5 <ECS> 22` + `ssh-add -l`(确认 key 加载)。
- **用户急但 Claude 卡住**:立刻报告"我卡在 X,需要 Y 才能继续",不要硬撑。

---

> 最后更新:2026-06-19 — 初次建立。本文件由 Claude 维护,改完同步给用户 review。
