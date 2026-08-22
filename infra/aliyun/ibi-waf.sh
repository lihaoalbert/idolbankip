#!/bin/bash
# /usr/local/bin/ibi-waf.sh — ibi.ren HTTP WAF
# 每分钟跑一次 (cron.d): 扫 nginx access.log, ban 高频 4xx + 扫描器 + 路径爆破
#
# 2026-08-22 修复 (误杀真实用户事件):
# 1. 4xx 突增规则排除 /assets/ 静态资源 — 部署后浏览器旧缓存请求不存在的 hash 文件
#    会瞬间产生几十个 404, 正常用户被当成扫描器 ban 掉
# 2. SPIKE_THRESH 50 → 150 (50 太容易触发, 一个页面加载就能凑齐)
# 3. 解 ban 改用每轮 cron 扫 state 目录兜底 — 原 sleep 3600 子进程被 cron 回收后
#    规则永久残留 (事发时 1253 条残留规则, state 只剩 3 个)
# 4. 白名单加本机办公出口 IP (动态 IP, 变了要更新)

set -u

LOG=/var/log/nginx/access.log
STATE=/var/lib/ibi-waf/state
WHITELIST=/etc/ibi-waf.whitelist
BAN_TIME=3600           # ban 1 小时
LOG_WINDOW=2000         # 看最近 2000 行
BAD_PATH_THRESH=10      # 路径扫描阈值
SPIKE_THRESH=150        # 4xx 阈值 (>=150 次且占比 >70%)

mkdir -p "$STATE" 2>/dev/null

# 白名单 — 不 ban 自己和 ECS 内网
cat > "$WHITELIST" <<'WL'
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
100.64.0.0/10
39.184.175.187
WL

# ---- 兜底解 ban: state 里超过 BAN_TIME 的一律解除 (防规则残留) ----
NOW=$(date +%s)
for f in "$STATE"/*; do
  [ -f "$f" ] || continue
  TS=$(cat "$f" 2>/dev/null || echo 0)
  [[ "$TS" =~ ^[0-9]+$ ]] || TS=0
  if [ $((NOW - TS)) -gt "$BAN_TIME" ]; then
    IP="${f##*/}"
    while iptables -D INPUT -s "$IP" -j DROP 2>/dev/null; do :; done
    rm -f "$f"
    logger -t ibi-waf "UNBAN $IP (sweep)"
  fi
done

TMP=$(mktemp)
tail -n "$LOG_WINDOW" "$LOG" 2>/dev/null > "$TMP"

# 1. 路径爆破 — 单 IP 命中恶意路径次数 ≥ BAD_PATH_THRESH
SUSPECTS=$(
  grep -E '\.env|\.git|\.svn|\.aws/credentials|wp-admin|wp-login|phpmyadmin|admin\.php|etc/passwd|xmlrpc\.php|\.well-known/security|\.sql|/backup|\.bak|\.DS_Store' "$TMP" \
    | awk '{print $1}' \
    | sort | uniq -c | sort -rn \
    | awk -v t="$BAD_PATH_THRESH" '$1 >= t {print $2}'
)

# 2. 单 IP 4xx 比率 > 70% 且次数 ≥ SPIKE_THRESH (排除 /assets/ 静态资源 404)
SPIKE=$(
  awk -v thr="$SPIKE_THRESH" '
    {
      ip = $1
      path = $7
      status = $9
      if (path ~ /^\/assets\//) next
      if (status ~ /^4[0-9][0-9]$/) bad[ip]++
      total[ip]++
    }
    END {
      for (ip in total) {
        if (total[ip] >= thr && bad[ip]/total[ip] > 0.7) print ip
      }
    }
  ' "$TMP"
)

ALL=$(printf "%s\n%s\n" "$SUSPECTS" "$SPIKE" | sort -u | grep -v '^$')

if [ -z "$ALL" ]; then
  rm -f "$TMP"
  exit 0
fi

# 简易白名单匹配
is_whitelisted() {
  local ip="$1"
  local wl
  while IFS= read -r wl; do
    [ -z "$wl" ] && continue
    [[ "$wl" =~ ^# ]] && continue
    if [ "$ip" = "$wl" ]; then return 0; fi
    if [[ "$wl" == *"/"* ]]; then
      # CIDR — 用 ipcalc 算
      if ipcalc -c "$wl" >/dev/null 2>&1; then
        local net="${wl%/*}"
        if [[ "$ip" == "$net"* ]]; then
          return 0
        fi
      fi
    fi
  done < "$WHITELIST"
  return 1
}

while IFS= read -r IP; do
  [ -z "$IP" ] && continue
  [ -f "$STATE/$IP" ] && continue
  if is_whitelisted "$IP"; then continue; fi

  iptables -I INPUT 5 -s "$IP" -j DROP -m comment --comment "ibi-waf $(date +%Y%m%d-%H%M%S)"
  echo "$(date +%s)" > "$STATE/$IP"
  logger -t ibi-waf "BANNED $IP (path-scan or 4xx-spike)"
  echo "$(date '+%F %T') BANNED $IP" >> /var/log/ibi-waf.log
done <<< "$ALL"

rm -f "$TMP"
