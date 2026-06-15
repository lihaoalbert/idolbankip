# syntax=docker/dockerfile:1.7
# ibi.ren · Admin (Vue 3) 静态站点

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
ENV CI=true

COPY pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json ./apps/admin/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@ibi-ren/admin..." --filter "@ibi-ren/shared-types..."

COPY tsconfig.base.json ./
COPY apps/admin ./apps/admin
COPY packages ./packages
RUN pnpm --filter @ibi-ren/admin run build

# ---- runtime ----
FROM nginx:1.27-alpine AS prod
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
COPY infra/docker/nginx/admin.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
