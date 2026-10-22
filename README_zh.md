<div align="center">

# 🎙️ 声音采集与智能标注平台 (Voice Collection & Annotation System)

<p align="center">
  <b>面向多方言、多场景语料采集、切片标注与质量审核的端到端全流程协同平台</b>
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_zh.md">简体中文</a>
</p>

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479A1?style=flat-square&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Aliyun OSS](https://img.shields.io/badge/Aliyun-OSS-FF6A00?style=flat-square&logo=alibabacloud&logoColor=white)](https://www.aliyun.com/product/oss)

</div>

---

## 📖 平台简介

**声音采集与智能标注系统** 是一套专为语音语料库建设、AI 语音模型训练及方言保护打造的综合性数据生产协同系统。系统实现了从 **语料发布分发 ➔ 移动端录制采集 ➔ 智能切片与精细标注 ➔ 质检抽检与多级审核 ➔ 标准格式打包导出** 的全生命周期闭环管理。

通过集成 **WebRTC VAD 端点检测**、**Librosa 音频特征处理** 与 **Pypinyin 拼音对齐引擎**，系统大幅降低了人工标注成本，保障了语音数据的声学品质与标注合规性。

---

## 🌟 核心特性

- 👥 **全流程多角色协同**
  - **采集员**：适配移动端 H5 界面，支持按包朗读、在线试听、音波可视化、快速重录与批量提交。
  - **标注员**：集成波形切片编辑器，支持有效语音截取、拼音拼写校正、发音偏离标注及错误标记。
  - **审核员 / 质检员**：提供逐条质检与任务包整体验收，支持打回重录或重标，记录质检缺陷明细。
  - **管理员 / 超级管理员**：语料批量导入、自动分包分配、人员权限管控、进度监控与交付数据多线程导出。

- 🔊 **智能音频算法集成**
  - **WebRTC VAD**：自动识别有效语音段起始时间（Speech Boundaries），过滤头尾静音与环境噪声。
  - **音频标准化规范**：自动化转码规整为 `16kHz, 16bit, 单声道 PCM WAV` 格式。
  - **拼音智能对齐**：内置通用拼音生成引擎及城市方言拼音映射字典，自动对齐文字注音。

- ☁️ **高可用与混合存储架构**
  - **存储解耦**：无缝支持 **阿里云 OSS (Aliyun Object Storage)** 与 **本地文件系统 (Local Storage)** 切换。
  - **分块与断点传输**：大批量音频高并发上传下载，支持多线程加速打包导出。

- 🚀 **生产级运维就绪**
  - 提供 PM2 生产集群配置（多核负载均衡）、Nginx 反向代理配置、一键上传脚本与自动化部署方案。

---

## 🏗️ 系统架构

### 1. 业务协同流转图

```mermaid
flowchart TD
    Admin([管理员]) -->|1. 批量导入语料并分包| TaskPool[(任务包池)]
    Collector([采集员 H5/Web]) -->|2. 领取任务包并在线朗读录音| AudioRaw[(原始音频 OSS/Local)]
    AudioRaw -->|3. VAD检测/标准化转码| TaskAnnotate[(待标注队列)]
    Annotator([标注员]) -->|4. 领取包/切片微调/拼音校核| TaskReview[(待质检队列)]
    Inspector([质检/审核员]) -->|5. 抽检全检/验收通过| Delivery[(合格数据集)]
    Inspector -->|5. 驳回不合格音频| Collector
    Inspector -->|5. 驳回错误标注| Annotator
    Admin -->|6. 多线程导出标准交付格式| FinalExport[("交付格式包 (WAV + 标注清单)")]
```

### 2. 技术服务拓扑

```mermaid
graph LR
    Client[客户端 (PC端 / 移动端 H5)]
    Nginx[Nginx 反向代理 :80/:443]
    FastAPI[FastAPI 服务集群 (PM2/Uvicorn :8000)]
    React[React 19 + Vite 前端托管]
    MySQL[(MySQL 8.0 数据库)]
    OSS[(阿里云 OSS / 本地媒体存储)]

    Client --> Nginx
    Nginx -->|/api/* 转发| FastAPI
    Nginx -->|/* 静态分发| React
    FastAPI --> MySQL
    FastAPI --> OSS
```

---

## 🛠️ 技术栈清单

| 分层 | 技术 / 框架 | 说明 |
| :--- | :--- | :--- |
| **前端开发** | React 19, TypeScript, Vite, Tailwind CSS | 现代响应式 Web / 移动端 H5 界面 |
| **UI 组件与图标** | Lucide React | 简洁清晰的轻量级图标库 |
| **拼音前端辅助** | pinyin-pro | 实时汉字拼音注音与校对提示 |
| **后端开发** | Python 3.9+, FastAPI, Pydantic | 高性能异步 RESTful API 服务 |
| **ORM & 数据层** | SQLAlchemy 2.0+, PyMySQL | 数据模型抽象与连接池管理 |
| **音频与算法** | WebRTC VAD, Librosa, Pypinyin, Wave | 语音活动检测、音频分析与文本拼音处理 |
| **持久化存储** | MySQL 8.0+ / SQLite, Aliyun OSS | 关系型业务数据与云端海量音频存储 |
| **部署与运维** | PM2, Nginx, Shell, Batch | 进程守护、反向代理、自动化一键部署 |

---

## 📂 项目目录结构

```
qzcjweb3/
├── voice-h5/                     # 前端工程 (React 19 + Vite)
│   ├── src/
│   │   ├── pages/                # 各角色页面 (Collector, Annotator, Inspector, Manager 等)
│   │   ├── components/           # 复用组件 (波形组件、播放器、表格等)
│   │   ├── context/              # 全局状态管理 (鉴权、上下文)
│   │   └── config/               # API 路由与前端环境变量配置
│   ├── package.json
│   └── vite.config.ts
├── main.py                       # 后端核心 FastAPI 应用及全量业务接口
├── storage_client.py             # 存储层抽象 (支持 Local 与 Aliyun OSS 自由切换)
├── requirements.txt              # 后端 Python 依赖清单
├── ecosystem.config.js           # PM2 多进程集群部署配置文件
├── nginx.conf                    # Nginx 反向代理配置样例
├── deploy.sh                     # Linux 服务器一键自动化部署脚本
├── upload.bat                    # Windows 本地一键打包并上传服务器脚本
├── setup_ssl.sh                  # Let's Encrypt SSL 证书自动签发与配置脚本
├── add_indexes.py                # 数据库索引优化升级脚本
├── trim_recordings.py            # 音频静音裁剪与 VAD 批量修剪工具
├── post_process_export.py        # 交付数据包多线程后处理与格式化工具
├── .env.example                  # 环境变量配置模板
└── README_zh.md                  # 中文使用文档
```

---

## ⚡ 快速上手

### 环境准备
- **Node.js**: 18.0 或更高版本
- **Python**: 3.9 或更高版本
- **MySQL**: 8.0+（也支持开发环境使用 SQLite）

---

### 1. 后端配置与启动

#### 步骤一：克隆代码与创建虚拟环境
```bash
git clone https://github.com/PotatoheRo666/speech-annotation-platform.git
cd speech-annotation-platform

# 创建并激活虚拟环境
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate
```

#### 步骤二：安装 Python 依赖
```bash
pip install -r requirements.txt
```

#### 步骤三：配置环境变量
复制配置模板并填入实际配置：
```bash
cp .env.example .env
```
编辑 `.env` 文件，按需设置存储类型（`STORAGE_TYPE`）、数据库连接字符串（`DATABASE_URL`）及管理员密码。

#### 步骤四：启动后端服务
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
启动后访问接口文档：[http://localhost:8000/docs](http://localhost:8000/docs)

---

### 2. 前端配置与启动

#### 步骤一：进入前端目录并安装依赖
```bash
cd voice-h5
npm install
```

#### 步骤二：启动本地开发服务器
```bash
npm run dev
```
本地访问默认地址：[http://localhost:5173](http://localhost:5173)

---

## 🚢 生产环境部署

本项目已预置完善的自动化运维配置文件：

### 方式一：Linux 服务器脚本一键部署
```bash
# 将项目上传至服务器 /var/www/qzcjweb 目录后执行
bash deploy.sh
```
该脚本将自动执行：
1. 更新系统软件包并检查 Python / Node.js 环境
2. 安装与更新后端 Python 依赖
3. 编译前端生产静态资源并构建 dist
4. 初始化或迁移数据库结构
5. 启动或平滑重启 PM2 进程集群

### 方式二：PM2 进程管理
```bash
# 启动 PM2 集群
pm2 start ecosystem.config.js

# 查看集群运行状态
pm2 status

# 查看日志输出
pm2 logs
```

### 方式三：Nginx 反向代理
将项目根目录下的 `nginx.conf` 内容挂载到 `/etc/nginx/conf.d/voice.conf`，并重载 Nginx：
```bash
sudo nginx -t && sudo nginx -s reload
```

---

## 🔑 环境变量配置说明

| 变量名称 | 默认 / 样例值 | 说明 |
| :--- | :--- | :--- |
| `STORAGE_TYPE` | `aliyun` 或 `local` | 文件对象存储引擎，推荐云端使用 aliyun |
| `ALIYUN_ACCESS_KEY_ID` | `LTAI5...` | 阿里云 AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | `u4v...` | 阿里云 AccessKey Secret |
| `ALIYUN_BUCKET_NAME` | `your-bucket-name` | 存储录音文件的 OSS Bucket 名称 |
| `ALIYUN_ENDPOINT` | `oss-cn-hangzhou.aliyuncs.com` | OSS 地域访问节点域名 |
| `DATABASE_URL` | `mysql+pymysql://user:pwd@host:3306/db` | SQLAlchemy 数据库连接连接串 |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 缓存与任务队列服务连接（可选） |
| `MASTER_PASSWORD` | 自定义安全字符串 | 超级操作密码（批量重置、强制打回等） |
| `SUPER_ADMIN_USERNAME` | `admin` | 初始超级管理员用户名 |
| `SUPER_ADMIN_PASSWORD` | 自定义密码 | 初始超级管理员密码 |
| `ROLE_FEATURE_FLAG` | `2` | 角色权限开关（1=精简模式, 2=完整角色工作流） |

---

## 📄 交付数据格式与处理脚本

系统提供批量后处理与数据合规脚本，位于项目根目录：
- **`post_process_export.py`**：将导出的语料数据按照标准数据集格式（如 `metadata.csv`、发音人信息、有效声段持续时间、16kHz WAV）整理归档。
- **`trim_recordings.py` / `trim_audio_files.py`**：基于静音检测算法（VAD）批量去除头尾多余静音段，保证切片精度。
- **`add_indexes.py`**：为大体量数据库自动添加组合索引，提升查询和分配效率。

---

## 📝 开源协议

本项目采用 [MIT License](LICENSE) 授权许可。
