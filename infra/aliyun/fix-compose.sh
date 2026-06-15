#!/usr/bin/env bash
# 修复 + 继续 bootstrap (在 Workbench 粘贴执行)
set -e

echo "=== 1. 修 docker-compose (下载真实 v2 二进制) ==="
# 删掉之前下错的空文件
rm -f /usr/local/bin/docker-compose
# 创建 docker compose v2 插件目录
mkdir -p /usr/local/lib/docker/cli-plugins
# 多个源依次试
DC_URLS=(
  "https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64"
  "https://ghfast.top/https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64"
  "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64"
)
for URL in "${DC_URLS[@]}"; do
  echo "  尝试: $URL"
  if curl -fsSL --max-time 90 -o /usr/local/lib/docker/cli-plugins/docker-compose "$URL" 2>/dev/null; then
    SZ=$(stat -c%s /usr/local/lib/docker/cli-plugins/docker-compose)
    if [ "$SZ" -gt 1000000 ]; then
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      echo "  ✅ 下载成功 ($SZ bytes)"
      break
    else
      echo "  ❌ 文件太小 ($SZ bytes),可能不是真二进制"
    fi
  fi
done
echo "  验证: $(docker compose version 2>&1 | head -1)"

# 同时创建 docker-compose 软链 (兼容 v1 命令)
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose
echo "  docker-compose: $(docker-compose version 2>&1 | head -1)"

echo ""
echo "=== 2. 继续 docker compose build + up ==="
cd /opt/ibiren/infra
docker compose pull 2>&1 | tail -3 || true
docker compose build --parallel 2>&1 | tail -15
docker compose up -d 2>&1 | tail -10
echo ""
echo "  容器状态:"
docker compose ps

echo ""
echo "=== 3. Prisma migration + 种子 ==="
docker compose exec -T api sh -c "cd apps/api && npx prisma migrate deploy 2>&1 | tail -10" || {
  echo "  ⚠️ 容器还没完全起来,等 30s 重试"
  sleep 30
  docker compose exec -T api sh -c "cd apps/api && npx prisma migrate deploy 2>&1 | tail -10"
}
docker compose exec -T api sh -c "cd apps/api && pnpm seed:users 2>&1 | tail -5"
docker compose exec -T api sh -c "cd apps/api && pnpm seed:ips 2>&1 | tail -5"

echo ""
echo "========================================="
echo "  ✅ 全部完成"
echo "========================================="
echo ""
echo "📍 访问入口:"
echo "   主站:  http://8.133.241.103:8080"
echo "   后台:  http://8.133.241.103:8081"
echo "   API:   http://8.133.241.103:3100/api/v1/health"
echo "   文档:  http://8.133.241.103:3100/api/docs"
echo "   边缘:  http://8.133.241.103:8088"
echo ""
echo "🔑 登录凭据:"
echo "   管理员:   admin@ibi.ren / Focus_2026!"
echo "   创作者:   creator_001@ibi.ren / Focus_2026!"
echo "   采购方:   buyer_001@ibi.ren / Focus_2026!"
echo ""
echo "📋 常用命令 (在 /opt/ibiren/infra 下):"
echo "   docker compose ps              # 容器状态"
echo "   docker compose logs -f api     # API 实时日志"
echo "   docker compose restart api     # 重启 API"
