<div align="center">

# 🎙️ Voice Collection & Intelligent Annotation Platform

<p align="center">
  <b>An end-to-end collaborative platform for multi-dialect speech corpus collection, audio segmentation annotation, and multi-tier quality assurance.</b>
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

## 📖 Overview

The **Voice Collection & Intelligent Annotation Platform** is an enterprise-ready pipeline designed for speech corpus construction, AI acoustic model training (ASR/TTS), and dialect audio preservation. It delivers a closed-loop workflow across the full audio data lifecycle: **Corpus Package Distribution ➔ Mobile Audio Recording & Ingestion ➔ VAD Segmentation & Accurate Annotation ➔ Multi-tier Quality Inspection ➔ Standardized Dataset Packaging & Export**.

Equipped with **WebRTC Voice Activity Detection (VAD)**, **Librosa Audio Processing**, and a **Pypinyin Text-Phoneme Alignment Engine**, this system significantly reduces manual annotation workload while ensuring strict acoustic compliance and high data reliability.

---

## 🌟 Key Features

- 👥 **Multi-Role Collaborative Workflow**
  - **Collector**: Mobile-friendly H5 recording interface featuring prompt display, real-time waveform visualization, instant playback, quick re-recording, and batch submission.
  - **Annotator**: Integrated audio segmentation editor supporting speech boundary adjustments, pinyin correction, dialect pronunciation labeling, and defect marking.
  - **Inspector / Reviewer**: Dedicated sampling and full-inspection modules supporting item-level rejections, revision feedback, and defect statistics.
  - **Administrator / SuperAdmin**: Corpus batch ingestion, automatic package allocation, role-based access control, real-time progress analytics, and multi-threaded standardized data export.

- 🔊 **Intelligent Audio Processing Engine**
  - **WebRTC VAD Integration**: Automatic speech boundary detection (`start_time`, `end_time`) to filter leading/trailing silence and ambient noise.
  - **Acoustic Normalization**: Automatic resampling and format standardization into `16kHz, 16-bit, Mono PCM WAV`.
  - **Pinyin & Phoneme Alignment**: Built-in pinyin conversion with custom dialect-to-pinyin mappings for rapid phonetic verification.

- ☁️ **Hybrid & Decoupled Storage Architecture**
  - **Dual Storage Modes**: Seamless switching between **Aliyun OSS (Object Storage Service)** and **Local File System**.
  - **High-throughput Concurrency**: Chunked upload pipelines, accelerated multi-threaded packaging, and resume-capable exports.

- 🚀 **Production-Ready Operations**
  - Pre-configured PM2 cluster profiles (multi-core load balancing), Nginx reverse proxy configurations, SSL provisioning scripts, and automated deployment scripts.

---

## 🏗️ Architecture & Workflow

### 1. Collaborative Data Pipeline

```mermaid
flowchart TD
    Admin([Administrator]) -->|1. Batch Import Corpus & Packaging| TaskPool[(Task Package Pool)]
    Collector([Collector H5/Web]) -->|2. Claim Package & Record Audio| AudioRaw[(Raw Audio OSS/Local)]
    AudioRaw -->|3. VAD Detection / Normalization| TaskAnnotate[(Annotation Queue)]
    Annotator([Annotator]) -->|4. Waveform Segmentation & Pinyin Review| TaskReview[(Inspection Queue)]
    Inspector([Inspector / QA]) -->|5. Accept Valid Audios| Delivery[(Approved Dataset)]
    Inspector -->|5. Reject Poor Audio| Collector
    Inspector -->|5. Reject Faulty Annotation| Annotator
    Admin -->|6. Multi-threaded Export| FinalExport[("Standard Delivery Package (WAV + Metadata)")]
```

### 2. Service Topology

```mermaid
graph LR
    Client[Clients (PC Browser / Mobile H5)]
    Nginx[Nginx Reverse Proxy :80/:443]
    FastAPI[FastAPI Cluster (PM2 / Uvicorn :8000)]
    React[React 19 + Vite Frontend SPA]
    MySQL[(MySQL 8.0 Database)]
    OSS[(Aliyun OSS / Local Storage)]

    Client --> Nginx
    Nginx -->|Proxy /api/*| FastAPI
    Nginx -->|Serve /*| React
    FastAPI --> MySQL
    FastAPI --> OSS
```

---

## 🛠️ Technology Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite, Tailwind CSS | High-performance responsive web and mobile interfaces |
| **Icons & UI** | Lucide React | Lightweight, modern icon set |
| **Phonetic Helpers** | pinyin-pro | Client-side Chinese character to pinyin conversion |
| **Backend Framework** | Python 3.9+, FastAPI, Pydantic | Asynchronous RESTful API services |
| **ORM & Database** | SQLAlchemy 2.0+, PyMySQL | Relational data persistence with connection pooling |
| **Audio & Algorithms** | WebRTC VAD, Librosa, Pypinyin, Wave | Voice activity detection, audio normalization, phonetic mappings |
| **Storage Engine** | MySQL 8.0+ / SQLite, Aliyun OSS | Hybrid persistence for relational records and binary media objects |
| **DevOps & Process** | PM2, Nginx, Shell Scripts, Batch | Process monitoring, reverse proxy, zero-downtime deployment |

---

## 📂 Project Structure

```
qzcjweb3/
├── voice-h5/                     # Frontend client (React 19 + Vite)
│   ├── src/
│   │   ├── pages/                # Role pages (Collector, Annotator, Inspector, Manager, etc.)
│   │   ├── components/           # Reusable components (Waveform, Player, Data Tables)
│   │   ├── context/              # Authentication & state management
│   │   └── config/               # API endpoints & environment configurations
│   ├── package.json
│   └── vite.config.ts
├── main.py                       # Core FastAPI application with complete business endpoints
├── storage_client.py             # Storage abstraction layer (Local vs Aliyun OSS)
├── requirements.txt              # Backend Python dependencies
├── ecosystem.config.js           # PM2 multi-process cluster configuration
├── nginx.conf                    # Nginx reverse proxy configuration template
├── deploy.sh                     # Automated Linux server deployment script
├── upload.bat                    # One-click Windows build and upload script
├── setup_ssl.sh                  # Let's Encrypt SSL automated installation script
├── add_indexes.py                # Database indexing optimization utility
├── trim_recordings.py            # Audio silence trimming & VAD boundary batch tool
├── post_process_export.py        # Multi-threaded dataset post-processing & delivery packaging
├── .env.example                  # Environment variable configuration template
├── README.md                     # English documentation
└── README_zh.md                  # Chinese documentation
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js**: 18.0 or higher
- **Python**: 3.9 or higher
- **MySQL**: 8.0 or higher (SQLite also supported for local evaluation)

---

### 1. Backend Setup

#### Step 1: Clone Repository & Create Virtual Environment
```bash
git clone https://github.com/PotatoheRo666/speech-annotation-platform.git
cd speech-annotation-platform

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate
```

#### Step 2: Install Python Dependencies
```bash
pip install -r requirements.txt
```

#### Step 3: Configure Environment Variables
Copy the template and adjust connection credentials:
```bash
cp .env.example .env
```
Edit `.env` to configure storage engine (`STORAGE_TYPE`), database connection (`DATABASE_URL`), and administrator credentials.

#### Step 4: Run the Backend Server
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

---

### 2. Frontend Setup

#### Step 1: Navigate to Frontend Directory & Install Dependencies
```bash
cd voice-h5
npm install
```

#### Step 2: Start Development Server
```bash
npm run dev
```
The application will launch at [http://localhost:5173](http://localhost:5173).

---

## 🚢 Production Deployment

The repository includes pre-built deployment templates:

### Option A: Automated Linux Deployment Script
```bash
# Upload project to /var/www/qzcjweb on the server and execute:
bash deploy.sh
```
The script will sequentially:
1. Validate system dependencies (Python, Node.js, PM2)
2. Install Python packages into isolated virtual environment
3. Compile frontend assets (`npm run build`)
4. Verify database schemas and execute migration queries
5. Reload application processes via PM2 zero-downtime cluster reload

### Option B: PM2 Process Management
```bash
# Start PM2 cluster
pm2 start ecosystem.config.js

# Monitor process status
pm2 status

# Inspect application logs
pm2 logs
```

### Option C: Nginx Reverse Proxy
Deploy the template `nginx.conf` into `/etc/nginx/conf.d/voice.conf` and reload:
```bash
sudo nginx -t && sudo nginx -s reload
```

---

## 🔑 Environment Variable Reference

| Variable | Sample Value | Description |
| :--- | :--- | :--- |
| `STORAGE_TYPE` | `aliyun` or `local` | Storage provider. Recommended: `aliyun` in production |
| `ALIYUN_ACCESS_KEY_ID` | `LTAI5...` | Aliyun AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | `u4v...` | Aliyun AccessKey Secret |
| `ALIYUN_BUCKET_NAME` | `your-bucket-name` | OSS bucket name for recording files |
| `ALIYUN_ENDPOINT` | `oss-cn-hangzhou.aliyuncs.com` | Aliyun OSS regional endpoint |
| `DATABASE_URL` | `mysql+pymysql://user:pwd@host:3306/db` | SQLAlchemy database connection URI |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis caching & broker URI (Optional) |
| `MASTER_PASSWORD` | Secure string | Global authorization password for sensitive operations |
| `SUPER_ADMIN_USERNAME` | `admin` | Initial superadmin username |
| `SUPER_ADMIN_PASSWORD` | Secure string | Initial superadmin password |
| `ROLE_FEATURE_FLAG` | `2` | Feature flag (1=Basic mode, 2=Full multi-role workflow) |

---

## 📄 Post-Processing & Audio Utilities

Utilities located in the root directory provide operational maintenance:
- **`post_process_export.py`**: Formats raw exports into formal deliverable corpora (`metadata.csv`, speaker profiles, boundary segments, 16kHz WAVs).
- **`trim_recordings.py` / `trim_audio_files.py`**: Batch silence trimming leveraging VAD for clean acoustic boundaries.
- **`add_indexes.py`**: Optimizes database query performance across large-scale corpus tables.

---

## 📝 License

This project is licensed under the [MIT License](LICENSE).
