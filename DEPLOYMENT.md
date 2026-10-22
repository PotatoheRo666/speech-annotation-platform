# 声音标注系统 - 服务器部署指南

## 服务器信息
- IP: your_server_ip
- SSH端口: 1145
- 用户名: root
- 系统: Linux

## 前置准备

### 1. SSH 连接到服务器
```bash
ssh -p 1145 root@your_server_ip
```

### 2. 安装系统依赖
```bash
# Ubuntu/Debian
apt-get update
apt-get install -y python3 python3-pip python3-venv nodejs npm mysql-server

# 或 CentOS/RedHat
yum install -y python3 python3-pip nodejs npm mysql-server
```

### 3. 启动MySQL服务
```bash
systemctl start mysql
systemctl enable mysql
```

## 部署步骤

### 1. 上传项目文件
```bash
# 在本地机器上执行
scp -r -P 1145 /path/to/qzcjweb root@your_server_ip:/opt/
```

### 2. 连接到服务器并进入项目目录
```bash
ssh -p 1145 root@your_server_ip
cd /opt/qzcjweb
```

### 3. 创建MySQL数据库
```bash
mysql -u root -p
```
```sql
CREATE DATABASE voice_annotation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 4. 配置 .env 文件
编辑 `.env` 文件，填写 MySQL 连接信息：

```bash
nano .env
```

确保以下信息正确：
- `DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/voice_annotation`
- OSS 配置（已预配置）
- 其他配置

### 5. 运行部署脚本
```bash
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
- 安装 Python 依赖
- 初始化数据库
- 安装前端依赖
- 启动 PM2 服务

### 6. 验证部署
```bash
pm2 status
pm2 logs
```

## 服务访问

- **后端 API**: `http://your_server_ip:8000`
- **前端 Web**: `http://your_server_ip:3000`
- **API 文档**: `http://your_server_ip:8000/docs`

## 常用 PM2 命令

```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs

# 查看特定应用日志
pm2 logs voice-annotation-api
pm2 logs voice-annotation-web

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all

# 启动服务
pm2 start ecosystem.config.js

# 删除服务
pm2 delete all
```

## 日志位置

- 后端日志: `/opt/qzcjweb/logs/`
- 前端日志: 通过 PM2 查看

## 故障排查

### 1. 数据库连接失败
```bash
# 检查 MySQL 是否运行
systemctl status mysql

# 检查 .env 文件中的 DATABASE_URL
cat .env | grep DATABASE_URL
```

### 2. OSS 连接失败
- 确认 OSS 凭证正确
- 确认网络能访问 OSS 端点

### 3. 前端无法连接后端
- 检查防火墙: `ufw allow 8000` 和 `ufw allow 3000`
- 检查后端是否运行: `pm2 status`

## 备份和恢复

### 数据库备份
```bash
mysqldump -u root -p voice_annotation > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 数据库恢复
```bash
mysql -u root -p voice_annotation < backup_20240101_120000.sql
```

## 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新安装依赖
pip install -r requirements.txt
cd voice-h5 && npm install && cd ..

# 重启服务
pm2 restart all
```

## 监控和维护

建议定期检查：
```bash
# 检查磁盘空间
df -h

# 检查内存使用
free -h

# 查看进程资源占用
pm2 monit
```

## 生产环境建议

1. **使用 Nginx 反向代理**
   ```nginx
   upstream backend {
       server 127.0.0.1:8000;
   }
   upstream frontend {
       server 127.0.0.1:3000;
   }
   
   server {
       listen 80;
       server_name your_server_ip;
       
       location /api {
           proxy_pass http://backend;
       }
       
       location / {
           proxy_pass http://frontend;
       }
   }
   ```

2. **启用 SSL 证书**
3. **配置日志轮转**
4. **定期备份数据库**
5. **监控磁盘空间和内存**

