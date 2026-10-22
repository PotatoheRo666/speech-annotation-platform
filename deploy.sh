#!/bin/bash

# ============================================================================
# 声音标注系统 - 云服务器自动部署脚本
# 用法: bash deploy.sh
# ============================================================================

set -e

echo "=========================================="
echo "声音标注系统 - 自动部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# 第一步：检查环境
# ============================================================================
log_info "步骤 1/7: 检查环境"

# 检查 Python3
if ! command -v python3 &> /dev/null; then
    log_error "Python3 未安装，请先安装 Python3"
    exit 1
fi
log_info "✓ Python3 已安装: $(python3 --version)"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装，请先安装 Node.js"
    exit 1
fi
log_info "✓ Node.js 已安装: $(node --version)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    exit 1
fi
log_info "✓ npm 已安装: $(npm --version)"

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    log_warn "PM2 未全局安装，现在安装..."
    sudo npm install -g pm2
fi
log_info "✓ PM2 已安装: $(pm2 --version)"

# 检查 MySQL 连接
if ! command -v mysql &> /dev/null; then
    log_warn "MySQL 客户端未安装，跳过数据库检查"
else
    log_info "检查 MySQL 连接..."
    if mysql -h localhost -u voice_admin -p123456 -e "SELECT 1" &> /dev/null; then
        log_info "✓ MySQL 数据库连接成功"
    else
        log_error "MySQL 数据库连接失败，请检查数据库配置"
        exit 1
    fi
fi

# ============================================================================
# 第二步：创建虚拟环境
# ============================================================================
log_info "步骤 2/7: 创建 Python 虚拟环境"

if [ ! -d "venv" ]; then
    python3 -m venv venv
    log_info "✓ 虚拟环境已创建"
else
    log_info "✓ 虚拟环境已存在"
fi

source venv/bin/activate
log_info "✓ 虚拟环境已激活"

# ============================================================================
# 第三步：安装 Python 依赖
# ============================================================================
log_info "步骤 3/7: 安装 Python 依赖"

pip install --upgrade pip setuptools wheel > /dev/null 2>&1
log_info "✓ pip 已升级"

pip install -r requirements.txt > /dev/null 2>&1
log_info "✓ Python 依赖已安装"

# 验证关键依赖
python3 -c "import sqlalchemy, fastapi, oss2, pymysql" 2>/dev/null
log_info "✓ 关键依赖验证通过"

# ============================================================================
# 第四步：安装 Node.js 依赖并构建前端
# ============================================================================
log_info "步骤 4/7: 安装 Node.js 依赖并构建前端"

cd voice-h5
npm install > /dev/null
log_info "✓ Node.js 依赖已安装"

npm run build
log_info "✓ 前端已构建"

# 本地安装 serve（ecosystem.config.js 使用 ./node_modules/.bin/serve）
npm install serve > /dev/null
log_info "✓ serve 已安装"

cd ..

# ============================================================================
# 第五步：创建日志目录
# ============================================================================
log_info "步骤 5/7: 创建日志目录"

mkdir -p logs
log_info "✓ 日志目录已创建"

# ============================================================================
# 第六步：配置 PM2
# ============================================================================
log_info "步骤 6/7: 配置 PM2"

# 停止现有进程
pm2 delete all 2>/dev/null || true

# 启动新进程
pm2 start ecosystem.config.js
log_info "✓ PM2 进程已启动"

# 查看状态
pm2 status
log_info "✓ PM2 配置完成"

# ============================================================================
# 第七步：配置开机自启
# ============================================================================
log_info "步骤 7/7: 配置 PM2 开机自启"

pm2 startup > /dev/null 2>&1 || true
pm2 save
log_info "✓ PM2 开机自启已配置"

# ============================================================================
# 部署完成
# ============================================================================
echo ""
echo -e "${GREEN}=========================================="
echo "✓ 部署完成！"
echo "==========================================${NC}"
echo ""
echo "应用状态:"
pm2 list
echo ""
echo "查看日志:"
echo "  - API 日志:   pm2 logs voice-annotation-api"
echo "  - Web 日志:   pm2 logs voice-annotation-web"
echo "  - 实时监控:   pm2 monit"
echo ""
echo "应用访问:"
echo "  - 前端地址: http://$(hostname -I | awk '{print $1}'):80"
echo "  - API 地址: http://$(hostname -I | awk '{print $1}'):8000"
echo ""
echo "管理命令:"
echo "  - 重启应用: pm2 restart all"
echo "  - 停止应用: pm2 stop all"
echo "  - 启动应用: pm2 start all"
echo ""
