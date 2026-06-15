# syntax=docker/dockerfile:1.7
# ibi.ren · Web (Vue 3) 静态站点
# 构建产物交给 nginx 提供

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
ENV CI=true

COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/ui-kit/package.json ./packages/ui-kit/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ibi-ren/web..." --filter "@ibi-ren/shared-types..." --filter "@ibi-ren/ui-kit..."

COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN pnpm --filter @ibi-ren/web run build

# ---- runtime ----
FROM nginx:1.27-alpine AS prod
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx/web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
