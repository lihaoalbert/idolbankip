# syntax=docker/dockerfile:1.7
# =============================================================
# ibi.ren · API (NestJS) 多阶段构建
# 阶段1: deps  —— 安装所有依赖
# 阶段2: build —— 编译 TS + prisma generate
# 阶段3: prod  —— 仅保留运行时依赖
# =============================================================

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    CI=true

WORKDIR /repo

# ---- 阶段 1: 装依赖 ----
FROM base AS deps
# 把所有 workspace 的 manifest 先复制,缓存依赖层
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/admin/package.json ./apps/admin/
COPY packages/shared-contracts/package.json ./packages/shared-contracts/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui-kit/package.json ./packages/ui-kit/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ibi-ren/api..." --filter "@ibi-ren/shared-contracts..." --filter "@ibi-ren/shared-types..."

# ---- 阶段 2: 编译 ----
FROM base AS build
COPY --from=deps /repo /repo
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
# Prisma 需要 schema 才能 generate
RUN pnpm --filter @ibi-ren/api run prisma:generate
RUN pnpm --filter @ibi-ren/shared-contracts run build || true
RUN pnpm --filter @ibi-ren/shared-types run build || true
RUN pnpm --filter @ibi-ren/api run build
# 单独打一份 prisma client 给 prod 用
RUN pnpm --filter @ibi-ren/api run prisma:generate

# ---- 阶段 3: 运行时 ----
FROM node:22-alpine AS prod
RUN apk add --no-cache dumb-init curl
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100

# 生产依赖(不含 devDependencies)
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/packages/shared-contracts/package.json ./packages/shared-contracts/
COPY --from=build /repo/packages/shared-types/package.json ./packages/shared-types/
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && \
    pnpm install --prod --filter "@ibi-ren/api..." --filter "@ibi-ren/shared-contracts..." --filter "@ibi-ren/shared-types..."

# 复制编译产物 + Prisma schema
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/node_modules/.prisma ./apps/api/node_modules/.prisma
COPY --from=build /repo/packages/shared-contracts/dist ./packages/shared-contracts/dist
COPY --from=build /repo/packages/shared-types/dist ./packages/shared-types/dist

EXPOSE 3100
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "cd /app/apps/api && node dist/main.js"]
