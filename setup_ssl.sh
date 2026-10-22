#!/bin/bash
# SSL 证书配置脚本
# 使用方法: sudo bash setup_ssl.sh

set -e

DOMAIN1="caiji.gdzawl.com"
DOMAIN2="caiji.how88.top"
EMAIL="admin@$DOMAIN1"

echo "=========================================="
echo "  SSL 证书配置脚本"
echo "  域名: $DOMAIN1, $DOMAIN2"
echo "=========================================="

# 1. 检测系统并安装 certbot
echo ""
echo "[1/5] 安装 certbot..."
if command -v apt &> /dev/null; then
    apt update -qq
    apt install -y certbot python3-certbot-nginx
elif command -v yum &> /dev/null; then
    yum install -y epel-release
    yum install -y certbot python3-certbot-nginx
elif command -v dnf &> /dev/null; then
    dnf install -y certbot python3-certbot-nginx
else
    echo "错误: 无法检测包管理器，请手动安装 certbot"
    exit 1
fi
echo "✓ certbot 已安装"

# 2. 备份现有 Nginx 配置
echo ""
echo "[2/5] 备份 Nginx 配置..."
NGINX_CONF="/etc/nginx/sites-available/voice-annotation"
if [ ! -f "$NGINX_CONF" ]; then
    NGINX_CONF="/etc/nginx/conf.d/voice-annotation.conf"
fi
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "${NGINX_CONF}.bak.$(date +%Y%m%d%H%M%S)"
    echo "✓ 已备份到 ${NGINX_CONF}.bak.*"
else
    echo "⚠ 未找到 Nginx 配置文件，跳过备份"
fi

# 3. 开放 443 端口（如果使用 ufw）
echo ""
echo "[3/5] 检查防火墙..."
if command -v ufw &> /dev/null; then
    ufw allow 443/tcp 2>/dev/null || true
    echo "✓ 已开放 443 端口"
else
    echo "⚠ 未检测到 ufw，请确保防火墙已开放 443 端口"
fi

# 4. 申请证书
echo ""
echo "[4/5] 申请 SSL 证书..."
certbot --nginx \
    -d "$DOMAIN1" \
    -d "$DOMAIN2" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect

echo "✓ SSL 证书已申请成功"

# 5. 验证自动续期
echo ""
echo "[5/5] 验证自动续期..."
certbot renew --dry-run && echo "✓ 自动续期配置正常"

echo ""
echo "=========================================="
echo "  配置完成！"
echo "  HTTPS 访问: https://$DOMAIN1"
echo "  HTTPS 访问: https://$DOMAIN2"
echo "  证书有效期: 90 天（自动续期）"
echo "=========================================="
