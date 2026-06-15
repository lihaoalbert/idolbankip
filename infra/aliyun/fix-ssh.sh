#!/usr/bin/env bash
# =============================================================
# ECS SSH 22 端口修复 + 诊断
# 用法: 阿里云 ECS Workbench 终端粘贴执行
# 不会破坏现有服务
# =============================================================
set +e  # 不要中途退出,把所有诊断都打完

RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; NC=$'\e[0m'
PASS=0; FAIL=0

check() {
  local name="$1"; local cmd="$2"
  echo -n "  [ ] $name: "
  if eval "$cmd" >/dev/null 2>&1; then
    echo -e "${GRN}OK${NC}"; PASS=$((PASS+1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"; FAIL=$((FAIL+1))
    return 1
  fi
}

echo "========================================="
echo "  ECS SSH 22 端口诊断"
echo "  时间: $(date '+%F %T')"
echo "========================================="
echo ""

# ---------- 1. sshd 进程 ----------
echo "▶ [1/6] sshd 进程"
check "sshd 进程存在" "pidof sshd"
if pidof sshd >/dev/null 2>&1; then
  echo "    pid: $(pidof sshd)"
  ps -fp $(pidof sshd | tr ' ' ',') 2>/dev/null | tail -n +2
else
  echo -e "    ${RED}❌ sshd 进程不存在${NC}"
fi

# ---------- 2. 端口监听 ----------
echo ""
echo "▶ [2/6] 22 端口监听"
check "ss 能用" "command -v ss"
LISTEN=$(ss -tlnp 2>/dev/null | grep -E ':22\b' || echo "")
if [ -n "$LISTEN" ]; then
  echo -e "    ${GRN}✅ 22 端口在监听${NC}"
  echo "$LISTEN" | sed 's/^/      /'
else
  echo -e "    ${RED}❌ 22 端口没监听${NC}"
fi

# ---------- 3. sshd 配置 ----------
echo ""
echo "▶ [3/6] sshd 配置"
if [ -f /etc/ssh/sshd_config ]; then
  PORT=$(grep -E '^Port ' /etc/ssh/sshd_config | awk '{print $2}')
  LISTEN_ADDR=$(grep -E '^ListenAddress' /etc/ssh/sshd_config)
  echo "    Port: ${PORT:-22 (默认)}"
  echo "    ListenAddress: ${LISTEN_ADDR:-0.0.0.0 (默认)}"
  check "sshd_config 语法" "sshd -t"
else
  echo -e "    ${RED}❌ /etc/ssh/sshd_config 不存在${NC}"
fi

# ---------- 4. iptables / nftables ----------
echo ""
echo "▶ [4/6] iptables / nftables"
if command -v iptables >/dev/null 2>&1; then
  echo "    iptables INPUT 链前 5 条:"
  iptables -L INPUT -n --line-numbers 2>/dev/null | head -6 | sed 's/^/      /'
  # 统计 DROP
  DROP_CNT=$(iptables -L INPUT -n 2>/dev/null | grep -cE 'DROP|REJECT')
  echo "    DROP/REJECT 规则数: $DROP_CNT"
  if [ "$DROP_CNT" -gt 0 ]; then
    echo -e "    ${YEL}⚠️  检测到 DROP 规则${NC}"
  fi
else
  echo "    iptables 未装"
fi
if command -v nft >/dev/null 2>&1; then
  echo "    nftables 规则:"
  nft list ruleset 2>/dev/null | head -20 | sed 's/^/      /'
fi
check "firewalld 未启用" "! systemctl is-active --quiet firewalld"

# ---------- 5. fail2ban / sshguard ----------
echo ""
echo "▶ [5/6] 防爆破工具"
if command -v fail2ban-client >/dev/null 2>&1; then
  echo "    fail2ban 在跑"
  fail2ban-client status sshd 2>/dev/null | head -10 | sed 's/^/      /'
else
  echo "    fail2ban 未装"
fi
if command -v sshguard >/dev/null 2>&1; then
  echo -e "    ${YEL}⚠️  sshguard 在跑${NC}"
  sshguard-list-banned 2>/dev/null | head -5
fi

# ---------- 6. 自己的公网 IP (看看是不是被 ban 了) ----------
echo ""
echo "▶ [6/6] 你的公网 IP (从 ECS 看)"
MY_IP=$(curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || echo "未知")
echo "    客户端 IP: $MY_IP"

# =============================================================
# 自动修复
# =============================================================
echo ""
echo "========================================="
echo "  自动修复"
echo "========================================="

# ---------- 修 1: 重启 sshd ----------
echo ""
echo "▶ 修 1: 重启 sshd"
if ! pidof sshd >/dev/null 2>&1; then
  echo "    sshd 没在跑,启动"
  systemctl start sshd
  sleep 2
fi
systemctl restart sshd 2>&1 | head -3
sleep 2
if pidof sshd >/dev/null 2>&1; then
  echo -e "    ${GRN}✅ sshd 起来了 (pid: $(pidof sshd))${NC}"
else
  echo -e "    ${RED}❌ sshd 仍没起来,看日志${NC}"
  journalctl -u sshd --no-pager -n 20 2>/dev/null | tail -15
fi

# ---------- 修 2: 检查监听 ----------
echo ""
echo "▶ 修 2: 检查 22 端口"
ss -tlnp 2>/dev/null | grep -E ':22\b' || {
  echo -e "    ${RED}22 端口仍没监听${NC}"
  echo "    尝试显式配置 ListenAddress 0.0.0.0:"
  sed -i 's/^#\?ListenAddress.*/ListenAddress 0.0.0.0/' /etc/ssh/sshd_config
  systemctl restart sshd
  sleep 2
  ss -tlnp 2>/dev/null | grep -E ':22\b' || echo "    仍没监听,需进一步排查"
}

# ---------- 修 3: 清掉 /var/empty/sshd 权限问题 ----------
echo ""
echo "▶ 修 3: sshd 必备目录权限"
mkdir -p /var/empty/sshd
chmod 711 /var/empty/sshd
chown root:root /var/empty/sshd
ls -ld /var/empty/sshd

# ---------- 修 4: 临时放行 22 端口 (iptables) ----------
echo ""
echo "▶ 修 4: iptables 临时放行 22"
if command -v iptables >/dev/null 2>&1; then
  # 检查是否已有 ACCEPT 22 规则
  if ! iptables -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null; then
    # 在规则链最前面加一条放行
    iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT 2>&1 | head -2
    echo "    已添加 iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT"
  else
    echo "    iptables 已有 22 ACCEPT 规则"
  fi
  echo "    当前 INPUT 链前 5 条:"
  iptables -L INPUT -n --line-numbers 2>/dev/null | head -6 | sed 's/^/      /'
fi

# ---------- 修 5: 保存 iptables 规则 ----------
echo ""
echo "▶ 修 5: 持久化 iptables"
if command -v iptables-save >/dev/null 2>&1; then
  iptables-save > /etc/iptables.rules 2>/dev/null
  echo "    iptables 规则已存到 /etc/iptables.rules"
fi
# 永久化 (Aliyun Linux 4 用 iptables-services 或 firewalld)
if ! systemctl is-active --quiet firewalld; then
  dnf install -y iptables-services 2>/dev/null
  systemctl enable iptables 2>/dev/null
  systemctl restart iptables 2>/dev/null
fi

# =============================================================
# 最终验证
# =============================================================
echo ""
echo "========================================="
echo "  最终验证"
echo "========================================="
sleep 2
echo ""
echo "  sshd 进程: $(pidof sshd 2>/dev/null || echo '❌ 没在跑')"
echo ""
echo "  22 端口状态:"
ss -tlnp 2>/dev/null | grep -E ':22\b' | sed 's/^/    /' || echo "    ❌ 没监听"

echo ""
echo "  本机测 22 端口连通 (TCP):"
if timeout 5 bash -c 'cat </dev/tcp/127.0.0.1/22' 2>/dev/null; then
  echo -e "    ${GRN}✅ 127.0.0.1:22 通${NC}"
else
  echo -e "    ${RED}❌ 127.0.0.1:22 不通${NC}"
fi

echo ""
echo "  sshd 状态:"
systemctl status sshd --no-pager -n 5 2>/dev/null | tail -8

echo ""
echo "========================================="
echo "  下一步"
echo "========================================="
echo ""
echo "  在你本地 (Mac) 试 SSH:"
echo "    ssh -v root@8.133.241.103"
echo ""
echo "  如果还连不上,把你的公网 IP (上面打印的) 报给我,"
echo "  我会进一步分析。"
echo ""
echo "  ⚠️  注意: ECS 安全组入方向 22 端口必须放行,"
echo "     源 IP 设为 0.0.0.0/0 (或你的公网 IP)。"
