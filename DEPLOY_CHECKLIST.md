# 部署前检查清单

## 本地准备

- [ ] 代码已备份
- [ ] .env 文件已配置
- [ ] requirements.txt 已检查
- [ ] voice-h5/package.json 已检查

## 服务器准备

- [ ] 可以 SSH 连接到服务器
- [ ] 服务器已安装 Python 3.8+
- [ ] 服务器已安装 Node.js 14+
- [ ] 服务器已安装 MySQL 5.7+
- [ ] MySQL 服务已启动

## 配置确认

### MySQL 配置
需要以下信息填写到 .env：
```
DATABASE_URL=mysql+pymysql://用户名:密码@主机:端口/数据库名
```

**需要确认:**
- [ ] MySQL 用户名：`root` (当前)
- [ ] MySQL 密码：______________________
- [ ] MySQL 主机：`localhost` (当前)
- [ ] MySQL 端口：`3306` (当前)
- [ ] 数据库名：`voice_annotation` (当前)

### OSS 配置
以下信息已预配置：
- ✓ OSS_ENDPOINT: oss-cn-hangzhou.aliyuncs.com
- ✓ OSS_ACCESS_KEY_ID: your_aliyun_access_key_id
- ✓ OSS_ACCESS_KEY_SECRET: your_aliyun_access_key_secret
- ✓ OSS_BUCKET_NAME: audio-collection-zzwm-1

## 部署步骤

1. [ ] 修改 .env 文件中的 MySQL 密码
2. [ ] 上传项目文件到 /opt/qzcjweb
3. [ ] 在服务器上创建 MySQL 数据库
4. [ ] 运行 deploy.sh 脚本
5. [ ] 验证 PM2 进程状态
6. [ ] 测试 API: http://your_server_ip:8000/docs
7. [ ] 测试前端: http://your_server_ip:3000
8. [ ] 检查日志无错误

## 部署完成后

- [ ] 记录访问 URL
- [ ] 配置防火墙规则
- [ ] 备份初始数据库
- [ ] 配置日志轮转
- [ ] 设置定期备份任务

## 注意事项

- MySQL 密码应该修改为强密码
- 建议使用 Nginx 作为反向代理
- 建议启用 SSL 证书
- 定期检查磁盘空间和内存使用
- 定期备份数据库

