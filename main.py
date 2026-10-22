import asyncio
import csv
import hashlib
import io
import json
import os
import random
from sqlalchemy import Boolean
import shutil
import string
import struct
import tempfile
import uuid
import wave
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, Depends, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from storage_client import get_storage_client
import jwt

try:
    from pypinyin import lazy_pinyin
    try:
        from pypinyin import Style
    except ImportError:
        # 不同版本的pypinyin可能不同
        Style = None
    PYPINYIN_AVAILABLE = True
except ImportError:
    PYPINYIN_AVAILABLE = False
    lazy_pinyin = None

try:
    import webrtcvad
    VAD_AVAILABLE = True
except ImportError:
    VAD_AVAILABLE = False

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

# ── 城市-拼音映射表 ────────────────────────────────────────────
CITY_PINYIN_MAP = {
    "泉州": "quanzhou", "厦门": "xiamen", "福州": "fuzhou", "莆田": "putian",
    "漳州": "zhangzhou", "龙岩": "longyan", "三明": "sanming", "南平": "nanping",
    "宁德": "ningde", "北京": "beijing", "上海": "shanghai", "广州": "guangzhou",
    "深圳": "shenzhen", "杭州": "hangzhou", "南京": "nanjing", "苏州": "suzhou",
    "武汉": "wuhan", "成都": "chengdu", "重庆": "chongqing", "西安": "xian",
}

def text_to_pinyin(text: str) -> str:
    """将中文文本转换为拼音"""
    if not text:
        return ""
    # 先检查映射表
    if text in CITY_PINYIN_MAP:
        return CITY_PINYIN_MAP[text]
    # 如果pypinyin可用，使用它
    if PYPINYIN_AVAILABLE and lazy_pinyin:
        try:
            # 尝试使用Style.NORMAL，如果不可用则不使用参数
            if Style:
                pinyin_list = lazy_pinyin(text, style=Style.NORMAL)
            else:
                pinyin_list = lazy_pinyin(text)
            return ''.join(pinyin_list)
        except Exception as e:
            print(f"[拼音转换] 错误: {str(e)}")
    # 备用：返回原文本的小写
    return text.lower()


def detect_speech_boundaries(audio_bytes: bytes) -> tuple[float, float]:
    """
    使用WebRTC VAD检测语音段的开始和结束时间
    返回 (start_time, end_time)
    """
    if not VAD_AVAILABLE or not LIBROSA_AVAILABLE:
        # 如果库不可用，返回默认值（无法确定具体时间）
        return (0.0, 0.0)

    try:
        import io
        import numpy as np

        # 用librosa读取音频
        audio_data, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)

        # 重采样到16kHz（webrtcvad要求）
        if sr != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)

        # 转换为int16
        audio_int16 = np.int16(audio_data * 32767)
        audio_bytes_16k = audio_int16.tobytes()

        # 初始化VAD（mode=3为最激进，检测能力最强）
        vad = webrtcvad.Vad(3)

        # 处理10ms帧
        frame_duration_ms = 10
        frame_size = int(16000 * frame_duration_ms / 1000)  # 160 samples per frame

        speech_frames = []
        for i in range(0, len(audio_bytes_16k), frame_size * 2):  # *2因为是int16
            frame = audio_bytes_16k[i:i + frame_size * 2]
            if len(frame) == frame_size * 2:
                try:
                    is_speech = vad.is_speech(frame, 16000)
                    if is_speech:
                        speech_frames.append(i // 2 / 16000)  # 转换为秒
                except:
                    continue

        if not speech_frames:
            return (0.0, 0.0)

        # 找到连续语音段的开始和结束
        start_time = min(speech_frames)
        end_time = max(speech_frames) + frame_duration_ms / 1000

        return (round(start_time, 3), round(end_time, 3))

    except Exception as e:
        print(f"[VAD检测] 错误: {str(e)}")
        return (0.0, 0.0)

from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, text, func, select, update, or_, extract
from sqlalchemy.orm import DeclarativeBase, Session, aliased
from passlib.context import CryptContext

load_dotenv()

# ── 万能密码（仅开发环境使用）──────────────────────────────────────
MASTER_PASSWORD = os.getenv("MASTER_PASSWORD", "")

# ── 超级管理员配置 ───────────────────────────────────────────────────
SUPER_ADMIN_USERNAME = os.getenv("SUPER_ADMIN_USERNAME", "")
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXPORT_DIR = os.path.join(BASE_DIR, "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'app.db')}")

# ── 功能开关 ──────────────────────────────────────────────────────
# 1 = 质检员/标注员跳转到占位符界面
# 2 = 质检员/标注员进入新的功能页面
ROLE_FEATURE_FLAG = int(os.getenv("ROLE_FEATURE_FLAG", "1"))

# ── 万能密码（仅开发环境使用）──────────────────────────────────────
MASTER_PASSWORD = os.getenv("MASTER_PASSWORD", "")

# ── 导出功能限制 ──────────────────────────────────────────────────

EXPORT_LIMIT_FLAG = int(os.getenv("EXPORT_LIMIT_FLAG", "1"))
EXPORT_LIMIT_DATE = datetime(2026, 9, 29)

def check_export_limit():
    """检查导出功能是否被限制"""
    if EXPORT_LIMIT_FLAG == 1 and datetime.now() >= EXPORT_LIMIT_DATE:
        raise HTTPException(status_code=403, detail="导出功能已过期，请联系系统管理员")

if DATABASE_URL.startswith("sqlite"):   
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=30,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
    )

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Redis 缓存配置 ──────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL = 300  # 5分钟缓存

try:
    import redis as redis_lib
    redis_client = redis_lib.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
    redis_client.ping()
    CACHE_ENABLED = True
    print(f"[缓存] Redis 已连接: {REDIS_URL}")
except Exception as e:
    CACHE_ENABLED = False
    redis_client = None
    print(f"[缓存] Redis 不可用，使用内存缓存: {e}")

# 内存缓存后备方案
_memory_cache = {}

def cache_get(key: str):
    """从缓存获取数据"""
    if CACHE_ENABLED:
        try:
            data = redis_client.get(key)
            if data:
                # Redis 可用，清理内存缓存中的冗余副本
                _memory_cache.pop(key, None)
                return json.loads(data)
        except Exception:
            pass
    # 后备：内存缓存
    if key in _memory_cache:
        val, ts = _memory_cache[key]
        if time.time() - ts < CACHE_TTL:
            return val
        del _memory_cache[key]
    return None

def cache_set(key: str, value, ttl: int = CACHE_TTL):
    """设置缓存数据"""
    redis_ok = False
    if CACHE_ENABLED:
        try:
            redis_client.setex(key, ttl, json.dumps(value, ensure_ascii=False, default=str))
            redis_ok = True
        except Exception:
            pass
    if not redis_ok:
        # Redis 不可用时才写内存缓存作为后备
        _memory_cache[key] = (value, time.time())

def cache_delete(pattern: str):
    """删除匹配的缓存"""
    if CACHE_ENABLED:
        try:
            if "*" in pattern or "?" in pattern:
                # 通配符模式：用 SCAN 非阻塞遍历
                cursor = 0
                while True:
                    cursor, keys = redis_client.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        redis_client.delete(*keys)
                    if cursor == 0:
                        break
            else:
                # 精确 key：直接 DELETE，无需扫描
                redis_client.delete(pattern)
        except Exception:
            pass
    # 清理内存缓存
    keys_to_del = [k for k in _memory_cache if k.replace("*", "") in pattern.replace("*", "")]
    for k in keys_to_del:
        del _memory_cache[k]

import time

# ── JWT Token 配置 ──────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

# 存储用户的当前有效 token（实现单点登录）
# 在生产环境中应该用 Redis 替代
user_tokens: dict = {}  # {user_id: token}


def create_access_token(user_id: int, username: str, role: str) -> str:
    """生成 JWT token"""
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    # 记录当前用户的有效 token（顶号）
    user_tokens[user_id] = token
    return token


def verify_token(token: str) -> dict:
    """验证 JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")

        # superadmin（user_id=-1）不做单点登录检查（多进程模式下内存不共享）
        # 普通用户检查 token 是否是当前有效 token
        if user_id is not None and user_id > 0 and user_tokens.get(user_id) != token:
            raise HTTPException(status_code=401, detail="登录已过期（在其他设备登录）")

        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token 无效")


def get_current_user(request: Request) -> dict:
    """依赖函数：从请求头获取并验证 token"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证信息")

    token = auth_header[7:]  # 移除 "Bearer " 前缀
    return verify_token(token)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    role          = Column(String(20), nullable=False)
    real_name     = Column(String(100), nullable=True)
    gender        = Column(String(10), nullable=True)
    age           = Column(Integer, nullable=True)
    hometown      = Column(String(200), nullable=True)
    city          = Column(String(100), nullable=True)
    info_rejected = Column(Integer, default=0)  # 0=正常 1=个人信息被驳回


class Task(Base):
    __tablename__ = "tasks"
    id           = Column(Integer, primary_key=True, index=True)
    file_path    = Column(String(500), nullable=False, unique=True)
    status       = Column(String(20), nullable=False, default="待分发")
    collector_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    manager_id   = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


# ── 语料组文件夹 ──────────────────────────────────────────────────
class CorpusGroupFolder(Base):
    __tablename__ = "corpus_group_folders"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), nullable=False)
    level      = Column(Integer, nullable=False)  # 1=方言, 2=地区
    parent_id  = Column(Integer, ForeignKey("corpus_group_folders.id"), nullable=True)  # 地区指向方言
    created_at = Column(DateTime, default=datetime.utcnow)


# ── 语料组 ────────────────────────────────────────────────────────
class CorpusGroup(Base):
    __tablename__ = "corpus_groups"
    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(100), unique=True, nullable=False)
    dialect_region  = Column(String(100), nullable=True)
    pinyin_region   = Column(String(100), nullable=True)  # 用于导出目录名的拼音版本
    folder_id       = Column(Integer, ForeignKey("corpus_group_folders.id"), nullable=True)  # 所属地区文件夹
    created_at      = Column(DateTime, default=datetime.utcnow)


class CorpusText(Base):
    __tablename__ = "corpus_texts"
    id              = Column(Integer, primary_key=True, index=True)
    text_id         = Column(String(100), unique=True, nullable=False)
    content         = Column(String(5000), nullable=False)
    corpus_group_id = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)


class CorpusPackage(Base):
    __tablename__ = "corpus_packages"
    id              = Column(Integer, primary_key=True, index=True)
    name            = Column(String(200), nullable=False)
    size            = Column(Integer, nullable=False)
    status          = Column(String(20), default="未领取")  # 未领取 / 已领取 / 已完成 / 已提交
    review_status   = Column(String(20), default="待审核")  # 待审核 / 已合格 / 已打回
    annotation_status = Column(String(20), default="未分配")  # 未分配 / 待标注 / 已标注
    corpus_group_id = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    claimed_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    claimed_at      = Column(DateTime, nullable=True)
    reviewed_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)
    review_comment  = Column(String(500), nullable=True)
    review_claimed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    review_claimed_at = Column(DateTime, nullable=True)
    # 采集员信息快照（审核通过时复制）
    collector_real_name = Column(String(100), nullable=True)
    collector_gender    = Column(String(10), nullable=True)
    collector_age       = Column(Integer, nullable=True)
    collector_hometown  = Column(String(200), nullable=True)
    collector_city      = Column(String(100), nullable=True)
    # 标注工作流
    annotation_claimed_by  = Column(Integer, ForeignKey("users.id"), nullable=True)
    annotation_claimed_at  = Column(DateTime, nullable=True)
    # 质检工作流
    quality_status         = Column(String(20), default="未分配")  # 未分配 / 待质检 / 已质检 / 已打回
    quality_claimed_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    quality_claimed_at     = Column(DateTime, nullable=True)
    quality_review_comment = Column(String(500), nullable=True)
    # 质检审核工作流
    quality_review_status    = Column(String(20), default="未分配")  # 未分配 / 待审核 / 已合格 / 已打回
    quality_review_claimed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    quality_review_claimed_at = Column(DateTime, nullable=True)
    quality_reviewed_by      = Column(Integer, ForeignKey("users.id"), nullable=True)
    quality_reviewed_at      = Column(DateTime, nullable=True)
    quality_review_result_comment = Column(String(500), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class CorpusPackageItem(Base):
    __tablename__ = "corpus_package_items"
    id             = Column(Integer, primary_key=True, index=True)
    package_id     = Column(Integer, ForeignKey("corpus_packages.id"), nullable=False)
    corpus_text_id = Column(Integer, ForeignKey("corpus_texts.id"), nullable=False)


# ── 采集组 ────────────────────────────────────────────────────────
class Group(Base):
    __tablename__ = "groups"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(100), unique=True, nullable=False)
    role_type  = Column(String(20), nullable=False, default="collector")
    created_at = Column(DateTime, default=datetime.utcnow)


class GroupMember(Base):
    __tablename__ = "group_members"
    id       = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    user_id  = Column(Integer, ForeignKey("users.id"), nullable=False)


class CorpusGroupAssignment(Base):
    """语料组 → 采集组 分配关系"""
    __tablename__ = "corpus_group_assignments"
    id                  = Column(Integer, primary_key=True, index=True)
    corpus_group_id     = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    collector_group_id  = Column(Integer, ForeignKey("groups.id"), nullable=False)
    assigned_at         = Column(DateTime, default=datetime.utcnow)


class CorpusAnnotationAssignment(Base):
    """语料组 → 标注组 分配关系"""
    __tablename__ = "corpus_annotation_assignments"
    id                  = Column(Integer, primary_key=True, index=True)
    corpus_group_id     = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    annotator_group_id  = Column(Integer, ForeignKey("groups.id"), nullable=False)
    assigned_at         = Column(DateTime, default=datetime.utcnow)


class CorpusInspectionAssignment(Base):
    """语料组 → 质检组 分配关系"""
    __tablename__ = "corpus_inspection_assignments"
    id                  = Column(Integer, primary_key=True, index=True)
    corpus_group_id     = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    inspector_group_id  = Column(Integer, ForeignKey("groups.id"), nullable=False)
    assigned_at         = Column(DateTime, default=datetime.utcnow)


class CorpusReviewerAssignment(Base):
    """语料组 → 采集审核组 分配关系"""
    __tablename__ = "corpus_reviewer_assignments"
    id                  = Column(Integer, primary_key=True, index=True)
    corpus_group_id     = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    reviewer_group_id   = Column(Integer, ForeignKey("groups.id"), nullable=False)
    assigned_at         = Column(DateTime, default=datetime.utcnow)


class CorpusQualityReviewerAssignment(Base):
    """语料组 → 质检审核组 分配关系"""
    __tablename__ = "corpus_quality_reviewer_assignments"
    id                        = Column(Integer, primary_key=True, index=True)
    corpus_group_id           = Column(Integer, ForeignKey("corpus_groups.id"), nullable=False)
    quality_reviewer_group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    assigned_at               = Column(DateTime, default=datetime.utcnow)


class VoiceRecording(Base):
    """语音录制记录"""
    __tablename__ = "voice_recordings"
    id              = Column(Integer, primary_key=True, index=True)
    package_id      = Column(Integer, ForeignKey("corpus_packages.id"), nullable=False)
    corpus_text_id  = Column(Integer, ForeignKey("corpus_texts.id"), nullable=False)
    collector_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_path       = Column(String(500), nullable=True)  # MinIO文件路径
    duration_seconds = Column(Integer, nullable=True)  # 录音时长（秒）
    status          = Column(String(20), default="已录制")  # 已录制 / 已提交
    recorded_at     = Column(DateTime, default=datetime.utcnow)
    submitted_at    = Column(DateTime, nullable=True)
    # 采集审核字段
    rejection_note  = Column(String(500), nullable=True)  # 采集审核打回备注
    # 标注字段
    annotated_text  = Column(String(5000), nullable=True)  # 校准后的文本
    is_valid        = Column(Integer, nullable=True)  # 1=有效 0=无效 NULL=未设置
    annotation_note = Column(String(500), nullable=True)  # 标注员备注
    annotated_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    annotated_at    = Column(DateTime, nullable=True)
    # 质检字段
    quality_note    = Column(String(500), nullable=True)  # 质检员备注
    inspected_by    = Column(Integer, ForeignKey("users.id"), nullable=True)
    inspected_at    = Column(DateTime, nullable=True)
    # 质检审核字段
    quality_review_action = Column(String(20), nullable=True)   # None / "通过" / "打回"
    quality_review_note   = Column(String(500), nullable=True)  # 质检审核员单条备注


class PackageCorpusRejectionNote(Base):
    """包语料打回备注"""
    __tablename__ = "package_corpus_rejection_notes"
    id              = Column(Integer, primary_key=True, index=True)
    package_id      = Column(Integer, ForeignKey("corpus_packages.id"), nullable=False)
    corpus_text_id  = Column(Integer, ForeignKey("corpus_texts.id"), nullable=False)
    note            = Column(String(500), nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class AgreementDocument(Base):
    """采集员分组用户协议"""
    __tablename__ = "agreement_documents"
    id          = Column(Integer, primary_key=True, index=True)
    group_id    = Column(Integer, ForeignKey("groups.id"), nullable=False)
    content     = Column(String(5000), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_by  = Column(Integer, ForeignKey("users.id"), nullable=False)


class AgreementSignature(Base):
    """用户协议签署记录"""
    __tablename__ = "agreement_signatures"
    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    agreement_id   = Column(Integer, ForeignKey("agreement_documents.id"), nullable=False)
    signature_path = Column(String(500), nullable=False)
    signed_at      = Column(DateTime, default=datetime.utcnow)


class SystemSettings(Base):
    """系统设置（服务条款、隐私条款等）"""
    __tablename__ = "system_settings"
    id               = Column(Integer, primary_key=True, index=True)
    key              = Column(String(100), unique=True, nullable=False)  # service_terms, privacy_policy
    value            = Column(String(10000), nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by       = Column(Integer, ForeignKey("users.id"), nullable=True)


class AutoExportConfig(Base):
    """自动导出配置 - 每个语料组一行，有记录即参与每日自动导出"""
    __tablename__ = "auto_export_configs"
    id              = Column(Integer, primary_key=True, index=True)
    corpus_group_id = Column(Integer, ForeignKey("corpus_groups.id"), unique=True, nullable=False)
    pinyin_region   = Column(String(100), nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)


class AutoExportStatus(Base):
    """自动导出状态 - 单行表，记录上次自动导出结果"""
    __tablename__ = "auto_export_status"
    id              = Column(Integer, primary_key=True, index=True)
    last_filename   = Column(String(500), nullable=True)
    last_url        = Column(String(500), nullable=True)
    last_total_files = Column(Integer, nullable=True)
    last_total_duration = Column(Integer, nullable=True)
    last_packages_count = Column(Integer, nullable=True)
    last_exported_at    = Column(DateTime, nullable=True)
    last_status         = Column(String(20), default="未执行")  # 未执行 / 成功 / 失败
    last_message        = Column(String(500), nullable=True)
    is_enabled          = Column(Boolean, default=True, server_default="1")


class LicenseKey(Base):
    """企业卡密"""
    __tablename__ = "license_keys"
    id           = Column(Integer, primary_key=True, index=True)
    key_code     = Column(String(50), unique=True, nullable=False)   # XXXX-XXXX-XXXX-XXXX
    company_name = Column(String(200), nullable=False)               # 企业名称
    expire_at    = Column(DateTime, nullable=True)                   # 过期时间，NULL=永久有效
    is_active    = Column(Boolean, default=True)                     # 是否启用
    note         = Column(String(500), nullable=True)                # 备注
    created_at   = Column(DateTime, default=datetime.utcnow)


VALID_ROLES = {"manager", "sub_manager", "collector", "annotator", "inspector", "reviewer", "quality_reviewer"}


# ── 请求体 ────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str
    license_key: str | None = None  # 卡密（superadmin 不需要）

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str

class BatchCreateUserRequest(BaseModel):
    prefix: str
    count: int
    role: str
    group_id: int

class BulkUserIdsRequest(BaseModel):
    ids: list[int]

class BulkChangeGroupRequest(BaseModel):
    ids: list[int]
    group_id: int

class CreateCorpusGroupRequest(BaseModel):
    name: str
    dialect_region: str | None = None

class AssignCorpusGroupRequest(BaseModel):
    collector_group_ids: list[int]

class CreatePackageRequest(BaseModel):
    corpus_group_id: int
    name: str
    size: int
    count: int = 1

class BulkDeleteRequest(BaseModel):
    ids: list[int]

class CreateGroupRequest(BaseModel):
    name: str
    role_type: str = "collector"

class AddMemberRequest(BaseModel):
    user_id: int

class UploadRequest(BaseModel):
    file_extension: str

class AssignTaskRequest(BaseModel):
    task_ids:     list[int]
    collector_id: int
    manager_id:   int | None = None

class ClaimPackageRequest(BaseModel):
    user_id: int

class ReleasePackageRequest(BaseModel):
    user_id: int
    package_id: int

class ReviewerClaimPackageRequest(BaseModel):
    package_id: int
    user_id: int

class UpdateProfileRequest(BaseModel):
    user_id: int
    real_name: str | None = None
    gender: str | None = None
    age: int | None = None
    hometown: str | None = None
    city: str | None = None

class ReviewPackageRequest(BaseModel):
    package_id: int
    reviewer_id: int
    review_status: str
    review_comment: str | None = None
    reject_to: str | None = "原采集员"
    rejected_corpus_ids: list[int] = []
    corpus_notes: dict[int, str] = {}

class AssignAnnotatorGroupRequest(BaseModel):
    annotator_group_ids: list[int]

class AssignInspectorGroupRequest(BaseModel):
    inspector_group_ids: list[int]

class AssignReviewerGroupRequest(BaseModel):
    reviewer_group_ids: list[int]

class AssignQualityReviewerGroupRequest(BaseModel):
    quality_reviewer_group_ids: list[int]

class QualityReviewPackageRequest(BaseModel):
    package_id: int
    reviewer_id: int
    review_status: str  # 已合格 / 已打回
    review_comment: str | None = None
    reject_to: str | None = "原标注员"
    rejected_corpus_ids: list[int] = []
    corpus_notes: dict[int, str] = {}

class BatchApproveGroupRequest(BaseModel):
    user_id: int
    corpus_group_id: int
    review_comment: str | None = ""

class BatchRejectGroupRequest(BaseModel):
    user_id: int
    corpus_group_id: int
    review_comment: str | None = ""

class SaveSystemSettingsRequest(BaseModel):
    user_id: int
    service_terms: str
    privacy_policy: str
    user_agreement: str = ""

class CreateLicenseKeyRequest(BaseModel):
    company_name: str
    expire_at: str | None = None  # ISO datetime 字符串，None=永久有效
    note: str | None = None

class UpdateLicenseKeyRequest(BaseModel):
    company_name: str | None = None
    expire_at: str | None = None  # ISO datetime 字符串，"never"=永久有效
    is_active: bool | None = None
    note: str | None = None

# ── App ───────────────────────────────────────────────────────────
app = FastAPI(title="语音采集后端 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 屏蔽扫描器无效请求 ──────────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class FilterScannerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path.lower()
        # 屏蔽常见扫描路径
        scanner_prefixes = ('.env', '.git', 'wp-', 'php', 'cgi', 'admin/config',
                            'xmlrpc', 'wp-admin', 'wp-content', 'wp-includes',
                            '.well-known/acme', 'autodiscover', 'elmah')
        if any(path.startswith(p) for p in scanner_prefixes):
            return Response(status_code=444)
        return await call_next(request)

app.add_middleware(FilterScannerMiddleware)

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

def get_rate_limit_key(request: Request):
    """限速 key：优先用 user_id 参数，回退到 IP"""
    uid = request.query_params.get("user_id") or request.query_params.get("uid")
    if uid:
        return f"user:{uid}"
    return f"ip:{get_remote_address(request)}"

limiter = Limiter(key_func=get_rate_limit_key, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 使用存储客户端替代 MinIO
storage_client = get_storage_client()
BUCKET_NAME = os.getenv("ALIYUN_BUCKET_NAME", os.getenv("MINIO_BUCKET_NAME", "test"))

# ── 异步任务系统 ──────────────────────────────────────────────────
import threading
export_tasks = {}  # {task_id: {status, progress, message, result, created_at}}
export_tasks_lock = threading.Lock()

def create_export_task() -> str:
    """创建新的导出任务，返回任务ID"""
    task_id = str(uuid.uuid4())[:8]
    with export_tasks_lock:
        export_tasks[task_id] = {
            "status": "pending",
            "progress": 0,
            "message": "等待开始...",
            "result": None,
            "created_at": datetime.utcnow().isoformat()
        }
    return task_id

def update_export_task(task_id: str, status: str = None, progress: int = None, message: str = None, result: dict = None):
    """更新导出任务状态"""
    with export_tasks_lock:
        if task_id in export_tasks:
            if status: export_tasks[task_id]["status"] = status
            if progress is not None: export_tasks[task_id]["progress"] = progress
            if message: export_tasks[task_id]["message"] = message
            if result: export_tasks[task_id]["result"] = result

def get_export_task(task_id: str) -> dict:
    """获取导出任务状态"""
    with export_tasks_lock:
        return export_tasks.get(task_id)

def cleanup_export_tasks():
    """清理超过1小时的已完成/失败导出任务，防止内存泄漏"""
    now = datetime.utcnow()
    with export_tasks_lock:
        expired = []
        for k, v in export_tasks.items():
            status = v.get("status", "")
            if status in ("completed", "failed", "error"):
                try:
                    created = datetime.fromisoformat(v.get("created_at", ""))
                    if (now - created).total_seconds() > 3600:
                        expired.append(k)
                except Exception:
                    expired.append(k)
        for k in expired:
            del export_tasks[k]
        if expired:
            print(f"[内存清理] 清理 {len(expired)} 个过期导出任务，剩余 {len(export_tasks)} 个")

def log_memory_usage():
    """输出当前进程内存使用情况"""
    try:
        import resource
        # Linux: getrusage 返回 KB
        mem_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        print(f"[内存监控] 进程内存: {mem_kb / 1024:.1f}MB, export_tasks: {len(export_tasks)}, _memory_cache: {len(_memory_cache)}")
    except Exception:
        pass

def _periodic_cleanup():
    """每5分钟清理一次过期任务并输出内存"""
    import time
    while True:
        time.sleep(300)
        try:
            cleanup_export_tasks()
            log_memory_usage()
        except Exception:
            pass

_cleanup_thread = threading.Thread(target=_periodic_cleanup, daemon=True)
_cleanup_thread.start()

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"[DB初始化] create_all 遇到可能的并发 DDL 冲突（多 worker 启动），忽略: {e}")



# ── 数据库初始化 ──────────────────────────────────────────────────
def _run_migrations():
    """Add columns that didn't exist in earlier schema versions."""
    from sqlalchemy import inspect
    try:
        inspector = inspect(engine)

        # 1. 迁移 groups 表
        if inspector.has_table("groups"):
            existing_cols = {col['name'] for col in inspector.get_columns("groups")}
            if "role_type" not in existing_cols:
                try:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE `groups` ADD COLUMN role_type VARCHAR(20) DEFAULT 'collector'"))
                        conn.execute(text("UPDATE `groups` SET role_type = 'collector' WHERE role_type IS NULL"))
                        conn.commit()
                        print("[DB迁移] 添加 groups.role_type 列")
                except Exception as e:
                    print(f"[DB迁移] groups.role_type 失败: {e}")

        # 2. 迁移 corpus_packages 表
        if inspector.has_table("corpus_packages"):
            existing_cols = {col['name'] for col in inspector.get_columns("corpus_packages")}
            packages_migrations = [
                ("review_status", "VARCHAR(20) DEFAULT '待审核'"),
                ("reviewed_by", "INTEGER"),
                ("reviewed_at", "DATETIME"),
                ("review_comment", "VARCHAR(500)"),
                ("annotation_status", "VARCHAR(20) DEFAULT '未分配'"),
                ("collector_real_name", "VARCHAR(100)"),
                ("collector_gender",    "VARCHAR(10)"),
                ("collector_age",       "INTEGER"),
                ("collector_hometown",  "VARCHAR(200)"),
                ("collector_city",      "VARCHAR(100)"),
                ("annotation_claimed_by",  "INTEGER"),
                ("annotation_claimed_at",  "DATETIME"),
                ("quality_status",         "VARCHAR(20) DEFAULT '未分配'"),
                ("quality_claimed_by",     "INTEGER"),
                ("quality_claimed_at",     "DATETIME"),
                ("quality_review_comment", "VARCHAR(500)"),
                ("review_claimed_by", "INTEGER"),
                ("review_claimed_at", "DATETIME"),
                ("quality_review_status", "VARCHAR(20) DEFAULT '未分配'"),
                ("quality_review_claimed_by", "INTEGER"),
                ("quality_review_claimed_at", "DATETIME"),
                ("quality_reviewed_by", "INTEGER"),
                ("quality_reviewed_at", "DATETIME"),
                ("quality_review_result_comment", "VARCHAR(500)"),
            ]
            for col_name, col_def in packages_migrations:
                if col_name not in existing_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(f"ALTER TABLE corpus_packages ADD COLUMN {col_name} {col_def}"))
                            conn.commit()
                            print(f"[DB迁移] 添加 corpus_packages.{col_name} 列")
                    except Exception as e:
                        print(f"[DB迁移] corpus_packages.{col_name} 失败: {e}")

        # 3. 迁移 users 表
        if inspector.has_table("users"):
            existing_cols = {col['name'] for col in inspector.get_columns("users")}
            users_migrations = [
                ("real_name", "VARCHAR(100)"),
                ("gender", "VARCHAR(10)"),
                ("age", "INTEGER"),
                ("hometown", "VARCHAR(200)"),
                ("city", "VARCHAR(100)"),
                ("info_rejected", "INTEGER DEFAULT 0"),
            ]
            for col_name, col_def in users_migrations:
                if col_name not in existing_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                            conn.commit()
                            print(f"[DB迁移] 添加 users.{col_name} 列")
                    except Exception as e:
                        print(f"[DB迁移] users.{col_name} 失败: {e}")

        # 4. 迁移 corpus_groups 表
        if inspector.has_table("corpus_groups"):
            existing_cols = {col['name'] for col in inspector.get_columns("corpus_groups")}
            groups_migrations = [
                ("dialect_region", "VARCHAR(100)"),
                ("pinyin_region", "VARCHAR(100)"),
            ]
            for col_name, col_def in groups_migrations:
                if col_name not in existing_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(f"ALTER TABLE corpus_groups ADD COLUMN {col_name} {col_def}"))
                            conn.commit()
                            print(f"[DB迁移] 添加 corpus_groups.{col_name} 列")
                    except Exception as e:
                        print(f"[DB迁移] corpus_groups.{col_name} 失败: {e}")

        # 5. 迁移 voice_recordings 表
        if inspector.has_table("voice_recordings"):
            existing_cols = {col['name'] for col in inspector.get_columns("voice_recordings")}
            voice_migrations = [
                ("duration_seconds", "INTEGER"),
                ("rejection_note",   "VARCHAR(500)"),
                ("annotated_text",   "VARCHAR(5000)"),
                ("is_valid",         "INTEGER"),
                ("annotation_note",  "VARCHAR(500)"),
                ("quality_note",     "VARCHAR(500)"),
                ("annotated_by",     "INTEGER"),
                ("annotated_at",     "DATETIME"),
                ("inspected_by",     "INTEGER"),
                ("inspected_at",     "DATETIME"),
                ("quality_review_action", "VARCHAR(20)"),
                ("quality_review_note",   "VARCHAR(500)"),
            ]
            for col_name, col_def in voice_migrations:
                if col_name not in existing_cols:
                    try:
                        with engine.connect() as conn:
                            conn.execute(text(f"ALTER TABLE voice_recordings ADD COLUMN {col_name} {col_def}"))
                            conn.commit()
                            print(f"[DB迁移] 添加 voice_recordings.{col_name} 列")
                    except Exception as e:
                        print(f"[DB迁移] voice_recordings.{col_name} 失败: {e}")

    except Exception as e:
        print(f"[DB迁移] 警告: {e}")

    # 创建自动导出配置表
    try:
        Base.metadata.create_all(bind=engine, tables=[
            AutoExportConfig.__table__,
            AutoExportStatus.__table__,
        ])
        
        # 1. 检查并通过原生 SQL 添加 is_enabled 列到 auto_export_status 表
        from sqlalchemy import inspect
        inspector = inspect(engine)
        if inspector.has_table("auto_export_status"):
            existing_cols = {col['name'] for col in inspector.get_columns("auto_export_status")}
            if "is_enabled" not in existing_cols:
                try:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE auto_export_status ADD COLUMN is_enabled BOOLEAN DEFAULT 1"))
                        conn.commit()
                        print("[DB迁移] 添加 auto_export_status.is_enabled 列")
                except Exception as e:
                    print(f"[DB迁移] auto_export_status.is_enabled 失败: {e}")

        # 2. 列加完之后，再执行 ORM 查询创建初始行
        with Session(engine) as session:
            if not session.query(AutoExportStatus).first():
                session.add(AutoExportStatus(is_enabled=True))
                session.commit()
    except Exception as e:
        print(f"[DB迁移] 创建自动导出表与初始化失败: {e}")

    # 创建语料组文件夹表
    try:
        Base.metadata.create_all(bind=engine, tables=[CorpusGroupFolder.__table__])
        print("[DB迁移] 创建 corpus_group_folders 表")
    except Exception as e:
        print(f"[DB迁移] 创建 corpus_group_folders 表失败: {e}")

    # 创建卡密表
    try:
        Base.metadata.create_all(bind=engine, tables=[LicenseKey.__table__])
        print("[DB迁移] 创建 license_keys 表")
    except Exception as e:
        print(f"[DB迁移] 创建 license_keys 表失败: {e}")

    # 添加 corpus_groups.folder_id 列
    try:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        if inspector.has_table("corpus_groups"):
            existing_cols = {col['name'] for col in inspector.get_columns("corpus_groups")}
            if "folder_id" not in existing_cols:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE corpus_groups ADD COLUMN folder_id INTEGER"))
                    conn.commit()
                    print("[DB迁移] 添加 corpus_groups.folder_id 列")
    except Exception as e:
        print(f"[DB迁移] 添加 corpus_groups.folder_id 列失败: {e}")
    # 优化性能：创建高频查询的二级索引
    try:
        with engine.connect() as conn:
            indexes = [
                # VoiceRecording
                "CREATE INDEX IF NOT EXISTS idx_vr_package ON voice_recordings(package_id)",
                "CREATE INDEX IF NOT EXISTS idx_vr_status ON voice_recordings(status)",
                "CREATE INDEX IF NOT EXISTS idx_vr_collector ON voice_recordings(collector_id)",
                "CREATE INDEX IF NOT EXISTS idx_vr_text ON voice_recordings(corpus_text_id)",
                "CREATE INDEX IF NOT EXISTS idx_vr_submitted ON voice_recordings(submitted_at)",
                # CorpusPackage
                "CREATE INDEX IF NOT EXISTS idx_cp_group ON corpus_packages(corpus_group_id)",
                "CREATE INDEX IF NOT EXISTS idx_cp_status ON corpus_packages(status)",
                "CREATE INDEX IF NOT EXISTS idx_cp_claimed ON corpus_packages(claimed_by)",
                "CREATE INDEX IF NOT EXISTS idx_cp_review ON corpus_packages(review_status)",
                # CorpusPackageItem
                "CREATE INDEX IF NOT EXISTS idx_cpi_package ON corpus_package_items(package_id)",
                "CREATE INDEX IF NOT EXISTS idx_cpi_text ON corpus_package_items(corpus_text_id)",
                # GroupMember
                "CREATE INDEX IF NOT EXISTS idx_gm_group ON group_members(group_id)",
                "CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(user_id)",
                # Assignments & Agreements
                "CREATE INDEX IF NOT EXISTS idx_cga_corpus ON corpus_group_assignments(corpus_group_id)",
                "CREATE INDEX IF NOT EXISTS idx_cga_collector ON corpus_group_assignments(collector_group_id)",
                "CREATE INDEX IF NOT EXISTS idx_as_user ON agreement_signatures(user_id)",
            ]
            for idx_sql in indexes:
                conn.execute(text(idx_sql))
            conn.commit()
            print("[DB迁移] 性能索引检查/创建完成")
    except Exception as e:
        print(f"[DB迁移] 性能索引创建失败: {e}")


_run_migrations()


# ── 登录 ──────────────────────────────────────────────────────────
@app.post("/api/login")
@limiter.limit("10/minute")
def login(request: Request, req: LoginRequest):
    # ① 超级管理员登录（不需要卡密，凭据来自环境变量）
    if SUPER_ADMIN_USERNAME and req.username == SUPER_ADMIN_USERNAME:
        if req.password != SUPER_ADMIN_PASSWORD:
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        token = create_access_token(-1, SUPER_ADMIN_USERNAME, "superadmin")
        return {
            "code": 200, "msg": "登录成功",
            "data": {
                "token": token,
                "id": -1,
                "username": SUPER_ADMIN_USERNAME,
                "role": "superadmin",
                "role_feature_flag": None,
            },
        }

    # ② 普通用户：验证账号密码
    with Session(engine) as session:
        user = session.query(User).filter_by(username=req.username).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    master_ok = MASTER_PASSWORD and req.password == MASTER_PASSWORD
    if not master_ok and not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    # ③ 验证卡密
    if not req.license_key or not req.license_key.strip():
        raise HTTPException(status_code=401, detail="请输入卡密")

    with Session(engine) as session:
        lk = session.query(LicenseKey).filter_by(
            key_code=req.license_key.strip(), is_active=True
        ).first()
        if not lk:
            raise HTTPException(status_code=401, detail="卡密无效或已被禁用")
        if lk.expire_at and lk.expire_at < datetime.utcnow():
            raise HTTPException(status_code=401, detail="卡密已过期")

    # ④ 生成 token
    token = create_access_token(user.id, user.username, user.role)
    return {
        "code": 200, "msg": "登录成功",
        "data": {
            "token": token,
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "role_feature_flag": ROLE_FEATURE_FLAG if user.role in ["annotator", "inspector", "reviewer"] else None,
        },
    }


# ── 超级管理员权限校验 ────────────────────────────────────────────────
def verify_superadmin(request: Request) -> dict:
    """验证请求来自超级管理员，返回 payload"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证信息")
    payload = verify_token(auth_header[7:])
    if payload.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="权限不足，需要超级管理员权限")
    return payload


# ── 卡密管理 CRUD ─────────────────────────────────────────────────────

@app.get("/api/license-keys")
def list_license_keys(request: Request):
    """获取所有卡密列表（仅超级管理员）"""
    verify_superadmin(request)
    with Session(engine) as session:
        keys = session.query(LicenseKey).order_by(LicenseKey.created_at.desc()).all()
        now = datetime.utcnow()
        return {
            "code": 200,
            "data": [
                {
                    "id": k.id,
                    "key_code": k.key_code,
                    "company_name": k.company_name,
                    "expire_at": k.expire_at.isoformat() if k.expire_at else None,
                    "is_active": bool(k.is_active),
                    "is_expired": bool(k.expire_at and k.expire_at < now),
                    "note": k.note,
                    "created_at": k.created_at.isoformat() if k.created_at else None,
                }
                for k in keys
            ]
        }


@app.post("/api/license-keys")
def create_license_key(request: Request, req: CreateLicenseKeyRequest):
    """创建新卡密（仅超级管理员）"""
    verify_superadmin(request)
    key_code = str(uuid.uuid4()).upper()
    expire_at = None
    if req.expire_at:
        try:
            expire_at = datetime.fromisoformat(req.expire_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="日期格式错误，请使用 ISO 格式")
    with Session(engine) as session:
        new_key = LicenseKey(
            key_code=key_code,
            company_name=req.company_name,
            expire_at=expire_at,
            note=req.note,
            is_active=True,
        )
        session.add(new_key)
        session.commit()
        session.refresh(new_key)
        return {
            "code": 200, "msg": "卡密创建成功",
            "data": {
                "id": new_key.id,
                "key_code": new_key.key_code,
                "company_name": new_key.company_name,
                "expire_at": new_key.expire_at.isoformat() if new_key.expire_at else None,
                "is_active": True,
                "is_expired": False,
                "note": new_key.note,
                "created_at": new_key.created_at.isoformat() if new_key.created_at else None,
            }
        }


@app.put("/api/license-keys/{key_id}")
def update_license_key(key_id: int, request: Request, req: UpdateLicenseKeyRequest):
    """更新卡密信息（仅超级管理员）"""
    verify_superadmin(request)
    with Session(engine) as session:
        key = session.query(LicenseKey).filter_by(id=key_id).first()
        if not key:
            raise HTTPException(status_code=404, detail="卡密不存在")
        if req.company_name is not None:
            key.company_name = req.company_name
        if req.expire_at is not None:
            if req.expire_at == "never":
                key.expire_at = None
            else:
                try:
                    key.expire_at = datetime.fromisoformat(req.expire_at.replace("Z", "+00:00"))
                except ValueError:
                    raise HTTPException(status_code=400, detail="日期格式错误")
        if req.is_active is not None:
            key.is_active = req.is_active
        if req.note is not None:
            key.note = req.note
        session.commit()
        return {"code": 200, "msg": "更新成功"}


@app.delete("/api/license-keys/{key_id}")
def delete_license_key(key_id: int, request: Request):
    """删除卡密（仅超级管理员）"""
    verify_superadmin(request)
    with Session(engine) as session:
        key = session.query(LicenseKey).filter_by(id=key_id).first()
        if not key:
            raise HTTPException(status_code=404, detail="卡密不存在")
        session.delete(key)
        session.commit()
        return {"code": 200, "msg": "卡密已删除"}


# ── 获取登录页条款 ────────────────────────────────────────────────────
@app.get("/api/login-terms")
def get_login_terms():
    """获取服务条款、隐私条款和用户协议"""
    with Session(engine) as session:
        service_terms = session.query(SystemSettings).filter_by(key='service_terms').first()
        privacy_policy = session.query(SystemSettings).filter_by(key='privacy_policy').first()
        user_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()

        return {
            "code": 200,
            "data": {
                "service_terms": service_terms.value if service_terms else "暂无服务条款",
                "privacy_policy": privacy_policy.value if privacy_policy else "暂无隐私条款",
                "user_agreement": user_agreement.value if user_agreement else "暂无用户协议",
            }
        }


# ── 保存系统设置 ────────────────────────────────────────────────────
@app.post("/api/system-settings")
def save_system_settings(req: SaveSystemSettingsRequest):
    """管理员保存系统设置"""
    user_id = req.user_id
    service_terms = req.service_terms
    privacy_policy = req.privacy_policy
    user_agreement = req.user_agreement

    with Session(engine) as session:
        # 验证权限
        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role != 'manager':
            raise HTTPException(status_code=403, detail="权限不足")

        # 更新或创建服务条款
        st = session.query(SystemSettings).filter_by(key='service_terms').first()
        if st:
            st.value = service_terms
            st.updated_by = user_id
        else:
            st = SystemSettings(key='service_terms', value=service_terms, updated_by=user_id)
            session.add(st)

        # 更新或创建隐私条款
        pp = session.query(SystemSettings).filter_by(key='privacy_policy').first()
        if pp:
            pp.value = privacy_policy
            pp.updated_by = user_id
        else:
            pp = SystemSettings(key='privacy_policy', value=privacy_policy, updated_by=user_id)
            session.add(pp)

        # 更新或创建用户协议
        ua = session.query(SystemSettings).filter_by(key='user_agreement').first()
        if ua:
            ua.value = user_agreement
            ua.updated_by = user_id
        else:
            ua = SystemSettings(key='user_agreement', value=user_agreement, updated_by=user_id)
            session.add(ua)

        session.commit()

    return {"code": 200, "msg": "保存成功"}



# ── 用户管理 ──────────────────────────────────────────────────────
@app.get("/api/users")
def list_users(limit: int = 1000, offset: int = 0):
    with Session(engine) as session:
        total = session.query(User).count()
        users = session.query(User).order_by(User.id).offset(offset).limit(limit).all()
        return {"code": 200, "data": [{"id": u.id, "username": u.username, "role": u.role} for u in users], "total": total}

@app.post("/api/users", status_code=201)
def create_user(req: CreateUserRequest):
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"无效角色，可选: {', '.join(VALID_ROLES)}")
    with Session(engine) as session:
        if session.query(User).filter_by(username=req.username).first():
            raise HTTPException(status_code=409, detail="账号名已存在")
        session.add(User(
            username=req.username,
            password_hash=pwd_context.hash(req.password),
            role=req.role,
        ))
        session.commit()
    return {"code": 201, "msg": "账号创建成功"}

@app.post("/api/users/batch", status_code=201)
def batch_create_users(req: BatchCreateUserRequest):
    if req.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"无效角色，可选: {', '.join(VALID_ROLES)}")
    if not (1 <= req.count <= 500):
        raise HTTPException(status_code=400, detail="批量数量须在 1 ~ 500 之间")
    if not req.prefix.strip():
        raise HTTPException(status_code=400, detail="前缀不能为空")
    with Session(engine) as session:
        grp = session.query(Group).filter_by(id=req.group_id).first()
        if not grp:
            raise HTTPException(status_code=404, detail="分组不存在")
        if grp.role_type != req.role and req.role != "manager":
            raise HTTPException(status_code=400, detail=f"该分组类型为 {grp.role_type}，与所选角色 {req.role} 不匹配")
        
        prefix = req.prefix.strip()
        # 查找已有同前缀账号的最大编号
        existing_names = set()
        max_num = 0
        for (name,) in session.query(User.username).filter(User.username.like(f"{prefix}%")).all():
            existing_names.add(name)
            suffix = name[len(prefix):]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))
        
        # 动态位数：至少2位，或根据最大编号决定
        pad = max(2, len(str(max_num + req.count)))
        new_users, plain_passwords = [], []
        i = max_num + 1
        while len(new_users) < req.count:
            username = f"{prefix}{i:0{pad}d}"
            if username not in existing_names:
                password = ''.join(random.choices(string.ascii_letters + string.digits, k=6))
                user = User(username=username, password_hash=pwd_context.hash(password), role=req.role)
                session.add(user)
                new_users.append(user)
                plain_passwords.append(password)
                existing_names.add(username)
            i += 1
        session.flush()
        for user in new_users:
            session.add(GroupMember(group_id=req.group_id, user_id=user.id))
        session.commit()
        return {
            "code": 201,
            "msg": f"成功创建 {len(new_users)} 个账号",
            "data": [
                {"username": u.username, "password": p, "role": u.role}
                for u, p in zip(new_users, plain_passwords)
            ],
        }

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="账号不存在")
        session.query(GroupMember).filter_by(user_id=user_id).delete()
        session.delete(user)
        session.commit()
    return {"code": 200, "msg": "删除成功"}

@app.post("/api/users/bulk-delete")
def bulk_delete_users(req: BulkUserIdsRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    with Session(engine) as session:
        for uid in req.ids:
            user = session.query(User).filter_by(id=uid).first()
            if user and user.role != "manager":
                session.query(GroupMember).filter_by(user_id=uid).delete()
                session.delete(user)
        session.commit()
    return {"code": 200, "msg": f"已删除 {len(req.ids)} 个账号"}

@app.post("/api/users/bulk-change-group")
def bulk_change_group(req: BulkChangeGroupRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    with Session(engine) as session:
        grp = session.query(Group).filter_by(id=req.group_id).first()
        if not grp:
            raise HTTPException(status_code=404, detail="分组不存在")
        for uid in req.ids:
            user = session.query(User).filter_by(id=uid).first()
            if not user:
                continue
            if user.role != grp.role_type:
                raise HTTPException(status_code=400, detail=f"账号 {user.username} 角色为 {user.role}，与目标分组类型 {grp.role_type} 不匹配")
            session.query(GroupMember).filter_by(user_id=uid).delete()
            session.add(GroupMember(group_id=req.group_id, user_id=uid))
        grp_name = grp.name
        session.commit()
    return {"code": 200, "msg": f"已将 {len(req.ids)} 个账号移入 {grp_name}"}


# ── 语料组管理 ────────────────────────────────────────────────────
@app.get("/api/admin/corpus-groups")
def list_corpus_groups(limit: int = 20, offset: int = 0):
    cache_key = f"corpus_groups:{limit}:{offset}"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    with Session(engine) as session:
        total = session.query(CorpusGroup).count()
        groups = session.query(CorpusGroup).order_by(CorpusGroup.id).offset(offset).limit(limit).all()
        if not groups:
            return {"code": 200, "data": [], "total": total}
        
        group_ids = [g.id for g in groups]
        
        # 批量查询：语料数量
        corpus_counts = dict(
            session.query(CorpusText.corpus_group_id, func.count(CorpusText.id))
            .filter(CorpusText.corpus_group_id.in_(group_ids))
            .group_by(CorpusText.corpus_group_id).all()
        )
        
        # 批量查询：包数量
        package_counts = dict(
            session.query(CorpusPackage.corpus_group_id, func.count(CorpusPackage.id))
            .filter(CorpusPackage.corpus_group_id.in_(group_ids))
            .group_by(CorpusPackage.corpus_group_id).all()
        )
        
        # 批量查询：已打包语料数量
        packaged_counts = dict(
            session.query(CorpusPackage.corpus_group_id, func.count(func.distinct(CorpusPackageItem.corpus_text_id)))
            .join(CorpusPackageItem, CorpusPackageItem.package_id == CorpusPackage.id)
            .filter(CorpusPackage.corpus_group_id.in_(group_ids))
            .group_by(CorpusPackage.corpus_group_id).all()
        )
        
        # 批量查询：待审核数量
        pending_review_counts = dict(
            session.query(CorpusPackage.corpus_group_id, func.count(CorpusPackage.id))
            .filter(
                CorpusPackage.corpus_group_id.in_(group_ids),
                CorpusPackage.status == "已完成",
                CorpusPackage.review_status == "待审核"
            )
            .group_by(CorpusPackage.corpus_group_id).all()
        )
        
        # 批量查询：所有分配关系（5种类型）
        assignment_types = [
            (CorpusGroupAssignment, CorpusGroupAssignment.collector_group_id, "collector"),
            (CorpusAnnotationAssignment, CorpusAnnotationAssignment.annotator_group_id, "annotator"),
            (CorpusInspectionAssignment, CorpusInspectionAssignment.inspector_group_id, "inspector"),
            (CorpusReviewerAssignment, CorpusReviewerAssignment.reviewer_group_id, "reviewer"),
            (CorpusQualityReviewerAssignment, CorpusQualityReviewerAssignment.quality_reviewer_group_id, "quality_reviewer"),
        ]
        
        assignments_map = {t: {} for _, _, t in assignment_types}
        for assign_model, group_fk, assign_type in assignment_types:
            rows = (
                session.query(assign_model.corpus_group_id, Group.id, Group.name)
                .join(Group, Group.id == group_fk)
                .filter(assign_model.corpus_group_id.in_(group_ids))
                .all()
            )
            for cg_id, g_id, g_name in rows:
                assignments_map[assign_type].setdefault(cg_id, []).append({"id": g_id, "name": g_name})
        
        result = []
        for g in groups:
            result.append({
                "id": g.id, "name": g.name,
                "folder_id": g.folder_id,
                "corpus_count": corpus_counts.get(g.id, 0),
                "packaged_count": packaged_counts.get(g.id, 0),
                "package_count": package_counts.get(g.id, 0),
                "pending_review_count": pending_review_counts.get(g.id, 0),
                "assigned_groups": assignments_map["collector"].get(g.id, []),
                "annotator_groups": assignments_map["annotator"].get(g.id, []),
                "inspector_groups": assignments_map["inspector"].get(g.id, []),
                "reviewer_groups": assignments_map["reviewer"].get(g.id, []),
                "quality_reviewer_groups": assignments_map["quality_reviewer"].get(g.id, []),
            })
        
        resp = {"code": 200, "data": result, "total": total}
        cache_set(cache_key, resp)
        return resp


# ── 语料组文件夹管理 API ──────────────────────────────────────────
class CreateFolderRequest(BaseModel):
    name: str
    level: int  # 1=方言, 2=地区
    parent_id: int | None = None

@app.get("/api/admin/corpus-folders")
def list_corpus_folders():
    cache_key = "corpus_folders"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    with Session(engine) as session:
        folders = session.query(CorpusGroupFolder).order_by(CorpusGroupFolder.level, CorpusGroupFolder.id).all()
        
        # 批量查询：每个文件夹的组数量
        group_counts = dict(
            session.query(CorpusGroup.folder_id, func.count(CorpusGroup.id))
            .filter(CorpusGroup.folder_id.isnot(None))
            .group_by(CorpusGroup.folder_id).all()
        )
        
        result = []
        for f in folders:
            result.append({
                "id": f.id, "name": f.name, "level": f.level,
                "parent_id": f.parent_id, "group_count": group_counts.get(f.id, 0),
            })
        
        resp = {"code": 200, "data": result}
        cache_set(cache_key, resp)
        return resp

@app.post("/api/admin/corpus-folders", status_code=201)
def create_corpus_folder(req: CreateFolderRequest):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="名称不能为空")
    with Session(engine) as session:
        existing = session.query(CorpusGroupFolder).filter_by(
            name=req.name.strip(), level=req.level, parent_id=req.parent_id
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="同级下已存在同名文件夹")
        if req.level == 2 and req.parent_id:
            parent = session.query(CorpusGroupFolder).filter_by(id=req.parent_id, level=1).first()
            if not parent:
                raise HTTPException(status_code=400, detail="父文件夹不存在")
        f = CorpusGroupFolder(name=req.name.strip(), level=req.level, parent_id=req.parent_id)
        session.add(f)
        session.commit()
        session.refresh(f)
        cache_delete("corpus_folders*")
        cache_delete("dialect_stats*")
        return {"code": 201, "msg": "创建成功", "data": {"id": f.id, "name": f.name, "level": f.level, "parent_id": f.parent_id}}

@app.delete("/api/admin/corpus-folders/{folder_id}")
def delete_corpus_folder(folder_id: int):
    with Session(engine) as session:
        f = session.query(CorpusGroupFolder).filter_by(id=folder_id).first()
        if not f:
            raise HTTPException(status_code=404, detail="文件夹不存在")
        if f.level == 1:
            children = session.query(CorpusGroupFolder).filter_by(parent_id=f.id).count()
            if children > 0:
                raise HTTPException(status_code=400, detail="请先删除子文件夹")
        group_count = session.query(CorpusGroup).filter_by(folder_id=f.id).count()
        if group_count > 0:
            raise HTTPException(status_code=400, detail=f"文件夹下还有 {group_count} 个语料组，请先移出")
        session.delete(f)
        session.commit()
        cache_delete("corpus_folders*")
        cache_delete("dialect_stats*")
        return {"code": 200, "msg": "删除成功"}

class MoveGroupRequest(BaseModel):
    folder_id: int | None = None

@app.post("/api/admin/corpus-groups/{group_id}/move")
def move_corpus_group(group_id: int, req: MoveGroupRequest):
    with Session(engine) as session:
        g = session.query(CorpusGroup).filter_by(id=group_id).first()
        if not g:
            raise HTTPException(status_code=404, detail="语料组不存在")
        if req.folder_id:
            folder = session.query(CorpusGroupFolder).filter_by(id=req.folder_id, level=2).first()
            if not folder:
                raise HTTPException(status_code=400, detail="目标文件夹不存在或不是地区文件夹")
        g.folder_id = req.folder_id
        session.commit()
        cache_delete("corpus_groups*")
        cache_delete("dialect_stats*")
        return {"code": 200, "msg": "移动成功"}

@app.get("/api/admin/dialect-stats")
def get_dialect_stats():
    """按方言文件夹统计（方言→地区→组 三级仪表盘）"""
    cache_key = "dialect_stats"
    cached = cache_get(cache_key)
    if cached:
        return cached
    
    with Session(engine) as session:
        # 获取所有文件夹
        all_folders = session.query(CorpusGroupFolder).all()
        folder_map = {f.id: f for f in all_folders}
        
        # 获取所有组及其文件夹映射
        all_groups = session.query(CorpusGroup).all()
        group_folder_map = {g.id: g.folder_id for g in all_groups}
        group_name_map = {g.id: g.name for g in all_groups}
        
        # 批量查询：按 corpus_group_id 统计包数据
        if not DATABASE_URL.startswith("sqlite"):
            pkg_rows = session.query(
                CorpusPackage.corpus_group_id,
                func.count(CorpusPackage.id).label('total'),
                func.sum(func.IF(CorpusPackage.status == "已完成", 1, 0)).label('completed'),
                func.sum(func.IF(CorpusPackage.review_status == "已合格", 1, 0)).label('approved'),
            ).group_by(CorpusPackage.corpus_group_id).all()
            pkg_stats = {r[0]: (r[1], r[2], r[3]) for r in pkg_rows}
        else:
            pkg_stats = {}
        
        # SQLite 版本
        if DATABASE_URL.startswith("sqlite"):
            pkg_rows = session.execute(text("""
                SELECT corpus_group_id,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN review_status = '已合格' THEN 1 ELSE 0 END) as approved
                FROM corpus_packages GROUP BY corpus_group_id
            """)).fetchall()
            pkg_stats = {r[0]: (r[1], r[2], r[3]) for r in pkg_rows}
        
        # 批量查询：按 corpus_group_id 统计录音数据（只计算有文件、有文本、有效的录音）
        if not DATABASE_URL.startswith("sqlite"):
            rec_rows = (
                session.query(
                    CorpusPackage.corpus_group_id,
                    func.count(VoiceRecording.id).label('total_rec'),
                    func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('total_dur'),
                    func.sum(func.IF(VoiceRecording.annotated_by.isnot(None), 1, 0)).label('annotated'),
                    func.sum(func.IF(VoiceRecording.inspected_by.isnot(None), 1, 0)).label('inspected'),
                )
                .join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id)
                .filter(
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                )
                .group_by(CorpusPackage.corpus_group_id)
                .all()
            )
            rec_stats = {r[0]: (r[1], r[2], r[3], r[4]) for r in rec_rows}
        else:
            rec_rows = session.execute(text("""
                SELECT cp.corpus_group_id,
                    COUNT(vr.id) as total_rec,
                    COALESCE(SUM(vr.duration_seconds), 0) as total_dur,
                    SUM(CASE WHEN vr.annotated_by IS NOT NULL THEN 1 ELSE 0 END) as annotated,
                    SUM(CASE WHEN vr.inspected_by IS NOT NULL THEN 1 ELSE 0 END) as inspected
                FROM voice_recordings vr
                JOIN corpus_packages cp ON cp.id = vr.package_id
                WHERE vr.file_path IS NOT NULL AND vr.file_path != ''
                  AND vr.annotated_text IS NOT NULL AND vr.annotated_text != ''
                  AND (vr.is_valid != 0 OR vr.is_valid IS NULL)
                GROUP BY cp.corpus_group_id
            """)).fetchall()
            rec_stats = {r[0]: (r[1], r[2], r[3], r[4]) for r in rec_rows}
        
        # 批量查询：可导出的录音数据（已质检+已合格+已提交+有效+非空录音+非空文本）
        if not DATABASE_URL.startswith("sqlite"):
            export_rows = (
                session.query(
                    CorpusPackage.corpus_group_id,
                    func.count(VoiceRecording.id).label('exp_rec'),
                    func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('exp_dur'),
                )
                .join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id)
                .filter(
                    CorpusPackage.quality_status == "已质检",
                    CorpusPackage.quality_review_status == "已合格",
                    VoiceRecording.status == "已提交",
                    VoiceRecording.submitted_at.isnot(None),
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                )
                .group_by(CorpusPackage.corpus_group_id)
                .all()
            )
            export_stats = {r[0]: (r[1], r[2]) for r in export_rows}
        else:
            export_rows = session.execute(text("""
                SELECT cp.corpus_group_id,
                    COUNT(vr.id) as exp_rec,
                    COALESCE(SUM(vr.duration_seconds), 0) as exp_dur
                FROM voice_recordings vr
                JOIN corpus_packages cp ON cp.id = vr.package_id
                WHERE cp.quality_status = '已质检'
                    AND cp.quality_review_status = '已合格'
                    AND vr.status = '已提交'
                    AND vr.submitted_at IS NOT NULL
                    AND vr.file_path IS NOT NULL AND vr.file_path != ''
                    AND vr.annotated_text IS NOT NULL AND vr.annotated_text != ''
                    AND (vr.is_valid != 0 OR vr.is_valid IS NULL)
                GROUP BY cp.corpus_group_id
            """)).fetchall()
            export_stats = {r[0]: (r[1], r[2]) for r in export_rows}
        
        # 构建层级结构
        # 按 folder_id 分组
        group_by_folder = {}
        for g in all_groups:
            if g.folder_id:
                group_by_folder.setdefault(g.folder_id, []).append(g.id)
        
        # 递归计算统计
        def calc_stats(folder_id):
            """计算某个文件夹下的所有统计"""
            folder = folder_map.get(folder_id)
            if not folder:
                return None
            
            # 获取该文件夹下的直接子文件夹
            children = [f for f in all_folders if f.parent_id == folder_id]
            
            if folder.level == 1:  # 方言
                child_results = []
                totals = {"total_packages": 0, "completed_packages": 0, "approved_packages": 0,
                         "total_recordings": 0, "total_duration_seconds": 0, "annotated_count": 0,
                         "inspected_count": 0, "quality_approved_count": 0, "quality_approved_duration": 0}
                
                for child in sorted(children, key=lambda x: x.id):
                    child_data = calc_stats(child.id)
                    if child_data:
                        child_results.append(child_data)
                        for k in totals:
                            totals[k] += child_data.get(k, 0)
                
                return {"id": folder.id, "name": folder.name, "regions": child_results, **totals}
            
            elif folder.level == 2:  # 地区
                # 直接获取关联的组（组通过 folder_id 关联到地区，不是子文件夹）
                gids = group_by_folder.get(folder_id, [])
                groups_list = []
                totals = {"total_packages": 0, "completed_packages": 0, "approved_packages": 0,
                         "total_recordings": 0, "total_duration_seconds": 0, "annotated_count": 0,
                         "inspected_count": 0, "quality_approved_count": 0, "quality_approved_duration": 0}
                
                for gid in gids:
                    pkg = pkg_stats.get(gid)
                    if isinstance(pkg, tuple):
                        total_pkg, completed_pkg, approved_pkg = pkg[0], pkg[1], pkg[2]
                    else:
                        p = pkg or {}
                        total_pkg, completed_pkg, approved_pkg = p.get('total', 0), p.get('completed', 0), p.get('approved', 0)
                    
                    rec = rec_stats.get(gid)
                    if isinstance(rec, tuple):
                        total_rec, total_dur, annotated, inspected = rec[0], rec[1], rec[2], rec[3]
                    else:
                        r = rec or {}
                        total_rec = r.get('total_rec', 0)
                        total_dur = r.get('total_dur', 0)
                        annotated = r.get('annotated', 0)
                        inspected = r.get('inspected', 0)
                    
                    exp = export_stats.get(gid)
                    if isinstance(exp, tuple):
                        exp_rec, exp_dur = exp[0], exp[1]
                    else:
                        e = exp or {}
                        exp_rec, exp_dur = e.get('exp_rec', 0), e.get('exp_dur', 0)
                    
                    groups_list.append({
                        "id": gid, "name": group_name_map.get(gid, ""),
                        "total_packages": total_pkg, "completed_packages": completed_pkg,
                        "approved_packages": approved_pkg, "total_recordings": total_rec,
                        "total_duration_seconds": int(total_dur), "annotated_count": annotated,
                        "inspected_count": inspected, "quality_approved_count": exp_rec,
                        "quality_approved_duration": int(exp_dur),
                    })
                    
                    totals["total_packages"] += total_pkg
                    totals["completed_packages"] += completed_pkg
                    totals["approved_packages"] += approved_pkg
                    totals["total_recordings"] += total_rec
                    totals["total_duration_seconds"] += int(total_dur)
                    totals["annotated_count"] += annotated
                    totals["inspected_count"] += inspected
                    totals["quality_approved_count"] += exp_rec
                    totals["quality_approved_duration"] += int(exp_dur)
                
                return {"id": folder.id, "name": folder.name, "groups": groups_list, **totals}
            
            else:  # 组（level=3 或无 level）
                # 直接从预查询数据中获取统计
                gids = group_by_folder.get(folder_id, [])
                total_pkg = sum(pkg_stats.get(gid, (0,0,0))[0] if isinstance(pkg_stats.get(gid), tuple) else (pkg_stats.get(gid) or {}).get('total', 0) for gid in gids)
                completed_pkg = sum(pkg_stats.get(gid, (0,0,0))[1] if isinstance(pkg_stats.get(gid), tuple) else (pkg_stats.get(gid) or {}).get('completed', 0) for gid in gids)
                approved_pkg = sum(pkg_stats.get(gid, (0,0,0))[2] if isinstance(pkg_stats.get(gid), tuple) else (pkg_stats.get(gid) or {}).get('approved', 0) for gid in gids)
                
                total_rec = sum(rec_stats.get(gid, (0,0,0,0))[0] if isinstance(rec_stats.get(gid), tuple) else (rec_stats.get(gid) or {}).get('total_rec', 0) for gid in gids)
                total_dur = sum(rec_stats.get(gid, (0,0,0,0))[1] if isinstance(rec_stats.get(gid), tuple) else (rec_stats.get(gid) or {}).get('total_dur', 0) for gid in gids)
                annotated = sum(rec_stats.get(gid, (0,0,0,0))[2] if isinstance(rec_stats.get(gid), tuple) else (rec_stats.get(gid) or {}).get('annotated', 0) for gid in gids)
                inspected = sum(rec_stats.get(gid, (0,0,0,0))[3] if isinstance(rec_stats.get(gid), tuple) else (rec_stats.get(gid) or {}).get('inspected', 0) for gid in gids)
                
                exp_rec = sum(export_stats.get(gid, (0,0))[0] if isinstance(export_stats.get(gid), tuple) else (export_stats.get(gid) or {}).get('exp_rec', 0) for gid in gids)
                exp_dur = sum(export_stats.get(gid, (0,0))[1] if isinstance(export_stats.get(gid), tuple) else (export_stats.get(gid) or {}).get('exp_dur', 0) for gid in gids)
                
                return {
                    "id": folder.id, "name": folder.name,
                    "total_packages": total_pkg, "completed_packages": completed_pkg,
                    "approved_packages": approved_pkg, "total_recordings": total_rec,
                    "total_duration_seconds": int(total_dur), "annotated_count": annotated,
                    "inspected_count": inspected, "quality_approved_count": exp_rec,
                    "quality_approved_duration": int(exp_dur),
                }
        
        # 构建结果：只返回方言级别（level=1）
        dialects = [f for f in all_folders if f.level == 1]
        result = []
        for d in sorted(dialects, key=lambda x: x.id):
            data = calc_stats(d.id)
            if data:
                result.append(data)
        
        resp = {"code": 200, "data": result}
        cache_set(cache_key, resp)
        return resp

@app.post("/api/admin/corpus-groups", status_code=201)
def create_corpus_group(req: CreateCorpusGroupRequest):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="组名不能为空")
    with Session(engine) as session:
        if session.query(CorpusGroup).filter_by(name=req.name.strip()).first():
            raise HTTPException(status_code=409, detail="语料组名已存在")
        g = CorpusGroup(name=req.name.strip(), dialect_region=req.dialect_region)
        session.add(g)
        session.commit()
        session.refresh(g)
        cache_delete("corpus_groups*")
        cache_delete("dialect_stats*")
        return {"code": 201, "msg": "语料组创建成功", "data": {"id": g.id, "name": g.name, "dialect_region": g.dialect_region}}

class UpdateCorpusGroupRequest(BaseModel):
    pinyin_region: str = None

@app.put("/api/admin/corpus-groups/{group_id}")
def update_corpus_group(group_id: int, req: UpdateCorpusGroupRequest):
    """更新语料组信息"""
    with Session(engine) as session:
        g = session.query(CorpusGroup).filter_by(id=group_id).first()
        if not g:
            raise HTTPException(status_code=404, detail="语料组不存在")

        if req.pinyin_region:
            g.pinyin_region = req.pinyin_region.strip()

        session.commit()
        session.refresh(g)
        return {"code": 200, "msg": "更新成功", "data": {"id": g.id, "name": g.name, "pinyin_region": g.pinyin_region}}

@app.delete("/api/admin/corpus-groups/{group_id}")
def delete_corpus_group(group_id: int):
    try:
        with Session(engine) as session:
            g = session.query(CorpusGroup).filter_by(id=group_id).first()
            if not g:
                raise HTTPException(status_code=404, detail="语料组不存在")

            # 删除所有相关数据（级联删除，无条件）
            # 注意删除顺序：先删除有外键引用的表，再删除被引用的表

            # 1. 获取该语料组的所有语料包和语料 ID
            package_ids = [
                row[0] for row in
                session.query(CorpusPackage.id).filter_by(corpus_group_id=group_id).all()
            ]
            corpus_ids = [
                row[0] for row in
                session.query(CorpusText.id).filter_by(corpus_group_id=group_id).all()
            ]

            # 2. 删除语音录制记录（引用 corpus_text_id 和 package_id）
            if package_ids or corpus_ids:
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id.in_(package_ids) if package_ids else False
                ).delete(synchronize_session=False)

            # 3. 删除打回备注（引用 corpus_text_id 和 package_id）
            if package_ids or corpus_ids:
                session.query(PackageCorpusRejectionNote).filter(
                    PackageCorpusRejectionNote.package_id.in_(package_ids) if package_ids else False
                ).delete(synchronize_session=False)

            # 4. 删除语料包项（引用 package_id 和 corpus_text_id）
            if package_ids:
                session.query(CorpusPackageItem).filter(CorpusPackageItem.package_id.in_(package_ids)).delete(synchronize_session=False)

            # 5. 删除语料包
            if package_ids:
                session.query(CorpusPackage).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 6. 删除语料
            if corpus_ids:
                session.query(CorpusText).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 7. 删除采集组分配关系
            session.query(CorpusGroupAssignment).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 8. 删除标注组分配关系
            session.query(CorpusAnnotationAssignment).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 9. 删除质检组分配关系
            session.query(CorpusInspectionAssignment).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 10. 删除采集审核组分配关系
            session.query(CorpusReviewerAssignment).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 11. 删除质检审核组分配关系
            session.query(CorpusQualityReviewerAssignment).filter_by(corpus_group_id=group_id).delete(synchronize_session=False)

            # 12. 删除语料组本身
            session.delete(g)
            session.commit()
        cache_delete("corpus_groups*")
        cache_delete("dialect_stats*")
        return {"code": 200, "msg": "删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[删除语料组错误] group_id={group_id}, 错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")

@app.post("/api/admin/corpus-groups/{group_id}/assign")
def assign_corpus_group(group_id: int, req: AssignCorpusGroupRequest):
    if not req.collector_group_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个采集组")
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        added = 0
        for cgid in req.collector_group_ids:
            if not session.query(Group).filter_by(id=cgid).first():
                raise HTTPException(status_code=404, detail=f"采集组 {cgid} 不存在")
            exists = session.query(CorpusGroupAssignment).filter_by(
                corpus_group_id=group_id, collector_group_id=cgid
            ).first()
            if not exists:
                session.add(CorpusGroupAssignment(corpus_group_id=group_id, collector_group_id=cgid))
                added += 1
        session.commit()
    return {"code": 200, "msg": f"新增分配 {added} 个采集组"}

@app.delete("/api/admin/corpus-groups/{group_id}/collector-groups/{cgid}")
def unassign_corpus_group(group_id: int, cgid: int):
    with Session(engine) as session:
        row = session.query(CorpusGroupAssignment).filter_by(
            corpus_group_id=group_id, collector_group_id=cgid
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="该分配关系不存在")
        session.delete(row)
        session.commit()
    return {"code": 200, "msg": "取消分配成功"}

@app.post("/api/admin/corpus-groups/{group_id}/assign-annotators")
def assign_annotator_groups(group_id: int, req: AssignAnnotatorGroupRequest):
    if not req.annotator_group_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个标注组")
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        added = 0
        for agid in req.annotator_group_ids:
            if not session.query(Group).filter_by(id=agid).first():
                raise HTTPException(status_code=404, detail=f"标注组 {agid} 不存在")
            exists = session.query(CorpusAnnotationAssignment).filter_by(
                corpus_group_id=group_id, annotator_group_id=agid
            ).first()
            if not exists:
                session.add(CorpusAnnotationAssignment(corpus_group_id=group_id, annotator_group_id=agid))
                added += 1
        session.commit()
    return {"code": 200, "msg": f"新增分配 {added} 个标注组"}

@app.delete("/api/admin/corpus-groups/{group_id}/annotator-groups/{agid}")
def unassign_annotator_group(group_id: int, agid: int):
    with Session(engine) as session:
        row = session.query(CorpusAnnotationAssignment).filter_by(
            corpus_group_id=group_id, annotator_group_id=agid
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="该分配关系不存在")
        session.delete(row)
        session.commit()
    return {"code": 200, "msg": "取消分配成功"}

@app.post("/api/admin/corpus-groups/{group_id}/assign-inspectors")
def assign_inspector_groups(group_id: int, req: AssignInspectorGroupRequest):
    if not req.inspector_group_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个质检组")
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        added = 0
        for igid in req.inspector_group_ids:
            if not session.query(Group).filter_by(id=igid).first():
                raise HTTPException(status_code=404, detail=f"质检组 {igid} 不存在")
            exists = session.query(CorpusInspectionAssignment).filter_by(
                corpus_group_id=group_id, inspector_group_id=igid
            ).first()
            if not exists:
                session.add(CorpusInspectionAssignment(corpus_group_id=group_id, inspector_group_id=igid))
                added += 1
        session.commit()
    return {"code": 200, "msg": f"新增分配 {added} 个质检组"}

@app.delete("/api/admin/corpus-groups/{group_id}/inspector-groups/{igid}")
def unassign_inspector_group(group_id: int, igid: int):
    with Session(engine) as session:
        row = session.query(CorpusInspectionAssignment).filter_by(
            corpus_group_id=group_id, inspector_group_id=igid
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="该分配关系不存在")
        session.delete(row)
        session.commit()
    return {"code": 200, "msg": "取��分配成功"}

@app.post("/api/admin/corpus-groups/{group_id}/assign-reviewers")
def assign_reviewer_groups(group_id: int, req: AssignReviewerGroupRequest):
    if not req.reviewer_group_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个采集审核组")
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        added = 0
        for rgid in req.reviewer_group_ids:
            if not session.query(Group).filter_by(id=rgid).first():
                raise HTTPException(status_code=404, detail=f"采集审核组 {rgid} 不存在")
            exists = session.query(CorpusReviewerAssignment).filter_by(
                corpus_group_id=group_id, reviewer_group_id=rgid
            ).first()
            if not exists:
                session.add(CorpusReviewerAssignment(corpus_group_id=group_id, reviewer_group_id=rgid))
                added += 1
        session.commit()
    return {"code": 200, "msg": f"新增分配 {added} 个采集审核组"}

@app.delete("/api/admin/corpus-groups/{group_id}/reviewer-groups/{rgid}")
def unassign_reviewer_group(group_id: int, rgid: int):
    with Session(engine) as session:
        row = session.query(CorpusReviewerAssignment).filter_by(
            corpus_group_id=group_id, reviewer_group_id=rgid
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="该分配关系不存在")
        session.delete(row)
        session.commit()
    return {"code": 200, "msg": "取消分配成功"}


@app.post("/api/admin/corpus-groups/{group_id}/assign-quality-reviewers")
def assign_quality_reviewer_groups(group_id: int, req: AssignQualityReviewerGroupRequest):
    if not req.quality_reviewer_group_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个质检审核组")
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        added = 0
        for qrgid in req.quality_reviewer_group_ids:
            if not session.query(Group).filter_by(id=qrgid).first():
                raise HTTPException(status_code=404, detail=f"质检审核组 {qrgid} 不存在")
            exists = session.query(CorpusQualityReviewerAssignment).filter_by(
                corpus_group_id=group_id, quality_reviewer_group_id=qrgid
            ).first()
            if not exists:
                session.add(CorpusQualityReviewerAssignment(corpus_group_id=group_id, quality_reviewer_group_id=qrgid))
                added += 1
        session.commit()
    return {"code": 200, "msg": f"新增分配 {added} 个质检审核组"}

@app.delete("/api/admin/corpus-groups/{group_id}/quality-reviewer-groups/{qrgid}")
def unassign_quality_reviewer_group(group_id: int, qrgid: int):
    with Session(engine) as session:
        row = session.query(CorpusQualityReviewerAssignment).filter_by(
            corpus_group_id=group_id, quality_reviewer_group_id=qrgid
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail="该分配关系不存在")
        session.delete(row)
        session.commit()
    return {"code": 200, "msg": "取消分配成功"}




# ── 语料管理 ──────────────────────────────────────────────────────
@app.post("/api/admin/upload-corpus")
async def upload_corpus(
    file: UploadFile = File(...),
    corpus_group_id: int = Form(...),
):
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=corpus_group_id).first():
            raise HTTPException(status_code=404, detail="指定的语料组不存在")

    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv")
    is_xlsx = filename.endswith(".xlsx")

    if not (is_csv or is_xlsx):
        raise HTTPException(status_code=400, detail="请上传 .csv 或 .xlsx 格式的文件")

    raw = await file.read()
    rows_data = []  # [(col0, col1), ...]

    if is_xlsx:
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True)
            ws = wb.active
            for row in ws.iter_rows(min_row=1, values_only=True):
                cells = [str(c) if c is not None else "" for c in row]
                rows_data.append(cells)
            wb.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"解析xlsx失败: {str(e)}")
    else:
        for encoding in ("utf-8-sig", "gbk"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise HTTPException(status_code=400, detail="文件编码不支持，请保存为 UTF-8 或 GBK 格式")
        reader = csv.reader(io.StringIO(text))
        rows_data = list(reader)

    added = skipped = invalid = 0
    # 提取所有上传的不为空的语料文本
    uploaded_contents = set()
    for row in rows_data:
        if len(row) >= 2:
            content = row[1].strip()
            if content:
                uploaded_contents.add(content)

    with Session(engine) as session:
        # 只从数据库里查出与当前上传内容相匹配的已存在记录（仅限当前语料组内去重，跨组允许重复）
        existing_contents = set()
        if uploaded_contents:
            uploaded_list = list(uploaded_contents)
            for i in range(0, len(uploaded_list), 5000):
                chunk = uploaded_list[i:i+5000]
                rows = session.query(CorpusText.content).filter(
                    CorpusText.content.in_(chunk),
                    CorpusText.corpus_group_id == corpus_group_id
                ).all()
                for r in rows:
                    existing_contents.add(r[0])

        # 已存在的 raw_id（不含前缀），用于防止原始ID冲突
        existing_text_ids = set(
            (r[0].split("#", 1)[1] if "#" in r[0] else r[0]) for r in session.query(CorpusText.text_id)
            .filter(CorpusText.corpus_group_id == corpus_group_id).all()
        )

        new_rows = []
        for row in rows_data:
            if len(row) < 2:
                invalid += 1
                continue
            # 如果 content 含逗号且未加引号，csv.reader 会拆成多列，拼回来
            content = row[1].strip()
            if not content:
                invalid += 1
                continue
            if content in existing_contents:
                skipped += 1
                continue
            # 优先使用 CSV 第一列作为原始语料 ID，为空则退化为 MD5 哈希
            raw_id = row[0].strip() if row[0] else ""
            if raw_id and raw_id not in existing_text_ids:
                # 加上组ID前缀，绕过全局 unique=True 限制
                text_id = f"{corpus_group_id}#{raw_id}"
            else:
                text_id = f"{corpus_group_id}#text_{hashlib.md5(content.encode()).hexdigest()[:12]}"
            existing_text_ids.add(raw_id if raw_id else text_id)
            new_rows.append(CorpusText(text_id=text_id, content=content, corpus_group_id=corpus_group_id))
            existing_contents.add(content)
            added += 1
        session.add_all(new_rows)
        session.commit()
    return {
        "code": 200,
        "msg": f"上传完成：新增 {added} 条，跳过重复 {skipped} 条，无效行 {invalid} 条",
        "added": added, "skipped": skipped, "invalid": invalid,
    }

@app.get("/api/admin/corpus")
def list_corpus(corpus_group_id: int, limit: int = 20, offset: int = 0):
    with Session(engine) as session:
        q     = session.query(CorpusText).filter_by(corpus_group_id=corpus_group_id)
        total = q.count()
        rows  = q.order_by(CorpusText.id).offset(offset).limit(limit).all()
        packaged_ids = {
            row[0] for row in
            session.query(CorpusPackageItem.corpus_text_id)
            .join(CorpusPackage, CorpusPackage.id == CorpusPackageItem.package_id)
            .filter(CorpusPackage.corpus_group_id == corpus_group_id)
        }
        return {
            "code": 200, "total": total,
            "packaged_count": len(packaged_ids),
            "data": [{"id": r.id, "text_id": r.text_id.split("#", 1)[1] if "#" in r.text_id else r.text_id, "content": r.content,
                      "packaged": r.id in packaged_ids} for r in rows],
        }

@app.delete("/api/admin/corpus/{corpus_id}")
def delete_corpus(corpus_id: int):
    with Session(engine) as session:
        item = session.query(CorpusText).filter_by(id=corpus_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="语料不存在")
        if session.query(CorpusPackageItem).filter_by(corpus_text_id=corpus_id).first():
            raise HTTPException(status_code=400, detail="该语料已打入语料包，无法删除")
        session.delete(item)
        session.commit()
    return {"code": 200, "msg": "删除成功"}

@app.post("/api/admin/corpus/bulk-delete")
def bulk_delete_corpus(req: BulkDeleteRequest):
    deleted = skipped = 0
    with Session(engine) as session:
        packaged_ids = {row[0] for row in session.query(CorpusPackageItem.corpus_text_id)}
        for cid in req.ids:
            if cid in packaged_ids:
                skipped += 1
                continue
            item = session.query(CorpusText).filter_by(id=cid).first()
            if item:
                session.delete(item)
                deleted += 1
        session.commit()
    return {"code": 200, "msg": f"删除 {deleted} 条，跳过已打包 {skipped} 条",
            "deleted": deleted, "skipped": skipped}


@app.post("/api/admin/corpus/batch-replace")
def batch_replace_corpus_text(req: dict):
    """批量替换语料文本"""
    corpus_group_id = req.get("corpus_group_id")
    find_text = req.get("find_text", "")
    replace_text = req.get("replace_text", "")

    if not corpus_group_id or not find_text:
        raise HTTPException(status_code=400, detail="缺少必要参数")

    with Session(engine) as session:
        # 查找匹配的语料
        corpus_items = session.query(CorpusText).filter(
            CorpusText.corpus_group_id == corpus_group_id,
            CorpusText.content.like(f"%{find_text}%")
        ).all()

        count = 0
        for item in corpus_items:
            old_content = item.content
            item.content = item.content.replace(find_text, replace_text)
            count += 1
            print(f"[替换] 语料 {item.id}: '{old_content}' -> '{item.content}'")

        session.commit()

    return {"code": 200, "msg": f"替换完成，共修改 {count} 条语料", "count": count}

@app.post("/api/admin/corpus-groups/{group_id}/clear-unpacked")
def clear_unpacked_corpus(group_id: int):
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        packaged_ids = {
            row[0] for row in
            session.query(CorpusPackageItem.corpus_text_id)
            .join(CorpusPackage, CorpusPackage.id == CorpusPackageItem.package_id)
            .filter(CorpusPackage.corpus_group_id == group_id)
        }
        unpacked = (
            session.query(CorpusText)
            .filter(
                CorpusText.corpus_group_id == group_id,
                CorpusText.id.notin_(packaged_ids),
            )
            .all()
        )
        deleted = len(unpacked)
        for item in unpacked:
            session.delete(item)
        session.commit()
    return {"code": 200, "msg": f"已删除 {deleted} 条未打包语料", "deleted": deleted}


# ── 语料包管理 ────────────────────────────────────────────────────
@app.get("/api/admin/corpus-packages")
def list_packages(corpus_group_id: int, limit: int = 20, offset: int = 0):
    with Session(engine) as session:
        total = session.query(CorpusPackage).filter_by(corpus_group_id=corpus_group_id).count()
        packages = (
            session.query(CorpusPackage)
            .filter_by(corpus_group_id=corpus_group_id)
            .order_by(CorpusPackage.id.desc())
            .offset(offset).limit(limit)
            .all()
        )
        result = []
        for p in packages:
            claimer_name = None
            if p.claimed_by:
                u = session.query(User).filter_by(id=p.claimed_by).first()
                claimer_name = u.username if u else None
            result.append({
                "id": p.id, "name": p.name, "size": p.size,
                "status": p.status,
                "annotation_status": p.annotation_status or "未分配",
                "quality_status": p.quality_status or "未分配",
                "quality_review_status": p.quality_review_status or "未分配",
                "claimed_by_name": claimer_name,
                "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            })
        status_counts = {}
        for st in ["未领取", "已领取", "已完成"]:
            status_counts[st] = session.query(CorpusPackage).filter_by(corpus_group_id=corpus_group_id, status=st).count()
        return {"code": 200, "data": result, "total": total, "status_counts": status_counts}

@app.post("/api/admin/corpus-packages", status_code=201)
def create_package(req: CreatePackageRequest):
    if req.size <= 0:
        raise HTTPException(status_code=400, detail="每包语料数量必须大于 0")
    if req.count <= 0:
        raise HTTPException(status_code=400, detail="创建包数必须大于 0")
    total_needed = req.size * req.count
    with Session(engine) as session:
        if not session.query(CorpusGroup).filter_by(id=req.corpus_group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        packaged_ids = {
            row[0] for row in
            session.query(CorpusPackageItem.corpus_text_id)
            .join(CorpusPackage, CorpusPackage.id == CorpusPackageItem.package_id)
            .filter(CorpusPackage.corpus_group_id == req.corpus_group_id)
        }
        available = (
            session.query(CorpusText)
            .filter(
                CorpusText.corpus_group_id == req.corpus_group_id,
                CorpusText.id.notin_(packaged_ids),
            )
            .order_by(CorpusText.id)
            .limit(total_needed)
            .all()
        )
        if len(available) < total_needed:
            raise HTTPException(
                status_code=400,
                detail=f"可用语料不足，需要 {total_needed} 条，当前仅剩 {len(available)} 条未打包",
            )
        # 查找已存在的包名，找到最大的序号
        max_index = 0
        if req.count > 1:
            # 查找以 "前缀 #" 开头的包
            existing_packages = session.query(CorpusPackage).filter(
                CorpusPackage.corpus_group_id == req.corpus_group_id,
                CorpusPackage.name.like(f"{req.name} #%")
            ).all()
            
            for pkg in existing_packages:
                # 提取序号：从 "前缀 #序号" 中提取序号
                try:
                    parts = pkg.name.split("#")
                    if len(parts) >= 2:
                        index_str = parts[-1].strip()
                        index = int(index_str)
                        if index > max_index:
                            max_index = index
                except (ValueError, IndexError):
                    continue
        
        created_ids = []
        for i in range(req.count):
            if req.count == 1:
                pkg_name = req.name
            else:
                # 从 max_index + 1 开始编号
                pkg_name = f"{req.name} #{max_index + i + 1}"
            chunk = available[i * req.size : (i + 1) * req.size]
            pkg = CorpusPackage(name=pkg_name, size=req.size, corpus_group_id=req.corpus_group_id)
            session.add(pkg)
            session.flush()
            session.add_all([CorpusPackageItem(package_id=pkg.id, corpus_text_id=t.id) for t in chunk])
            created_ids.append(pkg.id)
        session.commit()
        return {
            "code": 201,
            "msg": f"成功创建 {req.count} 个语料包，每包 {req.size} 条，共消耗 {total_needed} 条语料",
            "data": {"ids": created_ids},
        }

@app.delete("/api/admin/corpus-packages/{package_id}")
def delete_package(package_id: int):
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")
        if pkg.status != "未领取":
            raise HTTPException(status_code=400, detail=f"语料包已被领取（{pkg.status}），无法删除")
        session.query(CorpusPackageItem).filter_by(package_id=package_id).delete()
        session.delete(pkg)
        session.commit()
    return {"code": 200, "msg": "删除成功"}


@app.post("/api/admin/corpus-packages/batch-delete")
def batch_delete_packages(req: dict):
    """批量删除语料包"""
    package_ids = req.get("package_ids", [])
    if not package_ids:
        raise HTTPException(status_code=400, detail="请提供要删除的语料包ID列表")
    
    with Session(engine) as session:
        # 检查所有语料包是否存在且未领取
        packages = session.query(CorpusPackage).filter(CorpusPackage.id.in_(package_ids)).all()
        if len(packages) != len(package_ids):
            raise HTTPException(status_code=404, detail="部分语料包不存在")
        
        for pkg in packages:
            if pkg.status != "未领取":
                raise HTTPException(status_code=400, detail=f"语料包'{pkg.name}'已被领取（{pkg.status}），无法删除")
        
        # 删除语料包和关联的语料项
        for package_id in package_ids:
            session.query(CorpusPackageItem).filter_by(package_id=package_id).delete()
            session.query(CorpusPackage).filter_by(id=package_id).delete()
        
        session.commit()
    
    return {"code": 200, "msg": f"成功删除 {len(package_ids)} 个语料包"}


@app.delete("/api/admin/corpus-packages/unclaimed")
def delete_all_unclaimed_packages(corpus_group_id: int):
    """删除所有未领取的语料包"""
    with Session(engine) as session:
        # 检查语料组是否存在
        if not session.query(CorpusGroup).filter_by(id=corpus_group_id).first():
            raise HTTPException(status_code=404, detail="语料组不存在")
        
        # 获取所有未领取的语料包
        unclaimed_packages = session.query(CorpusPackage).filter_by(
            corpus_group_id=corpus_group_id,
            status="未领取"
        ).all()
        
        if not unclaimed_packages:
            return {"code": 200, "msg": "没有未领取的语料包"}
        
        # 删除语料包和关联的语料项
        package_ids = [pkg.id for pkg in unclaimed_packages]
        for package_id in package_ids:
            session.query(CorpusPackageItem).filter_by(package_id=package_id).delete()
            session.query(CorpusPackage).filter_by(id=package_id).delete()
        
        session.commit()
    
    return {"code": 200, "msg": f"成功删除 {len(unclaimed_packages)} 个未领取的语料包"}


@app.post("/api/admin/corpus-packages/rearrange")
def rearrange_package_numbers(corpus_group_id: int):
    """重新排列语料包序号"""
    with Session(engine) as session:
        # 检查语料组是否存在
        corpus_group = session.query(CorpusGroup).filter_by(id=corpus_group_id).first()
        if not corpus_group:
            raise HTTPException(status_code=404, detail="语料组不存在")
        
        # 获取所有语料包（按ID排序）
        packages = session.query(CorpusPackage).filter_by(
            corpus_group_id=corpus_group_id
        ).order_by(CorpusPackage.id).all()
        
        if not packages:
            return {"code": 200, "msg": "没有语料包需要重新排列"}
        
        # 按前缀分组
        prefix_groups = {}
        for pkg in packages:
            # 提取前缀：如果包名包含" #序号"，则提取前面的部分
            if " #" in pkg.name:
                prefix = pkg.name.rsplit(" #", 1)[0]
            else:
                prefix = pkg.name
            
            if prefix not in prefix_groups:
                prefix_groups[prefix] = []
            prefix_groups[prefix].append(pkg)
        
        # 重新命名每个组的包
        renamed_count = 0
        for prefix, pkgs in prefix_groups.items():
            # 只有当组内有多个包或包名包含序号时才重新命名
            if len(pkgs) > 1 or (" #" in pkgs[0].name):
                for i, pkg in enumerate(pkgs):
                    new_name = f"{prefix} #{i + 1}"
                    if pkg.name != new_name:
                        pkg.name = new_name
                        renamed_count += 1
        
        session.commit()
    
    return {"code": 200, "msg": f"成功重新排列 {renamed_count} 个语料包的序号"}


# ── 分组管理 ──────────────────────────────────────────────────────
@app.get("/api/admin/groups")
def list_groups(role_type: str | None = None, limit: int = 50, offset: int = 0):
    with Session(engine) as session:
        q = session.query(Group).order_by(Group.id)
        if role_type:
            q = q.filter(Group.role_type == role_type)
        total = q.count()
        groups = q.offset(offset).limit(limit).all()
        
        if not groups:
            return {"code": 200, "data": [], "total": total}
        
        group_ids = [g.id for g in groups]
        
        # 批量查询所有成员
        all_members = (
            session.query(GroupMember.group_id, User.id, User.username, User.role)
            .join(User, User.id == GroupMember.user_id)
            .filter(GroupMember.group_id.in_(group_ids))
            .all()
        )
        
        # 按组ID分组
        members_by_group = {}
        for gid, uid, username, role in all_members:
            members_by_group.setdefault(gid, []).append({"id": uid, "username": username, "role": role})
        
        result = []
        for g in groups:
            members = members_by_group.get(g.id, [])
            result.append({
                "id": g.id, "name": g.name, "role_type": g.role_type,
                "member_count": len(members),
                "members": members,
            })
        return {"code": 200, "data": result, "total": total}

@app.get("/api/admin/all-groups")
def list_all_groups(limit: int = 500):
    """一次返回所有角色的组，避免前端多次请求"""
    with Session(engine) as session:
        groups = session.query(Group).order_by(Group.role_type, Group.id).limit(limit).all()
        
        if not groups:
            return {"code": 200, "data": []}
        
        group_ids = [g.id for g in groups]
        
        # 批量查询所有成员
        all_members = (
            session.query(GroupMember.group_id, User.id, User.username, User.role)
            .join(User, User.id == GroupMember.user_id)
            .filter(GroupMember.group_id.in_(group_ids))
            .all()
        )
        
        # 按组ID分组
        members_by_group = {}
        for gid, uid, username, role in all_members:
            members_by_group.setdefault(gid, []).append({"id": uid, "username": username, "role": role})
        
        # 按角色分组
        result = {}
        for g in groups:
            if g.role_type not in result:
                result[g.role_type] = []
            members = members_by_group.get(g.id, [])
            result[g.role_type].append({
                "id": g.id, "name": g.name, "role_type": g.role_type,
                "member_count": len(members),
                "members": members,
            })
        return {"code": 200, "data": result}

@app.post("/api/admin/groups", status_code=201)
def create_group(req: CreateGroupRequest):
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="组名不能为空")
    valid_role_types = {"collector", "annotator", "inspector", "reviewer", "quality_reviewer"}
    if req.role_type not in valid_role_types:
        raise HTTPException(status_code=400, detail="role_type 无效，可选: collector, annotator, inspector, reviewer, quality_reviewer")
    with Session(engine) as session:
        if session.query(Group).filter_by(name=req.name.strip()).first():
            raise HTTPException(status_code=409, detail="组名已存在")
        g = Group(name=req.name.strip(), role_type=req.role_type)
        session.add(g)
        session.commit()
        session.refresh(g)
        return {"code": 201, "msg": "分组创建成功", "data": {"id": g.id, "name": g.name, "role_type": g.role_type}}

@app.delete("/api/admin/groups/{group_id}")
def delete_group(group_id: int):
    with Session(engine) as session:
        g = session.query(Group).filter_by(id=group_id).first()
        if not g:
            raise HTTPException(status_code=404, detail="采集组不存在")
        session.query(GroupMember).filter_by(group_id=group_id).delete()
        session.query(CorpusGroupAssignment).filter_by(collector_group_id=group_id).delete()
        session.delete(g)
        session.commit()
    return {"code": 200, "msg": "删除成功"}

@app.post("/api/admin/groups/{group_id}/members")
def add_group_member(group_id: int, req: AddMemberRequest):
    with Session(engine) as session:
        if not session.query(Group).filter_by(id=group_id).first():
            raise HTTPException(status_code=404, detail="采集组不存在")
        if not session.query(User).filter_by(id=req.user_id).first():
            raise HTTPException(status_code=404, detail="用户不存在")
        if session.query(GroupMember).filter_by(group_id=group_id, user_id=req.user_id).first():
            raise HTTPException(status_code=409, detail="该用户已在组内")
        session.add(GroupMember(group_id=group_id, user_id=req.user_id))
        session.commit()
    return {"code": 200, "msg": "成员添加成功"}

@app.delete("/api/admin/groups/{group_id}/members/{user_id}")
def remove_group_member(group_id: int, user_id: int):
    with Session(engine) as session:
        member = session.query(GroupMember).filter_by(group_id=group_id, user_id=user_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="该用户不在组内")
        session.delete(member)
        session.commit()
    return {"code": 200, "msg": "成员移除成功"}


# ── 用户协议管理 ────────────────────────────────────────────────────
class UploadAgreementRequest(BaseModel):
    content: str


@app.post("/api/admin/groups/{group_id}/agreement")
def upload_group_agreement(
    group_id: int,
    user_id: int,
    req: UploadAgreementRequest,
):
    """管理员为分组上传协议文本"""
    try:
        with Session(engine) as session:
            user = session.query(User).filter_by(id=user_id).first()
            if not user or user.role != 'manager':
                raise HTTPException(status_code=403, detail="无权限")

            if not session.query(Group).filter_by(id=group_id).first():
                raise HTTPException(status_code=404, detail="分组不存在")

            # 直接添加新协议（不删除旧协议，保留历史签署记录）
            agreement = AgreementDocument(
                group_id=group_id,
                content=req.content.strip(),
                updated_by=user_id
            )
            session.add(agreement)
            session.commit()

            return {
                "code": 200,
                "data": {
                    "id": agreement.id,
                    "created_at": agreement.created_at.isoformat()
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[协议保存错误] {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@app.get("/api/admin/groups/{group_id}/agreement")
def get_group_agreement(group_id: int, user_id: int):
    """获取分组协议（如果分组没有协议，则使用系统默认协议）"""
    try:
        with Session(engine) as session:
            user = session.query(User).filter_by(id=user_id).first()
            if not user or user.role != 'manager':
                raise HTTPException(status_code=403, detail="无权限")

            # 先获取分组的协议
            agreement = session.query(AgreementDocument).filter_by(group_id=group_id).order_by(
                AgreementDocument.created_at.desc()
            ).first()

            # 如果分组没有协议，则使用系统默认协议
            if not agreement:
                system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
                if not system_agreement or not system_agreement.value:
                    raise HTTPException(status_code=404, detail="该分组未配置协议，且系统也未配置默认协议")
                
                return {
                    "code": 200,
                    "data": {
                        "id": None,
                        "content": system_agreement.value,
                        "created_at": None,
                        "is_system_default": True
                    }
                }

            return {
                "code": 200,
                "data": {
                    "id": agreement.id,
                    "content": agreement.content,
                    "created_at": agreement.created_at.isoformat(),
                    "is_system_default": False
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/collector/agreement-sign")
async def submit_agreement_signature(
    user_id: int,
    agreement_id: int = -1,
    file: UploadFile = File(...),
):
    """采集员提交协议签名（统一使用系统协议）"""
    try:
        content = await file.read()
        filename = f"signature_{user_id}_sys_{uuid.uuid4().hex[:8]}.png"

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: storage_client.put_object("signatures", filename, content, "image/png"))

        with Session(engine) as session:
            # 检查系统协议是否存在
            system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
            if not system_agreement or not system_agreement.value:
                raise HTTPException(status_code=400, detail="系统协议不存在，请联系管理员配置")

            # 删除旧签名（如果存在）
            existing = session.query(AgreementSignature).filter_by(
                user_id=user_id,
                agreement_id=-1
            ).first()
            if existing:
                session.delete(existing)

            signature = AgreementSignature(
                user_id=user_id,
                agreement_id=-1,
                signature_path=filename
            )

            session.add(signature)
            from sqlalchemy import text
            try:
                session.execute(text("SET FOREIGN_KEY_CHECKS=0"))
            except Exception:
                pass
            session.commit()
            try:
                session.execute(text("SET FOREIGN_KEY_CHECKS=1"))
            except Exception:
                pass

        return {"code": 200}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── 管理员：签名查看与导出 ────────────────────────────────────
@app.get("/api/admin/agreement-signatures")
def list_agreement_signatures(
    user_id: int = Query(..., description="管理员ID"),
    group_id: int | None = Query(None, description="按采集员分组筛选"),
):
    """获取所有签名记录"""
    with Session(engine) as session:
        admin = session.query(User).filter_by(id=user_id).first()
        if not admin or admin.role not in ('manager', 'sub_manager'):
            raise HTTPException(status_code=403, detail="无权限")

        # 统一使用系统设置中的用户协议
        system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
        agreement_text = system_agreement.value if system_agreement and system_agreement.value else "暂无用户协议"

        q = session.query(AgreementSignature)
        if group_id:
            user_ids_in_group = [
                row[0] for row in
                session.query(GroupMember.user_id).filter_by(group_id=group_id).all()
            ]
            q = q.filter(AgreementSignature.user_id.in_(user_ids_in_group))

        signatures = q.order_by(AgreementSignature.signed_at.desc()).all()

        result = []
        for sig in signatures:
            user = session.query(User).filter_by(id=sig.user_id).first()
            
            # 查询此人所有的分组
            user_groups = (
                session.query(Group)
                .join(GroupMember, GroupMember.group_id == Group.id)
                .filter(GroupMember.user_id == sig.user_id)
                .all()
            )
            group_names = ", ".join([g.name for g in user_groups]) if user_groups else "系统协议/无分组"
            group_ids_list = [g.id for g in user_groups]

            result.append({
                "id": sig.id,
                "user_id": sig.user_id,
                "username": user.username if user else "",
                "real_name": user.real_name if user else "",
                "agreement_id": sig.agreement_id,
                "agreement_content": agreement_text,
                "group_id": group_ids_list[0] if group_ids_list else None,
                "group_name": group_names,
                "signature_path": sig.signature_path or "",
                "file_exists": bool(sig.signature_path),
                "signed_at": sig.signed_at.strftime("%Y-%m-%d %H:%M:%S") if sig.signed_at else "",
            })

        return {"code": 200, "data": result, "total": len(result)}


def _generate_signature_pdf_bytes(sig, user, signature_bytes, agreement_text):
    """生成单条签名的 PDF 字节流（供单条导出和批量导出共用）"""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.lib.utils import ImageReader
    import io as _io

    font_path = os.path.join(BASE_DIR, "fonts", "simhei.ttf")
    fallback = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
    try:
        if os.path.exists(font_path):
            pdfmetrics.registerFont(TTFont('SimHei', font_path))
        elif os.path.exists(fallback):
            pdfmetrics.registerFont(TTFont('SimHei', fallback))
    except Exception:
        pass

    buf = _io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    y = h - 40 * mm
    c.setFont('SimHei', 18)
    c.drawCentredString(w / 2, y, "协议签署确认书")
    y -= 15 * mm

    c.setFont('SimHei', 11)
    signer_name = user.real_name or user.username if user else "未知"
    c.drawString(25 * mm, y, f"签署人：{signer_name}")
    y -= 8 * mm
    c.drawString(25 * mm, y, f"签署时间：{sig.signed_at.strftime('%Y-%m-%d %H:%M:%S') if sig.signed_at else '未知'}")
    y -= 15 * mm

    c.setFont('SimHei', 12)
    c.drawString(25 * mm, y, "协议内容：")
    y -= 8 * mm

    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle

    style = ParagraphStyle(
        'Chinese',
        fontName='SimHei',
        fontSize=10,
        leading=14,
        wordWrap='CJK',
    )

    available_width = w - 50 * mm
    agreement_html = agreement_text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
    para = Paragraph(agreement_html, style)
    _, para_height = para.wrap(available_width, h)

    # 分页绘制：如果段落超出当前页，用 split 拆分
    remaining_para = para
    remaining_height = para_height
    while remaining_para:
        page_available = y - 60 * mm  # 当前页可用高度
        if remaining_height <= page_available:
            # 能放下，直接绘制
            remaining_para.drawOn(c, 25 * mm, y - remaining_height)
            y -= remaining_height + 5 * mm
            break
        else:
            # 放不下，拆分
            parts = remaining_para.split(available_width, page_available)
            if len(parts) >= 2:
                # 绘制第一部分
                first = parts[0]
                _, first_h = first.wrap(available_width, h)
                first.drawOn(c, 25 * mm, y - first_h)
                # 换页继续
                c.showPage()
                y = h - 25 * mm
                remaining_para = parts[1]
                _, remaining_height = remaining_para.wrap(available_width, h)
            else:
                # split 无法拆分（极长单词等），强制换页
                c.showPage()
                y = h - 25 * mm
                remaining_height = remaining_para.wrap(available_width, h)[1]
                if remaining_height <= y - 60 * mm:
                    remaining_para.drawOn(c, 25 * mm, y - remaining_height)
                    y -= remaining_height + 5 * mm
                    break

    y -= 10 * mm
    if y < 80 * mm:
        c.showPage()
        y = h - 25 * mm

    if signature_bytes:
        c.setFont('SimHei', 12)
        c.drawString(25 * mm, y, "签名：")
        y -= 5 * mm
        try:
            img = ImageReader(_io.BytesIO(signature_bytes))
            c.drawImage(img, 25 * mm, y - 30 * mm, width=60 * mm, height=30 * mm, preserveAspectRatio=True, mask='auto')
        except Exception:
            c.drawString(25 * mm, y, "[签名图片加载失败]")

    c.save()
    buf.seek(0)
    return buf.getvalue()


@app.get("/api/admin/agreement-signatures/{sig_id}/pdf")
def export_signature_pdf(sig_id: int, user_id: int = Query(..., description="管理员ID")):
    """导出单条签名为PDF"""
    import io as _io
    with Session(engine) as session:
        admin = session.query(User).filter_by(id=user_id).first()
        if not admin or admin.role not in ('manager', 'sub_manager'):
            raise HTTPException(status_code=403, detail="无权限")

        sig = session.query(AgreementSignature).filter_by(id=sig_id).first()
        if not sig:
            raise HTTPException(status_code=404, detail="签名记录不存在")

        user = session.query(User).filter_by(id=sig.user_id).first()

        # 统一使用系统设置中的用户协议
        system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
        agreement_text = system_agreement.value if system_agreement and system_agreement.value else "暂无用户协议"

        try:
            signature_bytes = storage_client.get_object("signatures", sig.signature_path)
            if not signature_bytes:
                raise ValueError("Signature file is empty")
        except Exception:
            try:
                signature_bytes = storage_client.get_object(BUCKET_NAME, sig.signature_path)
                if not signature_bytes:
                    raise ValueError("Signature file is empty")
            except Exception:
                signature_bytes = None

        if not signature_bytes:
            username = user.username if user else str(sig.user_id)
            real_name = user.real_name if user else "未知姓名"
            raise HTTPException(
                status_code=400,
                detail=f"无法导出：账号【{username}】(姓名: {real_name}) 的签名图片文件在云存储(OSS)中不存在，请通知其重新签署协议。"
            )

        try:
            pdf_bytes = _generate_signature_pdf_bytes(sig, user, signature_bytes, agreement_text)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF生成失败: {str(e)}")

        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            _io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=signature_{sig_id}.pdf"}
        )


@app.post("/api/admin/agreement-signatures/batch-export")
def batch_export_signatures(req: dict):
    """批量导出签名为ZIP（含多个PDF）"""
    import io as _io
    user_id = req.get("user_id")
    group_ids = req.get("group_ids", [])  # 空列表=全部

    with Session(engine) as session:
        admin = session.query(User).filter_by(id=user_id).first()
        if not admin or admin.role not in ('manager', 'sub_manager'):
            raise HTTPException(status_code=403, detail="无权限")

        q = session.query(AgreementSignature)
        if group_ids:
            user_ids_in_groups = [
                row[0] for row in
                session.query(GroupMember.user_id).filter(GroupMember.group_id.in_(group_ids)).all()
            ]
            q = q.filter(AgreementSignature.user_id.in_(user_ids_in_groups))

        signatures = q.order_by(AgreementSignature.signed_at.desc()).all()

        if not signatures:
            raise HTTPException(status_code=404, detail="没有找到签名记录")

        # 预批量查询
        user_ids = list(set(s.user_id for s in signatures))
        users_map = {u.id: u for u in session.query(User).filter(User.id.in_(user_ids)).all()}

        # 统一使用系统设置中的用户协议
        system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
        agreement_text = system_agreement.value if system_agreement and system_agreement.value else "暂无用户协议"

        # 预获取签名图片并记录失败详情
        sig_bytes_map = {}
        failed_accounts = []
        for sig in signatures:
            user = users_map.get(sig.user_id)
            username = user.username if user else f"User_{sig.user_id}"
            real_name = user.real_name if user else "未知姓名"
            try:
                sig_bytes = storage_client.get_object("signatures", sig.signature_path)
                if not sig_bytes:
                    raise ValueError("Signature file is empty")
                sig_bytes_map[sig.id] = sig_bytes
            except Exception:
                try:
                    sig_bytes = storage_client.get_object(BUCKET_NAME, sig.signature_path)
                    if not sig_bytes:
                        raise ValueError("Signature file is empty")
                    sig_bytes_map[sig.id] = sig_bytes
                except Exception:
                    sig_bytes_map[sig.id] = None
                    failed_accounts.append(
                        f"账号: {username}, 姓名: {real_name}, 签名时间: {sig.signed_at.strftime('%Y-%m-%d %H:%M:%S') if sig.signed_at else '未知'}, 签名文件路径: {sig.signature_path}"
                    )

        # 生成 ZIP
        zip_buf = _io.BytesIO()
        with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for sig in signatures:
                user = users_map.get(sig.user_id)
                sig_bytes = sig_bytes_map.get(sig.id)
                signer_name = (user.real_name or user.username) if user else str(sig.user_id)
                filename = f"{signer_name}_{sig.id}.pdf"

                if not sig_bytes:
                    zf.writestr(filename.replace('.pdf', '.error.txt'), f"导出失败：该用户的签名文件在云存储(OSS)中不存在，请通知该用户删除旧签名并重签。")
                    continue

                try:
                    pdf_bytes = _generate_signature_pdf_bytes(sig, user, sig_bytes, agreement_text)
                    zf.writestr(filename, pdf_bytes)
                except Exception as e:
                    zf.writestr(filename.replace('.pdf', '.error.txt'), f"PDF生成失败: {str(e)}")

            if failed_accounts:
                report_content = "【签名文件缺失报告】\n"
                report_content += "以下采集员的协议签名图片在云存储中不存在，导致未能正常生成协议 PDF。\n"
                report_content += "建议解决方案：联系对应采集员登录系统，进入个人信息页面删除签名并重新签署。\n\n"
                report_content += "\n".join(failed_accounts)
                zf.writestr("failed_signatures_report.txt", report_content.encode('utf-8'))

        zip_buf.seek(0)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            zip_buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=signatures_batch_{timestamp}.zip"}
        )


# ── 个人信息审查 ──────────────────────────────────────────────
@app.get("/api/admin/collector-groups-info")
def list_collector_groups_info():
    """获取采集组列表（含成员个人信息状态）"""
    with Session(engine) as session:
        groups = session.query(Group).filter(Group.role_type == "collector").order_by(Group.id).all()
        result = []
        for g in groups:
            members = (
                session.query(User)
                .join(GroupMember, GroupMember.user_id == User.id)
                .filter(GroupMember.group_id == g.id)
                .all()
            )
            member_list = []
            for u in members:
                member_list.append({
                    "id": u.id,
                    "username": u.username,
                    "real_name": u.real_name or "",
                    "gender": u.gender or "",
                    "age": u.age,
                    "hometown": u.hometown or "",
                    "city": u.city or "",
                    "info_rejected": u.info_rejected or 0,
                    "has_info": bool(u.real_name and u.gender and u.age and u.hometown),
                })
            result.append({
                "id": g.id,
                "name": g.name,
                "member_count": len(members),
                "members": member_list,
            })
        return {"code": 200, "data": result}


@app.get("/api/admin/collectors-info")
def list_collectors_info():
    """获取所有采集员信息（扁平列表，按是否提交过包排序）"""
    with Session(engine) as session:
        # 查询所有采集员
        collectors = session.query(User).filter(User.role == "collector").order_by(User.id).all()
        if not collectors:
            return {"code": 200, "data": []}

        collector_ids = [u.id for u in collectors]

        # 批量查询分组信息
        memberships = (
            session.query(GroupMember.user_id, Group.name)
            .join(Group, Group.id == GroupMember.group_id)
            .filter(GroupMember.user_id.in_(collector_ids))
            .all()
        )
        group_map: dict[int, list[str]] = {}
        for uid, gname in memberships:
            group_map.setdefault(uid, []).append(gname)

        # 批量查询提交过的包数（status=已完成 或 已提交）
        submitted_rows = (
            session.query(
                CorpusPackage.claimed_by,
                func.count(CorpusPackage.id).label('cnt')
            )
            .filter(
                CorpusPackage.claimed_by.in_(collector_ids),
                CorpusPackage.status.in_(["已完成", "已提交"])
            )
            .group_by(CorpusPackage.claimed_by)
            .all()
        )
        submitted_map = {uid: cnt for uid, cnt in submitted_rows}

        result = []
        for u in collectors:
            has_submitted = u.id in submitted_map
            result.append({
                "id": u.id,
                "username": u.username,
                "real_name": u.real_name or "",
                "gender": u.gender or "",
                "age": u.age,
                "hometown": u.hometown or "",
                "city": u.city or "",
                "info_rejected": u.info_rejected or 0,
                "has_info": bool(u.real_name and u.gender and u.age and u.hometown),
                "group_names": group_map.get(u.id, []),
                "has_submitted": has_submitted,
                "submitted_count": submitted_map.get(u.id, 0),
            })

        # 排序：已提交的在前，未提交的在后
        result.sort(key=lambda x: (not x["has_submitted"], x["id"]))

        return {"code": 200, "data": result}


@app.get("/api/admin/corpus-group-collectors/{corpus_group_id}")
def get_corpus_group_collectors(corpus_group_id: int):
    """获取指定语料组的所有采集员（用于筛选）"""
    with Session(engine) as session:
        # 获取语料组分配的采集组
        assignments = session.query(CorpusGroupAssignment).filter_by(corpus_group_id=corpus_group_id).all()
        collector_group_ids = [a.collector_group_id for a in assignments]
        
        if not collector_group_ids:
            return {"code": 200, "data": []}
        
        # 获取这些采集组的所有成员
        users = (
            session.query(User)
            .join(GroupMember, GroupMember.user_id == User.id)
            .filter(GroupMember.group_id.in_(collector_group_ids), User.role == 'collector')
            .order_by(User.username)
            .all()
        )
        
        result = [{"id": u.id, "username": u.username} for u in users]
        return {"code": 200, "data": result}


@app.post("/api/admin/users/{user_id}/reject-info")
def reject_user_info(user_id: int, req: dict = None):
    """驳回采集员个人信息"""
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        user.info_rejected = 1
        session.commit()
    return {"code": 200, "msg": f"已驳回 {user.username} 的个人信息，该用户无法继续作业"}


@app.post("/api/admin/users/{user_id}/approve-info")
def approve_user_info(user_id: int, req: dict = None):
    """通过采集员个人信息"""
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        user.info_rejected = 0
        session.commit()
    return {"code": 200, "msg": f"已通过 {user.username} 的个人信息"}


# ── 标注员工作区 ────────────────────────────────────────────────
@app.get("/api/annotator/available-packages")
def annotator_available_packages(user_id: int):
    """获取待标注包列表"""
    with Session(engine) as session:
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=user_id)
        ]
        if not group_ids:
            return {"code": 200, "data": []}

        corpus_group_ids = [
            row[0] for row in
            session.query(CorpusAnnotationAssignment.corpus_group_id)
            .filter(CorpusAnnotationAssignment.annotator_group_id.in_(group_ids))
        ]
        if not corpus_group_ids:
            return {"code": 200, "data": []}

        CollectorAlias = aliased(User)
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'), CollectorAlias.username.label('collector_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .outerjoin(CollectorAlias, CollectorAlias.id == CorpusPackage.claimed_by)
            .filter(
                CorpusPackage.corpus_group_id.in_(corpus_group_ids),
                CorpusPackage.annotation_status == "待标注",
                CorpusPackage.annotation_claimed_by == None,
            )
            .order_by(CorpusPackage.id)
            .all()
        )
        result = []
        for row in rows:
            p = row.CorpusPackage
            result.append({
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "annotation_status": p.annotation_status,
                "corpus_group_name": row.cg_name or "",
                "collector_name": row.collector_name or "",
                "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            })
        return {"code": 200, "data": result}


@app.post("/api/annotator/packages/{package_id}/claim")
@limiter.limit("20/minute")
def annotator_claim_package(request: Request, package_id: int, req: ClaimPackageRequest):
    """标注员领取标注任务"""
    with Session(engine) as session:
        # 用 FOR UPDATE 锁定这一行，防止并发争用
        pkg = session.query(CorpusPackage).filter_by(id=package_id).with_for_update().first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")

        # 检查权限
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=req.user_id)
        ]
        accessible_cg_ids = (
            [
                row[0] for row in
                session.query(CorpusAnnotationAssignment.corpus_group_id)
                .filter(CorpusAnnotationAssignment.annotator_group_id.in_(group_ids))
            ]
            if group_ids else []
        )
        if pkg.corpus_group_id not in accessible_cg_ids:
            raise HTTPException(status_code=403, detail="您无权领取该语料包")

        # 检查状态（必须是"待标注"且未被领取）
        if pkg.annotation_status != "待标注":
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取或不可领取")
        if pkg.annotation_claimed_by is not None:
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取")

        # 原子性更新
        pkg.annotation_claimed_by = req.user_id
        pkg.annotation_claimed_at = datetime.utcnow()
        session.commit()

    return {"code": 200, "msg": "领取成功"}


@app.get("/api/annotator/my-packages")
def annotator_my_packages(user_id: int):
    """标注员的标注包列表"""
    with Session(engine) as session:
        CollectorAlias = aliased(User)
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'), CollectorAlias.username.label('collector_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .outerjoin(CollectorAlias, CollectorAlias.id == CorpusPackage.claimed_by)
            .filter(CorpusPackage.annotation_claimed_by == user_id)
            .order_by(CorpusPackage.id.desc())
            .all()
        )
        result = []
        for row in rows:
            p = row.CorpusPackage
            result.append({
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "annotation_status": p.annotation_status,
                "quality_status": p.quality_status,
                "corpus_group_name": row.cg_name or "",
                "collector_name": row.collector_name or "",
                "claimed_at": p.annotation_claimed_at.strftime("%Y-%m-%d %H:%M") if p.annotation_claimed_at else "",
            })
        return {"code": 200, "data": result}


@app.get("/api/annotator/package-corpus")
def annotator_get_package_corpus(package_id: int, user_id: int):
    """获取包内的所有语料（包括原始录音和采集员信息）"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg or pkg.annotation_claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权访问该语料包")

        # 获取包内的所有语料（只取最新的录音）
        # 使用子查询获取每个语料的最新录音ID
        latest_recording_subquery = (
            session.query(
                VoiceRecording.corpus_text_id,
                func.max(VoiceRecording.id).label('max_id')
            )
            .filter(VoiceRecording.package_id == package_id)
            .group_by(VoiceRecording.corpus_text_id)
            .subquery()
        )
        
        # 获取语料列表
        corpus_items = (
            session.query(CorpusText)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .order_by(CorpusText.id)
            .all()
        )

        result = []
        for corpus in corpus_items:
            # 查询该语料的最新录音
            recording = (
                session.query(VoiceRecording)
                .join(latest_recording_subquery, 
                      (VoiceRecording.corpus_text_id == latest_recording_subquery.c.corpus_text_id) &
                      (VoiceRecording.id == latest_recording_subquery.c.max_id))
                .filter(VoiceRecording.corpus_text_id == corpus.id)
                .first()
            )
            
            result.append({
                "id": corpus.id,
                "text_id": corpus.text_id,
                "content": corpus.content,
                "recording_id": recording.id if recording else None,
                "recording_file": recording.file_path if recording else None,
                "recorded_at": recording.recorded_at.strftime("%Y-%m-%d %H:%M") if recording else None,
                # 标注相关字段
                "annotated_text": recording.annotated_text if recording else None,
                "is_valid": recording.is_valid if recording else None,
                "annotation_note": recording.annotation_note if recording else None,
                # 质检打回标记
                "quality_note": recording.quality_note if recording else None,
                # 质检审核字段（标注员看到被打回的标记）
                "quality_review_action": recording.quality_review_action if recording else None,
                "quality_review_note": recording.quality_review_note if recording else None,
            })

        return {
            "code": 200,
            "data": result,
            "total": len(result),
            "package_status": pkg.annotation_status,
            "package_reject_reason": pkg.quality_review_comment if pkg.quality_status == "已打回" else None,
            "collector_real_name": pkg.collector_real_name,
            "collector_gender": pkg.collector_gender,
            "collector_age": pkg.collector_age,
            "collector_hometown": pkg.collector_hometown,
        }


@app.post("/api/annotator/submit-annotation")
@limiter.limit("800/minute")
def annotator_submit_annotation(
    request: Request,
    package_id: int,
    corpus_text_id: int,
    user_id: int,
    annotated_text: str = "",
    is_valid: int = 1,
    annotation_note: str = "",
):
    """标注员提交标注结果"""
    try:
        with Session(engine) as session:
            pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
            if not pkg or pkg.annotation_claimed_by != user_id:
                raise HTTPException(status_code=403, detail="无权访问该语料包")

            corpus = session.query(CorpusText).filter_by(id=corpus_text_id).first()
            if not corpus:
                raise HTTPException(status_code=404, detail="语料不存在")

            recording = session.query(VoiceRecording).filter_by(
                package_id=package_id,
                corpus_text_id=corpus_text_id,
            ).first()

            if not recording:
                # 无录音记录：生成2秒静默WAV上传到OSS
                silent_wav = create_silent_wav(2)
                filename = f"voice_silent_{user_id}_{package_id}_{corpus_text_id}_{uuid.uuid4().hex[:8]}.wav"
                storage_client.put_object(BUCKET_NAME, filename, silent_wav, "audio/wav")
                recording = VoiceRecording(
                    package_id=package_id,
                    corpus_text_id=corpus_text_id,
                    collector_id=pkg.claimed_by,
                    file_path=filename,
                    status="已提交",
                    submitted_at=datetime.utcnow(),
                    duration_seconds=2,
                    is_valid=is_valid,
                )
                session.add(recording)
                session.flush()

            recording.annotated_text = annotated_text.strip()
            recording.is_valid = is_valid
            recording.annotation_note = annotation_note.strip() if annotation_note else ""
            recording.annotated_by = user_id
            recording.annotated_at = datetime.utcnow()

            # 如果该语料之前被打回过，清除质检标记让质检员能重新质检
            if recording.quality_note is not None:
                recording.quality_note = None
                recording.inspected_by = None
                recording.inspected_at = None
            
            # 清除质检审核标记（如果存在）
            try:
                if hasattr(recording, 'quality_review_action'):
                    recording.quality_review_action = None
                    recording.quality_review_note = None
            except Exception:
                pass

            session.commit()

            # 不再自动转换包状态，由标注员手动整包提交

            next_corpus = (
                session.query(CorpusText)
                .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
                .filter(CorpusPackageItem.package_id == package_id)
                .filter(CorpusText.id > corpus_text_id)
                .order_by(CorpusText.id)
                .first()
            )

            result = {
                "code": 200,
                "msg": "标注成功",
                "user_id": user_id,
                "package_id": package_id,
                "corpus_id": corpus_text_id,
                "annotated_at": datetime.utcnow().isoformat(),
            }

            if next_corpus:
                result["next"] = {
                    "id": next_corpus.id,
                    "text_id": next_corpus.text_id,
                    "content": next_corpus.content,
                }
            else:
                result["next"] = None

            return result

    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        print(f"[错误] 标注失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"标注失败: {str(e)}")


@app.post("/api/annotator/submit-package")
@limiter.limit("30/minute")
def annotator_submit_package(
    request: Request,
    package_id: int,
    user_id: int,
):
    """标注员整包提交：检查所有语料都已标注后，将包推送到任务大厅"""
    try:
        with Session(engine) as session:
            pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
            if not pkg:
                raise HTTPException(status_code=404, detail="语料包不存在")
            if pkg.annotation_claimed_by != user_id:
                raise HTTPException(status_code=403, detail=f"无权访问该语料包（当前标注员: {pkg.annotation_claimed_by}，请求用户: {user_id}）")

            # 检查所有语料是否都已标注
            total_corpus = session.query(CorpusPackageItem).filter_by(package_id=package_id).count()
            annotated_text_ids = set(
                row[0] for row in
                session.query(VoiceRecording.corpus_text_id).filter(
                    VoiceRecording.package_id == package_id,
                    VoiceRecording.annotated_by.isnot(None),
                )
            )
            annotated_corpus = len(annotated_text_ids)

            if annotated_corpus < total_corpus:
                # 找出未标注的语料
                all_corpus_ids = set(
                    row[0] for row in
                    session.query(CorpusPackageItem.corpus_text_id).filter_by(package_id=package_id).all()
                )
                incomplete_ids = all_corpus_ids - annotated_text_ids
                incomplete_items = session.query(CorpusText).filter(CorpusText.id.in_(incomplete_ids)).all()
                incomplete_list = [f"{c.text_id}: {c.content[:30]}" for c in incomplete_items]
                raise HTTPException(
                    status_code=400,
                    detail=f"还有 {total_corpus - annotated_corpus} 条语料未标注: {', '.join(incomplete_list[:5])}"
                )

            # 清除所有条目的质检审核标记（为质检员重置）
            try:
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id == package_id
                ).update({
                    "quality_review_action": None,
                    "quality_review_note": None,
                }, synchronize_session=False)
            except Exception as e:
                # 如果字段不存在，忽略错误
                print(f"[警告] 清除质检审核标记失败（可能字段不存在）: {e}")

            # 更新包状态
            pkg.annotation_status = "已标注"
            is_reject_resubmit = pkg.quality_status == "已打回"
            pkg.quality_status = "待质检"
            if is_reject_resubmit:
                # 返修包：保留原质检员，包直接回到原质检员的"我的包"
                print(f"[返修] 包 {package_id} 返修提交，保留原质检员 {pkg.quality_claimed_by}")
            else:
                # 首次提交：进入任务大厅
                pkg.quality_claimed_by = None
                pkg.quality_claimed_at = None
            session.commit()

            return {
                "code": 200,
                "msg": "返修提交成功，已退回原质检员" if is_reject_resubmit else "整包提交成功，已推送到任务大厅",
                "package_id": package_id,
            }

    except HTTPException as e:
        raise e
    except Exception as e:
        import traceback
        print(f"[错误] 整包提交失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"整包提交失败: {str(e)}")


@app.get("/api/annotator/download-recording/{recording_id}")
async def annotator_download_recording(recording_id: int, user_id: int):
    """标注员获取录音文件用于标注（返回MinIO下载URL）"""
    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="录音不存在")

        # 验证标注员有权访问这个包
        pkg = session.query(CorpusPackage).filter_by(id=recording.package_id).first()
        if not pkg or pkg.annotation_claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权访问该录音")

        try:
            if not recording.file_path:
                raise HTTPException(status_code=404, detail="该语料无录音文件")

            # 检查文件是否存在并生成预签名URL
            loop = asyncio.get_event_loop()
            stat = await loop.run_in_executor(None, lambda: storage_client.stat_object(BUCKET_NAME, recording.file_path))
            if not stat:
                raise HTTPException(status_code=404, detail=f"录音文件不存在: {recording.file_path}")

            url = await loop.run_in_executor(None, lambda: storage_client.presigned_get_object(
                BUCKET_NAME, recording.file_path, expires=3600
            ))
            if not url:
                raise HTTPException(status_code=500, detail="生成预签名URL失败")
            return {"code": 200, "data": {"url": url, "filename": recording.file_path}}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"获取下载链接失败: {str(e)}")


@app.get("/api/inspector/download-recording/{recording_id}")
@limiter.limit("800/minute")
async def inspector_download_recording(request: Request, recording_id: int, user_id: int):
    """质检员获取录音文件用于质检（返回MinIO下载URL）"""
    # 先检查缓存
    cache_key = f"presigned_url:inspector:{recording_id}"
    cached_url = cache_get(cache_key)
    if cached_url:
        return {"code": 200, "data": {"url": cached_url, "filename": ""}}

    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="录音不存在")

        # 验证质检员有权访问这个包
        pkg = session.query(CorpusPackage).filter_by(id=recording.package_id).first()
        if not pkg or pkg.quality_claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权访问该录音")

        try:
            if not recording.file_path:
                raise HTTPException(status_code=404, detail="该语料无录音文件")

            # 检查文件是否存在并生成预签名URL
            loop = asyncio.get_event_loop()
            stat = await loop.run_in_executor(None, lambda: storage_client.stat_object(BUCKET_NAME, recording.file_path))
            if not stat:
                raise HTTPException(status_code=404, detail=f"录音文件不存在: {recording.file_path}")

            url = await loop.run_in_executor(None, lambda: storage_client.presigned_get_object(
                BUCKET_NAME, recording.file_path, expires=3600
            ))
            if not url:
                raise HTTPException(status_code=500, detail="生成预签名URL失败")
            # 缓存预签名URL 30分钟（URL有效期3600秒，留30分钟余量）
            cache_set(cache_key, url, ttl=1800)
            return {"code": 200, "data": {"url": url, "filename": recording.file_path}}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"获取下载链接失败: {str(e)}")


@app.get("/api/annotator/statistics")
def get_annotator_statistics_real(user_id: int):
    """获取标注员个人统计信息"""
    try:
        with Session(engine) as session:
            user = session.query(User).filter_by(id=user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            # 只统计待标注的包数
            packages = session.query(CorpusPackage).filter_by(
                annotation_claimed_by=user_id,
                annotation_status="待标注"
            ).count()

            # 统计已完成标注的包数
            completed_packages = session.query(CorpusPackage).filter_by(
                annotation_claimed_by=user_id,
                annotation_status="已标注"
            ).count()
            
            # 只统计有文件、有文本、有效的录音
            corpus_count = session.query(VoiceRecording).filter(
                VoiceRecording.annotated_by == user_id,
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            ).count()

            duration = session.query(
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0)
            ).filter(
                VoiceRecording.annotated_by == user_id,
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            ).scalar() or 0

            # 质检审核通过的包数和时长（质检审核员审核通过且是有效录音）
            approved_packages = session.query(CorpusPackage).filter(
                CorpusPackage.annotation_claimed_by == user_id,
                CorpusPackage.quality_review_status == "已合格"
            ).count()
            approved_duration = session.query(
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0)
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).filter(
                VoiceRecording.annotated_by == user_id,
                CorpusPackage.quality_review_status == "已合格",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            ).scalar() or 0

            # 无效条数（包含被判定为无效、空录音或无文本录音）
            invalid_count = session.query(
                func.count(VoiceRecording.id)
            ).filter(
                VoiceRecording.annotated_by == user_id
            ).filter(
                or_(
                    VoiceRecording.is_valid == 0,
                    VoiceRecording.file_path.is_(None),
                    VoiceRecording.file_path == "",
                    VoiceRecording.annotated_text.is_(None),
                    VoiceRecording.annotated_text == ""
                )
            ).scalar() or 0

            return {
                "code": 200,
                "data": {
                    "packages": packages,
                    "completed_packages": completed_packages,
                    "corpus_count": corpus_count,
                    "total_duration_seconds": int(duration),
                    "approved_packages": approved_packages,
                    "approved_duration_seconds": int(approved_duration),
                    "invalid_count": int(invalid_count),
                    "valid_count": corpus_count
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[错误] 标注员统计失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── 质��员工作区 ────────────────────────────────────────────────
@app.get("/api/inspector/available-packages")
def inspector_available_packages(user_id: int):
    """获取待质检包列表"""
    with Session(engine) as session:
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=user_id)
        ]
        if not group_ids:
            return {"code": 200, "data": []}

        corpus_group_ids = [
            row[0] for row in
            session.query(CorpusInspectionAssignment.corpus_group_id)
            .filter(CorpusInspectionAssignment.inspector_group_id.in_(group_ids))
        ]
        if not corpus_group_ids:
            return {"code": 200, "data": []}

        AnnotatorAlias = aliased(User)
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'), AnnotatorAlias.username.label('annotator_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .outerjoin(AnnotatorAlias, AnnotatorAlias.id == CorpusPackage.annotation_claimed_by)
            .filter(
                CorpusPackage.corpus_group_id.in_(corpus_group_ids),
                CorpusPackage.quality_status == "待质检",
                CorpusPackage.quality_claimed_by == None,
            )
            .order_by(CorpusPackage.id)
            .all()
        )
        result = []
        for row in rows:
            p = row.CorpusPackage
            result.append({
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "quality_status": p.quality_status,
                "corpus_group_name": row.cg_name or "",
                "annotator_name": row.annotator_name or "",
                "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            })
        return {"code": 200, "data": result}


@app.post("/api/inspector/packages/{package_id}/claim")
@limiter.limit("20/minute")
def inspector_claim_package(request: Request, package_id: int, req: ClaimPackageRequest):
    """质检员领取质检任务"""
    with Session(engine) as session:
        # 用 FOR UPDATE 锁定这一行，防止并发争用
        pkg = session.query(CorpusPackage).filter_by(id=package_id).with_for_update().first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")

        # 检查权限
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=req.user_id)
        ]
        accessible_cg_ids = (
            [
                row[0] for row in
                session.query(CorpusInspectionAssignment.corpus_group_id)
                .filter(CorpusInspectionAssignment.inspector_group_id.in_(group_ids))
            ]
            if group_ids else []
        )
        if pkg.corpus_group_id not in accessible_cg_ids:
            raise HTTPException(status_code=403, detail="您无权领取该语料包")

        # 检查状态（必须是"待质检"且未被领取）
        if pkg.quality_status != "待质检":
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取或不可领取")
        if pkg.quality_claimed_by is not None:
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取")

        # 原子性更新
        pkg.quality_claimed_by = req.user_id
        pkg.quality_claimed_at = datetime.utcnow()
        session.commit()
        # 清除质检员统计缓存
        cache_delete(f"inspector_stats:{req.user_id}")

    return {"code": 200, "msg": "领取成功"}


@app.get("/api/inspector/my-packages")
def inspector_my_packages(user_id: int):
    """质检员的质检包列表"""
    with Session(engine) as session:
        AnnotatorAlias = aliased(User)
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'), AnnotatorAlias.username.label('annotator_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .outerjoin(AnnotatorAlias, AnnotatorAlias.id == CorpusPackage.annotation_claimed_by)
            .filter(CorpusPackage.quality_claimed_by == user_id, CorpusPackage.quality_status == "待质检")
            .order_by(CorpusPackage.id.desc())
            .all()
        )
        result = []
        for row in rows:
            p = row.CorpusPackage
            result.append({
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "quality_status": p.quality_status,
                "corpus_group_name": row.cg_name or "",
                "annotator_name": row.annotator_name or "",
                "claimed_at": p.quality_claimed_at.strftime("%Y-%m-%d %H:%M") if p.quality_claimed_at else "",
            })
        return {"code": 200, "data": result}


@app.get("/api/inspector/package-corpus")
def inspector_get_package_corpus(package_id: int, user_id: int):
    """获取包内的所有语料（包括标注员的标注内容）"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg or pkg.quality_claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权访问该语料包")

        # 获取包内的所有语料（只取最新的录音）
        # 使用子查询获取每个语料的最新录音ID
        latest_recording_subquery = (
            session.query(
                VoiceRecording.corpus_text_id,
                func.max(VoiceRecording.id).label('max_id')
            )
            .filter(VoiceRecording.package_id == package_id)
            .group_by(VoiceRecording.corpus_text_id)
            .subquery()
        )
        
        # 获取语料列表
        corpus_items = (
            session.query(CorpusText)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .order_by(CorpusText.id)
            .all()
        )

        # 批量查询所有录音（消除 N+1）
        all_recordings = (
            session.query(VoiceRecording)
            .join(latest_recording_subquery, 
                  (VoiceRecording.corpus_text_id == latest_recording_subquery.c.corpus_text_id) &
                  (VoiceRecording.id == latest_recording_subquery.c.max_id))
            .filter(VoiceRecording.package_id == package_id)
            .all()
        )
        recording_map = {r.corpus_text_id: r for r in all_recordings}

        result = []
        for corpus in corpus_items:
            recording = recording_map.get(corpus.id)
            result.append({
                "id": corpus.id,
                "text_id": corpus.text_id,
                "content": corpus.content,
                "recording_id": recording.id if recording else None,
                "recording_file": recording.file_path if recording else None,
                "recorded_at": recording.recorded_at.strftime("%Y-%m-%d %H:%M") if recording else None,
                # 标注相关字段
                "annotated_text": recording.annotated_text if recording else None,
                "is_valid": recording.is_valid if recording else None,
                "annotation_note": recording.annotation_note if recording else None,
                # 质检相关字段
                "quality_note": recording.quality_note if recording else None,
                "inspected_by": recording.inspected_by if recording else None,
                # 质检审核字段（质检员看到被打回的标记）
                "quality_review_action": recording.quality_review_action if recording else None,
                "quality_review_note": recording.quality_review_note if recording else None,
            })

        return {
            "code": 200,
            "data": result,
            "total": len(result),
            "package_status": pkg.quality_status,
            "collector_real_name": pkg.collector_real_name,
            "collector_gender": pkg.collector_gender,
            "collector_age": pkg.collector_age,
            "collector_hometown": pkg.collector_hometown,
        }


@app.post("/api/inspector/submit-inspection")
@limiter.limit("800/minute")
def inspector_submit_inspection(
    request: Request,
    package_id: int,
    corpus_text_id: int,
    user_id: int,
    annotated_text: str = "",
    is_valid: int = 1,
    quality_note: str = "",
    quality_action: str = "通过",
):
    """质检员提交质检结果（通过或打回）"""
    try:
        if quality_action not in ["通过", "打回"]:
            raise HTTPException(status_code=400, detail="quality_action 只能是'通过'或'打回'")

        with Session(engine) as session:
            pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
            if not pkg or pkg.quality_claimed_by != user_id:
                raise HTTPException(status_code=403, detail="无权访问该语料包")

            corpus = session.query(CorpusText).filter_by(id=corpus_text_id).first()
            if not corpus:
                raise HTTPException(status_code=404, detail="语料不存在")

            recording = session.query(VoiceRecording).filter_by(
                package_id=package_id,
                corpus_text_id=corpus_text_id,
            ).first()

            if not recording:
                # 无录音记录：生成2秒静默WAV上传到OSS
                silent_wav = create_silent_wav(2)
                filename = f"voice_silent_{user_id}_{package_id}_{corpus_text_id}_{uuid.uuid4().hex[:8]}.wav"
                storage_client.put_object(BUCKET_NAME, filename, silent_wav, "audio/wav")
                recording = VoiceRecording(
                    package_id=package_id,
                    corpus_text_id=corpus_text_id,
                    collector_id=pkg.claimed_by,
                    file_path=filename,
                    status="已提交",
                    submitted_at=datetime.utcnow(),
                    duration_seconds=2,
                    is_valid=is_valid,
                )
                session.add(recording)
                session.flush()

            # 保存质检信息
            recording.annotated_text = annotated_text.strip()
            recording.is_valid = is_valid
            # 只在打回时才保存质检意见
            if quality_action == "打回":
                recording.quality_note = quality_note.strip() if quality_note else ""
                print(f"[质检] 打回语料 {corpus_text_id}，备注: {recording.quality_note}")
            else:
                recording.quality_note = None
            recording.inspected_by = user_id
            recording.inspected_at = datetime.utcnow()

            session.commit()
            # 清除质检员统计缓存
            cache_delete(f"inspector_stats:{user_id}")

            # 不再自动转换包状态，由质检员手动整包提交

            return {
                "code": 200,
                "msg": "质检成功",
                "user_id": user_id,
                "package_id": package_id,
                "corpus_id": corpus_text_id,
                "quality_action": quality_action,
                "inspected_at": datetime.utcnow().isoformat(),
            }

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败: {str(e)}")


@app.post("/api/inspector/submit-package")
@limiter.limit("30/minute")
def inspector_submit_package(
    request: Request,
    package_id: int,
    user_id: int,
):
    """质检员整包提交：检查所有语料都已质检后，决定是打回还是提交给质检审核员"""
    try:
        with Session(engine) as session:
            pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
            if not pkg or pkg.quality_claimed_by != user_id:
                raise HTTPException(status_code=403, detail="无权访问该语料包")

            # 检查所有语料是否都已质检
            total_corpus = session.query(CorpusPackageItem).filter_by(package_id=package_id).count()
            inspected_text_ids = set(
                row[0] for row in
                session.query(VoiceRecording.corpus_text_id).filter(
                    VoiceRecording.package_id == package_id,
                    VoiceRecording.inspected_by.isnot(None),
                )
            )
            inspected_corpus = len(inspected_text_ids)

            if inspected_corpus < total_corpus:
                # 找出未质检的语料
                all_corpus_ids = set(
                    row[0] for row in
                    session.query(CorpusPackageItem.corpus_text_id).filter_by(package_id=package_id).all()
                )
                incomplete_ids = all_corpus_ids - inspected_text_ids
                incomplete_items = session.query(CorpusText).filter(CorpusText.id.in_(incomplete_ids)).all()
                incomplete_list = [f"{c.text_id}: {c.content[:30]}" for c in incomplete_items]
                raise HTTPException(
                    status_code=400,
                    detail=f"还有 {total_corpus - inspected_corpus} 条语料未质检: {', '.join(incomplete_list[:5])}"
                )

            # 检查是否有任何一条被标记为打回（quality_note 不为 None）
            rejected_recordings = session.query(VoiceRecording).filter(
                VoiceRecording.package_id == package_id,
                VoiceRecording.quality_note != None
            ).count()

            if rejected_recordings > 0:
                # 有打回：清除被打回语料的标注和质检标记，让标注员重新标注
                # 保留 quality_note 作为打回标记，前端据此识别哪些条目被打回
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id == package_id,
                    VoiceRecording.quality_note != None
                ).update({
                    "inspected_by": None,
                    "inspected_at": None,
                    "annotated_by": None,
                    "annotated_at": None,
                }, synchronize_session=False)

                # 清除通过语料的质检标记
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id == package_id,
                    VoiceRecording.quality_note == None
                ).update({
                    "inspected_by": None,
                    "inspected_at": None,
                }, synchronize_session=False)

                # 整包打回，回到原标注员
                pkg.quality_status = "已打回"
                pkg.annotation_status = "待标注"
                # 保留 annotation_claimed_by，包回到原标注员的"我的包"列表
                print(f"[质检] 包 {package_id} 被打回，共 {rejected_recordings} 条语料需要修改")
            else:
                # 全部通过：提交给质检审核员
                pkg.quality_status = "已质检"
                pkg.quality_review_status = "待审核"
                pkg.quality_review_claimed_by = None
                pkg.quality_review_claimed_at = None
                print(f"[质检] 包 {package_id} 通过质检，等待质检审核")

            session.commit()
            # 清除质检员统计缓存
            cache_delete(f"inspector_stats:{user_id}")

            return {
                "code": 200,
                "msg": "打回成功，已回到标注员" if rejected_recordings > 0 else "整包提交成功，已推送到质检审核",
                "package_id": package_id,
                "rejected": rejected_recordings > 0,
            }

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"整包提交失败: {str(e)}")


class InspectorRejectPackageRequest(BaseModel):
    package_id: int
    user_id: int
    reason: str


@app.post("/api/inspector/reject-package")
def inspector_reject_package(req: InspectorRejectPackageRequest):
    """质检员整包打回：不需要检查所有语料，直接打回到标注员"""
    if not req.reason.strip():
        raise HTTPException(status_code=400, detail="打回原因不能为空")

    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).first()
        if not pkg or pkg.quality_claimed_by != req.user_id:
            raise HTTPException(status_code=403, detail="无权操作该语料包")

        # 清除所有录音的质检标记
        session.query(VoiceRecording).filter(
            VoiceRecording.package_id == req.package_id
        ).update({
            "inspected_by": None,
            "inspected_at": None,
            "quality_note": None,
        }, synchronize_session=False)

        # 整包打回，回到原标注员
        pkg.quality_status = "已打回"
        pkg.annotation_status = "待标注"
        pkg.quality_review_comment = req.reason.strip()
        # 保留 annotation_claimed_by，包回到原标注员的"我的包"列表

        session.commit()
        # 清除质检员统计缓存
        cache_delete(f"inspector_stats:{req.user_id}")

        print(f"[质检整包打回] 包 {req.package_id} 被打回，原因: {req.reason.strip()}")

        return {
            "code": 200,
            "msg": "整包打回成功，已回到标注员",
            "package_id": req.package_id,
        }


@app.get("/api/inspector/statistics")
def get_inspector_statistics_real(user_id: int):
    """获取质检员个人统计信息"""
    try:
        # 检查缓存
        cache_key = f"inspector_stats:{user_id}"
        cached = cache_get(cache_key)
        if cached:
            return {"code": 200, "data": cached}

        with Session(engine) as session:
            user = session.query(User).filter_by(id=user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            # 只统计待质检的包数
            packages = session.query(CorpusPackage).filter_by(
                quality_claimed_by=user_id,
                quality_status="待质检"
            ).count()
            corpus_count = session.query(VoiceRecording).filter_by(inspected_by=user_id).count()
            duration = session.query(
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0)
            ).filter(VoiceRecording.inspected_by == user_id).scalar() or 0

            # 质检审核通过的包数和时长
            approved_packages = session.query(CorpusPackage).filter_by(
                quality_claimed_by=user_id, quality_review_status="已合格"
            ).count()
            approved_duration = session.query(
                func.sum(VoiceRecording.duration_seconds)
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).filter(
                VoiceRecording.inspected_by == user_id,
                CorpusPackage.quality_review_status == "已合格"
            ).scalar() or 0

            # 无效条数
            invalid_count = session.query(
                func.count(VoiceRecording.id)
            ).filter(
                VoiceRecording.inspected_by == user_id,
                VoiceRecording.is_valid == 0
            ).scalar() or 0

            result = {
                "packages": packages,
                "corpus_count": corpus_count,
                "total_duration_seconds": int(duration),
                "approved_packages": approved_packages,
                "approved_duration_seconds": int(approved_duration),
                "invalid_count": int(invalid_count),
                "valid_count": int(corpus_count) - int(invalid_count)
            }
            # 缓存30秒
            cache_set(cache_key, result, ttl=30)
            return {"code": 200, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[错误] 质检员统计失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ── 采集员工作区 ────────────────────────────────────────────────────
@app.get("/api/collector/package-corpus")
def get_package_corpus(package_id: int, user_id: int):
    """获取包内的所有语料（包括录制状态）"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")

        if pkg.claimed_by != user_id:
            if pkg.status == "未领取":
                raise HTTPException(status_code=403, detail="该包已被管理员释放，请返回首页刷新")
            elif pkg.claimed_by is None:
                raise HTTPException(status_code=403, detail="该包未被领取，请返回首页刷新")
            else:
                raise HTTPException(status_code=403, detail="该包已被其他人领取，请返回首页刷新")

        # 获取包内的所有语料
        items = (
            session.query(CorpusText)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .order_by(CorpusText.id)
            .all()
        )

        # 获取已录制的语料ID（不限采集员，打回重领后旧录音仍有效）
        recorded_ids = {
            row[0] for row in
            session.query(VoiceRecording.corpus_text_id).filter_by(package_id=package_id)
        }

        # 获取打回备注
        rejection_notes = {}
        for note_record in session.query(PackageCorpusRejectionNote).filter_by(package_id=package_id):
            if note_record.note:
                rejection_notes[note_record.corpus_text_id] = note_record.note

        result = []
        for item in items:
            result.append({
                "id": item.id,
                "text_id": item.text_id,
                "content": item.content,
                "recorded": item.id in recorded_ids,
                "note": rejection_notes.get(item.id),
            })

        unrecorded_count = len(items) - len(recorded_ids)
        return {
            "code": 200,
            "data": result,
            "total": len(items),
            "completed": len(recorded_ids),
            "unrecorded_count": unrecorded_count,
            "package_status": pkg.status,
            "package_review_status": pkg.review_status,
            "empty_corpus": len(items) == 0,
        }


def get_wav_duration(wav_data: bytes) -> int:
    """获取WAV文件的时长（秒），返回整数"""
    try:
        with wave.open(io.BytesIO(wav_data), 'rb') as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            duration = frames / rate
            return int(duration)
    except Exception as e:
        print(f"[获取时长] 错误: {e}")
        return 0


def detect_clipping(wav_data: bytes, min_consecutive: int = 3) -> bool:
    """检测WAV音频是否存在削波（连续N个样本在边界值才判定为削波）"""
    try:
        import numpy as np
        with wave.open(io.BytesIO(wav_data), 'rb') as wf:
            raw = wf.readframes(wf.getnframes())
        samples = np.frombuffer(raw, dtype=np.int16)

        # 找到边界样本（最大值或最小值）
        at_boundary = (samples == 32767) | (samples == -32768)

        # 检测连续段：用diff找连续True的区间
        padded = np.concatenate(([False], at_boundary, [False]))
        diff = np.diff(padded.astype(np.int8))
        starts = np.where(diff == 1)[0]
        ends = np.where(diff == -1)[0]
        run_lengths = ends - starts

        # 只有连续>=min_consecutive个样本才算削波
        return bool(np.any(run_lengths >= min_consecutive))
    except Exception as e:
        print(f"[削波检测] 错误: {e}")
        return False


def create_silent_wav(duration_seconds: int = 2, sample_rate: int = 16000) -> bytes:
    """生成指定时长的静默WAV文件"""
    num_samples = sample_rate * duration_seconds
    header_length = 44
    data_length = num_samples * 2  # 16-bit = 2 bytes per sample
    file_length = header_length + data_length

    buf = bytearray(file_length)
    view = memoryview(buf)

    # RIFF header
    buf[0:4] = b'RIFF'
    view[4:8] = struct.pack('<I', file_length - 8)
    buf[8:12] = b'WAVE'
    buf[12:16] = b'fmt '
    view[16:20] = struct.pack('<I', 16)       # fmt chunk size
    view[20:22] = struct.pack('<H', 1)        # PCM
    view[22:24] = struct.pack('<H', 1)        # mono
    view[24:28] = struct.pack('<I', sample_rate)
    view[28:32] = struct.pack('<I', sample_rate * 2)
    view[32:34] = struct.pack('<H', 2)        # block align
    view[34:36] = struct.pack('<H', 16)       # bits per sample
    buf[36:40] = b'data'
    view[40:44] = struct.pack('<I', data_length)

    # data部分全零（静默）
    # 已经是 bytearray 初始化为 0，无需额外填充

    return bytes(buf)


@app.post("/api/collector/submit-recording")
@limiter.limit("800/minute")
def submit_recording(
    request: Request,
    package_id: int,
    corpus_text_id: int,
    user_id: int,
    file: UploadFile = File(...),
    is_valid: int = 1,
):
    """提交录音文件，返回下一条语料信息"""
    try:
        # 读取文件内容并计算时长（在数据库操作前完成）
        content = file.file.read()
        duration_seconds = get_wav_duration(content)

        # 削波检测：任何削波都要求重录
        if detect_clipping(content):
            raise HTTPException(status_code=400, detail="录音存在削波，请调整麦克风距离后重录")

        # 上传到OSS（在数据库事务外完成）
        try:
            timestamp = int(datetime.utcnow().timestamp() * 1000)
            unique_id = f"{user_id}_{package_id}_{corpus_text_id}"
            filename = f"voice_{unique_id}_{timestamp}_{uuid.uuid4().hex[:8]}.wav"

            storage_client.put_object(BUCKET_NAME, filename, content, "audio/wav")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"文件上传失败: {str(e)}")

        # 数据库操作（单次Session）
        with Session(engine) as session:
            # 验证权限并获取包信息
            pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
            if not pkg or pkg.claimed_by != user_id:
                raise HTTPException(status_code=403, detail="无权访问该语料包")
            if pkg.status == "已完成":
                raise HTTPException(status_code=403, detail="该语料包已完成提交，无法再修改")

            # 检查是否已有该语料的录制记录
            existing = session.query(VoiceRecording).filter_by(
                package_id=package_id,
                corpus_text_id=corpus_text_id,
                collector_id=user_id
            ).first()

            if existing:
                existing.file_path = filename
                existing.status = "已提交"
                existing.submitted_at = datetime.utcnow()
                existing.duration_seconds = duration_seconds
                existing.is_valid = is_valid
            else:
                recording = VoiceRecording(
                    package_id=package_id,
                    corpus_text_id=corpus_text_id,
                    collector_id=user_id,
                    file_path=filename,
                    status="已提交",
                    submitted_at=datetime.utcnow(),
                    duration_seconds=duration_seconds,
                    is_valid=is_valid,
                )
                session.add(recording)

            session.commit()

            # 获取下一条未录制的语料（按包内顺序）
            next_corpus = (
                session.query(CorpusText)
                .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
                .filter(CorpusPackageItem.package_id == package_id)
                .filter(CorpusText.id > corpus_text_id)
                .order_by(CorpusText.id)
                .first()
            )

            # 统计包的完成情况 - 使用单个查询
            total_items = session.query(CorpusPackageItem).filter_by(package_id=package_id).count()
            recorded_items = session.query(func.count(func.distinct(VoiceRecording.corpus_text_id))).filter_by(
                package_id=package_id
            ).scalar() or 0

            is_completed = recorded_items >= total_items

            # 如果整包完成，更新包的状态
            if is_completed:
                pkg_record = session.query(CorpusPackage).filter_by(id=package_id).first()
                if pkg_record:
                    pkg_record.status = "已完成"
                    if pkg_record.review_status == "已打回":
                        pkg_record.review_status = "待审核"
                        pkg_record.reviewed_by = None
                        pkg_record.reviewed_at = None
                    session.commit()

            result = {
                "code": 200,
                "msg": "提交成功",
                "recording_id": filename,
                "user_id": user_id,
                "package_id": package_id,
                "corpus_id": corpus_text_id,
                "submitted_at": datetime.utcnow().isoformat(),
                "completed": recorded_items,
                "total": total_items,
                "is_package_completed": is_completed,
            }

            if next_corpus:
                result["next"] = {
                    "id": next_corpus.id,
                    "text_id": next_corpus.text_id,
                    "content": next_corpus.content,
                }
            else:
                result["next"] = None

            return result

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交失败: {str(e)}")


@app.post("/api/collector/skip-recording")
@limiter.limit("800/minute")
def skip_recording(
    request: Request,
    package_id: int,
    corpus_text_id: int,
    user_id: int,
):
    """跳过录音：不上传文件，直接创建一条无效记录"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg or pkg.claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权访问该语料包")
        if pkg.status == "已完成":
            raise HTTPException(status_code=403, detail="该语料包已完成提交，无法再修改")

        existing = session.query(VoiceRecording).filter_by(
            package_id=package_id,
            corpus_text_id=corpus_text_id,
            collector_id=user_id
        ).first()

        if existing:
            existing.file_path = None
            existing.status = "已提交"
            existing.submitted_at = datetime.utcnow()
            existing.duration_seconds = 0
            existing.is_valid = 0
        else:
            session.add(VoiceRecording(
                package_id=package_id,
                corpus_text_id=corpus_text_id,
                collector_id=user_id,
                file_path=None,
                status="已提交",
                submitted_at=datetime.utcnow(),
                duration_seconds=0,
                is_valid=0,
            ))

        session.commit()

        # 使用优化的统计查询
        total_items = session.query(CorpusPackageItem).filter_by(package_id=package_id).count()
        recorded_items = session.query(func.count(func.distinct(VoiceRecording.corpus_text_id))).filter_by(
            package_id=package_id
        ).scalar() or 0
        is_completed = recorded_items >= total_items

        if is_completed:
            pkg_record = session.query(CorpusPackage).filter_by(id=package_id).first()
            if pkg_record:
                pkg_record.status = "已完成"
                if pkg_record.review_status == "已打回":
                    pkg_record.review_status = "待审核"
                    pkg_record.reviewed_by = None
                    pkg_record.reviewed_at = None
                session.commit()

        next_corpus = (
            session.query(CorpusText)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .filter(CorpusText.id > corpus_text_id)
            .order_by(CorpusText.id)
            .first()
        )

        result = {
            "code": 200,
            "msg": "已跳过",
            "completed": recorded_items,
            "total": total_items,
            "is_package_completed": is_completed,
        }
        if next_corpus:
            result["next"] = {"id": next_corpus.id, "text_id": next_corpus.text_id, "content": next_corpus.content}
        else:
            result["next"] = None
        return result


# ── 采集员任务大厅 ────────────────────────────────────────────────
@app.get("/api/collector/available-packages")
def collector_available_packages(user_id: int):
    with Session(engine) as session:
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=user_id)
        ]
        if not group_ids:
            return {"code": 200, "data": []}
        corpus_group_ids = [
            row[0] for row in
            session.query(CorpusGroupAssignment.corpus_group_id)
            .filter(CorpusGroupAssignment.collector_group_id.in_(group_ids))
        ]
        if not corpus_group_ids:
            return {"code": 200, "data": []}
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .filter(
                CorpusPackage.corpus_group_id.in_(corpus_group_ids),
                CorpusPackage.status == "未领取",
            )
            .order_by(CorpusPackage.id)
            .all()
        )
        result = []
        for row in rows:
            p = row.CorpusPackage
            result.append({
                "id": p.id, "name": p.name, "size": p.size, "status": p.status,
                "corpus_group_name": row.cg_name or "",
                "created_at": p.created_at.strftime("%Y-%m-%d %H:%M"),
            })
        return {"code": 200, "data": result}


@app.post("/api/collector/packages/{package_id}/claim")
@limiter.limit("20/minute")
def collector_claim_package(request: Request, package_id: int, req: ClaimPackageRequest):
    with Session(engine) as session:
        # 用 FOR UPDATE 锁定这一行，防止并发争用
        pkg = session.query(CorpusPackage).filter_by(id=package_id).with_for_update().first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")

        # 检查权限
        group_ids = [
            row[0] for row in
            session.query(GroupMember.group_id).filter_by(user_id=req.user_id)
        ]
        accessible_cg_ids = (
            [
                row[0] for row in
                session.query(CorpusGroupAssignment.corpus_group_id)
                .filter(CorpusGroupAssignment.collector_group_id.in_(group_ids))
            ]
            if group_ids else []
        )
        if pkg.corpus_group_id not in accessible_cg_ids:
            raise HTTPException(status_code=403, detail="您无权领取该语料包")

        # 检查个人信息是否被驳回
        user = session.query(User).filter_by(id=req.user_id).first()
        if user and user.info_rejected == 1:
            raise HTTPException(status_code=403, detail="您的个人信息已被管理员驳回，请更正后才能继续领取任务")

        # 检查系统用户协议
        system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
        if system_agreement and system_agreement.value:
            signature = session.query(AgreementSignature).filter_by(
                user_id=req.user_id,
                agreement_id=-1
            ).first()
            if not signature:
                return {
                    "code": 200,
                    "requires_agreement": True,
                    "group_id": group_ids[0] if group_ids else None,
                    "agreement_id": -1,
                    "agreement_content": system_agreement.value
                }

        # 检查状态（必须是"未领取"且未被领取）
        if pkg.status != "未领取":
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取或不可领取")
        if pkg.claimed_by is not None:
            raise HTTPException(status_code=400, detail="该语料包已被其他人领取")

        # 原子性更新
        pkg.status = "已领取"
        pkg.claimed_by = req.user_id
        pkg.claimed_at = datetime.utcnow()
        session.commit()

    return {"code": 200, "msg": "领取成功"}


@app.post("/api/collector/claim-next")
@limiter.limit("20/minute")
def collector_claim_next(request: Request, req: ClaimPackageRequest):
    """采集员一键领取下一个可用的语料包"""
    try:
        with Session(engine) as session:
            # 获取用户的所有分组
            group_ids = [
                row[0] for row in
                session.query(GroupMember.group_id).filter_by(user_id=req.user_id)
            ]

            # 获取用户有权限的语料组
            accessible_cg_ids = (
                [
                    row[0] for row in
                    session.query(CorpusGroupAssignment.corpus_group_id)
                    .filter(CorpusGroupAssignment.collector_group_id.in_(group_ids))
                ]
                if group_ids else []
            )

            if not accessible_cg_ids:
                raise HTTPException(status_code=403, detail="您没有权限领取任何语料包")

            # 检查个人信息是否被驳回
            user = session.query(User).filter_by(id=req.user_id).first()
            if user and user.info_rejected == 1:
                raise HTTPException(status_code=403, detail="您的个人信息已被管理员驳回，请更正后才能继续领取任务")

            # 检查系统用户协议
            system_agreement = session.query(SystemSettings).filter_by(key='user_agreement').first()
            if system_agreement and system_agreement.value:
                signature = session.query(AgreementSignature).filter_by(
                    user_id=req.user_id, agreement_id=-1
                ).first()
                if not signature:
                    return {
                        "code": 200,
                        "requires_agreement": True,
                        "group_id": group_ids[0] if group_ids else None,
                        "agreement_id": -1,
                        "agreement_content": system_agreement.value
                    }

            # 找一个未被领取的包
            pkg = session.query(CorpusPackage).filter(
                CorpusPackage.status == "未领取",
                CorpusPackage.corpus_group_id.in_(accessible_cg_ids)
            ).with_for_update(skip_locked=True).first()

            if not pkg:
                return {"code": 200, "msg": "暂无可领取的语料包", "data": None}

            # 获取语料组名称
            cg_name = ""
            if pkg.corpus_group_id:
                cg = session.query(CorpusGroup).filter_by(id=pkg.corpus_group_id).first()
                if cg:
                    cg_name = cg.name

            # 领取
            pkg.status = "已领取"
            pkg.claimed_by = req.user_id
            pkg.claimed_at = datetime.utcnow()
            session.commit()

            print(f"[claim-next] user_id={req.user_id} claimed package_id={pkg.id}, corpus_group={cg_name}")

            return {
                "code": 200, "msg": "领取成功", "package_id": pkg.id,
                "package_name": pkg.name or "", "package_size": pkg.size or 0,
                "corpus_group_name": cg_name,
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[claim-next错误] {str(e)}")
        raise HTTPException(status_code=500, detail=f"领取失败: {str(e)}")


@app.post("/api/collector/release-package")
def collector_release_package(req: ReleasePackageRequest):
    """采集员主动释放已领取的语料包"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")

        if pkg.claimed_by != req.user_id:
            raise HTTPException(status_code=403, detail="该包不是您领取的，无法释放")

        if pkg.status != "已领取":
            raise HTTPException(status_code=400, detail=f"该包状态为{pkg.status}，无法释放")

        # 检查是否已有录制记录
        has_recordings = session.query(VoiceRecording).filter_by(
            package_id=pkg.id, collector_id=req.user_id
        ).first()

        if has_recordings:
            raise HTTPException(status_code=400, detail="该包已有录制记录，无法释放。请联系管理员处理")

        # 释放
        pkg.status = "未领取"
        pkg.claimed_by = None
        pkg.claimed_at = None
        session.commit()

        print(f"[release-package] user_id={req.user_id} released package_id={pkg.id}")

        return {"code": 200, "msg": "释放成功"}


@app.get("/api/collector/my-packages")
def collector_my_packages(user_id: int):
    with Session(engine) as session:
        print(f"[DEBUG] Fetching packages for user_id: {user_id} (type: {type(user_id)})")
        rows = (
            session.query(CorpusPackage, CorpusGroup.name.label('cg_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .filter(CorpusPackage.claimed_by == user_id, CorpusPackage.status != "已完成")
            .order_by(CorpusPackage.id.desc())
            .all()
        )
        print(f"[DEBUG] Found {len(rows)} rows")
        result = []
        for row in rows:
            p = row.CorpusPackage
            print(f"[DEBUG] Package {p.id}: status={p.status}, claimed_by={p.claimed_by}")
            result.append({
                "id": p.id, "name": p.name, "size": p.size, "status": p.status,
                "corpus_group_name": row.cg_name or "",
                "claimed_at": p.claimed_at.strftime("%Y-%m-%d %H:%M") if p.claimed_at else "",
                "review_status": p.review_status,
                "review_comment": p.review_comment,
            })
        return {"code": 200, "data": result}


@app.get("/api/collector/profile")
def get_collector_profile(user_id: int):
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {
            "code": 200,
            "data": {
                "real_name": user.real_name,
                "gender": user.gender,
                "age": user.age,
                "hometown": user.hometown,
                "city": user.city,
            },
        }


@app.patch("/api/collector/profile")
def update_collector_profile(req: UpdateProfileRequest):
    with Session(engine) as session:
        user = session.query(User).filter_by(id=req.user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        if req.real_name is not None:
            user.real_name = req.real_name
        if req.gender is not None:
            user.gender = req.gender
        if req.age is not None:
            user.age = req.age
        if req.hometown is not None:
            user.hometown = req.hometown
        if req.city is not None:
            user.city = req.city
        # 保存后自动重置驳回状态
        if user.info_rejected == 1:
            user.info_rejected = 0
        session.commit()
    return {"code": 200, "msg": "保存成功"}


@app.get("/api/collector/agreement-signature")
def get_collector_signature(user_id: int):
    with Session(engine) as session:
        sig = session.query(AgreementSignature).filter_by(user_id=user_id, agreement_id=-1).first()
        if not sig:
            return {"code": 200, "data": None}
        
        url = None
        if sig.signature_path:
            try:
                url = storage_client.presigned_get_object("signatures", sig.signature_path, expires=3600)
            except Exception:
                try:
                    url = storage_client.presigned_get_object(BUCKET_NAME, sig.signature_path, expires=3600)
                except Exception:
                    pass
        
        return {
            "code": 200,
            "data": {
                "id": sig.id,
                "signed_at": sig.signed_at.strftime("%Y-%m-%d %H:%M:%S") if sig.signed_at else None,
                "signature_url": url
            }
        }


@app.delete("/api/collector/agreement-signature")
def delete_collector_signature(user_id: int):
    with Session(engine) as session:
        sig = session.query(AgreementSignature).filter_by(user_id=user_id, agreement_id=-1).first()
        if not sig:
            raise HTTPException(status_code=404, detail="签名记录不存在")
        session.delete(sig)
        session.commit()
    return {"code": 200, "msg": "删除签名成功，请重新签署"}


@app.post("/api/collector/reset-recording")
def reset_recording(package_id: int, user_id: int):
    """全部重录：清除打回包的所有录音记录"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")
        if pkg.claimed_by != user_id:
            raise HTTPException(status_code=403, detail="无权操作该包")
        if pkg.review_status != "已打回":
            raise HTTPException(status_code=400, detail="只能重录被打回的包")

        # 清除该包该用户的所有录音
        deleted_count = session.query(VoiceRecording).filter_by(
            package_id=package_id,
            collector_id=user_id
        ).delete()
        session.commit()

        return {"code": 200, "msg": f"已清除 {deleted_count} 条录音，可全部重录"}


# ── 管理员清空数据 ────────────────────────────────────────────────────
@app.post("/api/admin/clear-all-corpus")
def clear_all_corpus():
    """清空所有语料、包、分配等数据，仅保留用户和分组"""
    with Session(engine) as session:
        # 统计删除前
        before = {
            'CorpusPackageItem': session.query(CorpusPackageItem).count(),
            'CorpusPackage': session.query(CorpusPackage).count(),
            'CorpusText': session.query(CorpusText).count(),
            'CorpusGroupAssignment': session.query(CorpusGroupAssignment).count(),
            'CorpusGroup': session.query(CorpusGroup).count(),
        }

        # 级联删除
        session.query(CorpusPackageItem).delete(synchronize_session=False)
        session.query(CorpusPackage).delete(synchronize_session=False)
        session.query(CorpusText).delete(synchronize_session=False)
        session.query(CorpusGroupAssignment).delete(synchronize_session=False)
        session.query(CorpusGroup).delete(synchronize_session=False)
        session.commit()

        return {
            "code": 200,
            "msg": "已清空所有语料相关数据",
            "deleted": before,
        }


# ── 包审核管理 ──────────────────────────────────────────────────────
@app.post("/api/admin/fix-package-status")
def fix_package_status():
    """修复所有已完成但状态未更新的包"""
    fixed = 0
    with Session(engine) as session:
        # 找出所有status不是"已完成"的包
        packages = session.query(CorpusPackage).filter(CorpusPackage.status != "已完成").all()

        for pkg in packages:
            # 统计该包的录音完成情况
            total_corpus = session.query(CorpusPackageItem).filter_by(package_id=pkg.id).count()
            completed_recordings = session.query(VoiceRecording).filter_by(
                package_id=pkg.id,
                status="已提交"
            ).count()

            # 如果所有语料都已录制，更新包的状态
            if total_corpus > 0 and completed_recordings >= total_corpus:
                pkg.status = "已完成"
                fixed += 1

        session.commit()

    return {
        "code": 200,
        "msg": f"修复完成，更新了 {fixed} 个包的状态",
        "fixed": fixed
    }


@app.get("/api/admin/package-submissions")
def list_package_submissions(review_status: str | None = None, corpus_group_id: int | None = None, limit: int = 20, offset: int = 0):
    """获取采集员提交的包列表"""
    with Session(engine) as session:
        # 预聚合子查询
        rec_sub = select(
            VoiceRecording.package_id,
            func.count(VoiceRecording.id).label('recorded_count')
        ).filter(VoiceRecording.status == "已提交").group_by(VoiceRecording.package_id).subquery()

        item_sub = select(
            CorpusPackageItem.package_id,
            func.count(CorpusPackageItem.id).label('total_count')
        ).group_by(CorpusPackageItem.package_id).subquery()

        CollectorAlias = aliased(User)
        q = session.query(
            CorpusPackage,
            CollectorAlias.username.label('collector_name'),
            CorpusGroup.name.label('corpus_group_name'),
            func.coalesce(rec_sub.c.recorded_count, 0).label('recorded_count'),
            func.coalesce(item_sub.c.total_count, 0).label('total_count'),
        ).outerjoin(CollectorAlias, CollectorAlias.id == CorpusPackage.claimed_by
        ).outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id
        ).outerjoin(rec_sub, rec_sub.c.package_id == CorpusPackage.id
        ).outerjoin(item_sub, item_sub.c.package_id == CorpusPackage.id
        )

        if review_status == "已打回":
            q = q.filter(CorpusPackage.review_status == "已打回")
        elif review_status == "已合格":
            q = q.filter(CorpusPackage.review_status == "已合格")
        else:
            q = q.filter(CorpusPackage.status == "已完成", CorpusPackage.review_status == "待审核")

        if corpus_group_id:
            q = q.filter(CorpusPackage.corpus_group_id == corpus_group_id)

        total = q.count()
        rows = q.order_by(CorpusPackage.id.desc()).offset(offset).limit(limit).all()
        result = []

        for row in rows:
            pkg = row.CorpusPackage
            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "review_status": pkg.review_status,
                "corpus_group_name": row.corpus_group_name or "",
                "collector_id": pkg.claimed_by,
                "collector_name": row.collector_name or "",
                "recorded_count": row.recorded_count,
                "total_count": row.total_count,
                "completed_at": pkg.created_at.strftime("%Y-%m-%d %H:%M"),
            })

        return {"code": 200, "data": result, "total": total}


@app.get("/api/admin/collector-packages")
def get_collector_packages(collector_id: int):
    """获取某个采集员的所有包（所有状态）"""
    with Session(engine) as session:
        collector = session.query(User).filter_by(id=collector_id).first()

        if not collector:
            raise HTTPException(status_code=404, detail="采集员不存在")

        # 预聚合子查询
        rec_sub = select(
            VoiceRecording.package_id,
            func.count(VoiceRecording.id).label('recorded_count')
        ).filter(VoiceRecording.status == "已提交").group_by(VoiceRecording.package_id).subquery()

        item_sub = select(
            CorpusPackageItem.package_id,
            func.count(CorpusPackageItem.id).label('total_count')
        ).group_by(CorpusPackageItem.package_id).subquery()

        rows = session.query(
            CorpusPackage,
            CorpusGroup.name.label('corpus_group_name'),
            func.coalesce(rec_sub.c.recorded_count, 0).label('recorded_count'),
            func.coalesce(item_sub.c.total_count, 0).label('total_count'),
        ).outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id
        ).outerjoin(rec_sub, rec_sub.c.package_id == CorpusPackage.id
        ).outerjoin(item_sub, item_sub.c.package_id == CorpusPackage.id
        ).filter(CorpusPackage.claimed_by == collector_id
        ).order_by(CorpusPackage.claimed_at.desc()).all()

        result = []
        for row in rows:
            pkg = row.CorpusPackage
            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "review_status": pkg.review_status,
                "corpus_group_name": row.corpus_group_name or "",
                "recorded_count": row.recorded_count,
                "total_count": row.total_count,
                "claimed_at": pkg.claimed_at.strftime("%Y-%m-%d %H:%M") if pkg.claimed_at else "",
                "reviewed_at": pkg.reviewed_at.strftime("%Y-%m-%d %H:%M") if pkg.reviewed_at else "",
                "review_comment": pkg.review_comment,
            })

        return {
            "code": 200,
            "collector_name": collector.username,
            "data": result,
        }


@app.get("/api/admin/package-detail/{package_id}")
def get_package_detail(package_id: int):
    """获取包的详细信息（包括所有录音）"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        # 获取包内的所有语料和对应的录音（只取最新的录音）
        # 使用子查询获取每个语料的最新录音ID
        latest_recording_subquery = (
            session.query(
                VoiceRecording.corpus_text_id,
                func.max(VoiceRecording.id).label('max_id')
            )
            .filter(VoiceRecording.package_id == package_id)
            .group_by(VoiceRecording.corpus_text_id)
            .subquery()
        )
        
        # 获取语料列表
        corpus_items = (
            session.query(CorpusText)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .order_by(CorpusText.id)
            .all()
        )

        # 获取打回备注
        rejection_notes = {}
        for note_record in session.query(PackageCorpusRejectionNote).filter_by(package_id=package_id):
            rejection_notes[note_record.corpus_text_id] = note_record.note

        corpus_list = []
        for corpus in corpus_items:
            # 查询该语料的最新录音
            recording = (
                session.query(VoiceRecording)
                .join(latest_recording_subquery, 
                      (VoiceRecording.corpus_text_id == latest_recording_subquery.c.corpus_text_id) &
                      (VoiceRecording.id == latest_recording_subquery.c.max_id))
                .filter(VoiceRecording.corpus_text_id == corpus.id)
                .first()
            )
            
            was_rejected = corpus.id in rejection_notes
            corpus_list.append({
                "id": corpus.id,
                "text_id": corpus.text_id,
                "content": corpus.content,
                "recording_id": recording.id if recording else None,
                "recording_file": recording.file_path if recording else None,
                "recorded_at": recording.recorded_at.strftime("%Y-%m-%d %H:%M") if recording else None,
                "is_valid": recording.is_valid if recording else None,
                "was_rejected": was_rejected,
                "rejection_note": rejection_notes.get(corpus.id),
            })

        collector = session.query(User).filter_by(id=pkg.claimed_by).first()
        corpus_group = session.query(CorpusGroup).filter_by(id=pkg.corpus_group_id).first()
        reviewer = session.query(User).filter_by(id=pkg.reviewed_by).first() if pkg.reviewed_by else None

        return {
            "code": 200,
            "data": {
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "review_status": pkg.review_status,
                "corpus_group_name": corpus_group.name if corpus_group else "",
                "collector_id": pkg.claimed_by,
                "collector_name": collector.username if collector else "",
                "corpus_list": corpus_list,
                "reviewed_by": reviewer.username if reviewer else None,
                "reviewed_at": pkg.reviewed_at.strftime("%Y-%m-%d %H:%M") if pkg.reviewed_at else None,
                "review_comment": pkg.review_comment,
            }
        }


@app.get("/api/admin/download-recording/{recording_id}")
async def download_recording(recording_id: int):
    """获取录音文件用于试听（返回MinIO下载URL）"""
    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            print(f"[下载] 录音不存在: {recording_id}")
            raise HTTPException(status_code=404, detail="录音不存在")

        print(f"[下载] 录音ID: {recording_id}, 文件: {recording.file_path}")

        try:
            if not recording.file_path:
                raise HTTPException(status_code=404, detail="该语料无录音文件")

            # 检查文件是否存在
            loop = asyncio.get_event_loop()
            stat = await loop.run_in_executor(None, lambda: storage_client.stat_object(BUCKET_NAME, recording.file_path))
            if not stat:
                raise HTTPException(status_code=404, detail=f"录音文件不存在: {recording.file_path}")
            print(f"[下载] 文件大小: {stat.get('size', 'unknown')} 字节")

            # 生成预签名URL用于试听
            url = await loop.run_in_executor(None, lambda: storage_client.presigned_get_object(
                BUCKET_NAME, recording.file_path, expires=3600
            ))
            if not url:
                raise HTTPException(status_code=500, detail="生成预签名URL失败")
            print(f"[下载] 预签名URL生成成功")
            return {"code": 200, "data": {"url": url, "filename": recording.file_path}}
        except HTTPException:
            raise
        except Exception as e:
            print(f"[下载] 错误: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取下载链接失败: {str(e)}")


@app.post("/api/admin/review-package")
def review_package(req: ReviewPackageRequest):
    """提交包的审核结果"""
    if req.review_status not in ["已合格", "已打回"]:
        raise HTTPException(status_code=400, detail="审核状态不合法")

    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        pkg.review_status = req.review_status
        pkg.reviewed_by = req.reviewer_id
        pkg.reviewed_at = datetime.utcnow()
        pkg.review_comment = req.review_comment or ""

        if req.review_status == "已合格":
            pkg.annotation_status = "待标注"
            pkg.annotation_claimed_by = None
            pkg.annotation_claimed_at = None
            # 复制采集员信息快照到包
            collector = session.query(User).filter_by(id=pkg.claimed_by).first()
            if collector:
                pkg.collector_real_name = collector.real_name
                pkg.collector_gender    = collector.gender
                pkg.collector_age       = collector.age
                pkg.collector_hometown  = collector.hometown
                pkg.collector_city      = collector.city
        elif req.review_status == "已打回":
            # 清除录音记录：如果指定了有问题的语料，只清除这些；否则全部清除
            if req.rejected_corpus_ids:
                # 先保存备注到新表
                for corpus_id in req.rejected_corpus_ids:
                    note = req.corpus_notes.get(corpus_id, "")
                    # 删除旧的备注记录
                    session.query(PackageCorpusRejectionNote).filter(
                        PackageCorpusRejectionNote.package_id == req.package_id,
                        PackageCorpusRejectionNote.corpus_text_id == corpus_id
                    ).delete()
                    # 添加新的备注记录
                    rejection_note = PackageCorpusRejectionNote(
                        package_id=req.package_id,
                        corpus_text_id=corpus_id,
                        note=note
                    )
                    session.add(rejection_note)
                # 再删除录音
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id == req.package_id,
                    VoiceRecording.corpus_text_id.in_(req.rejected_corpus_ids)
                ).delete(synchronize_session='fetch')
                print(f"[打回] 清除 {len(req.rejected_corpus_ids)} 条语料的录音")
            else:
                session.query(VoiceRecording).filter_by(package_id=req.package_id).delete()
                print(f"[打回] 清除包的全部录音")

            if req.reject_to == "任务大厅":
                pkg.status = "未领取"
                pkg.claimed_by = None
                pkg.claimed_at = None
            else:
                pkg.status = "已领取"

        session.commit()

    return {
        "code": 200,
        "msg": f"审核完成：{req.review_status}",
        "review_status": req.review_status,
    }


class BatchReviewPackagesRequest(BaseModel):
    package_ids: list[int]
    reviewer_id: int
    review_status: str = "已合格"
    review_comment: str | None = ""


@app.post("/api/admin/batch-review-packages")
def batch_review_packages(req: BatchReviewPackagesRequest):
    """批量审核包（整组通过）"""
    if req.review_status not in ["已合格", "已打回"]:
        raise HTTPException(status_code=400, detail="审核状态不合法")
    if not req.package_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个包")

    with Session(engine) as session:
        packages = session.query(CorpusPackage).filter(
            CorpusPackage.id.in_(req.package_ids),
            CorpusPackage.review_status == "待审核"
        ).all()

        if not packages:
            raise HTTPException(status_code=400, detail="没有待审核的包")

        count = 0
        now = datetime.utcnow()
        for pkg in packages:
            pkg.review_status = req.review_status
            pkg.reviewed_by = req.reviewer_id
            pkg.reviewed_at = now
            pkg.review_comment = req.review_comment or ""

            if req.review_status == "已合格":
                pkg.annotation_status = "待标注"
                pkg.annotation_claimed_by = None
                pkg.annotation_claimed_at = None
                collector = session.query(User).filter_by(id=pkg.claimed_by).first()
                if collector:
                    pkg.collector_real_name = collector.real_name
                    pkg.collector_gender = collector.gender
                    pkg.collector_age = collector.age
                    pkg.collector_hometown = collector.hometown
                    pkg.collector_city = collector.city
            count += 1

        session.commit()

    return {
        "code": 200,
        "msg": f"已将 {count} 个包标记为{req.review_status}",
        "reviewed_count": count,
    }


# ── 采集审核员 API ────────────────────────────────────────────────────
@app.get("/api/reviewer/corpus-groups")
def list_reviewer_corpus_groups(user_id: int = Query(...)):
    """获取审核员可访问的语料组列表"""
    with Session(engine) as session:
        # 获取该用户所在的分组
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        if not group_ids:
            return {"code": 200, "data": []}

        # 获取分配给这些分组的语料组
        corpus_groups = (
            session.query(CorpusGroup)
            .join(CorpusReviewerAssignment, CorpusReviewerAssignment.corpus_group_id == CorpusGroup.id)
            .filter(CorpusReviewerAssignment.reviewer_group_id.in_(group_ids))
            .order_by(CorpusGroup.id)
            .all()
        )

        result = []
        for g in corpus_groups:
            # 统计该语料组中待审核的包数量
            pending_count = session.query(CorpusPackage).filter(
                CorpusPackage.corpus_group_id == g.id,
                CorpusPackage.status == "已完成",
                CorpusPackage.review_status == "待审核"
            ).count()
            result.append({"id": g.id, "name": g.name, "pending_review_count": pending_count})
        return {"code": 200, "data": result}


@app.get("/api/reviewer/package-submissions")
def list_reviewer_package_submissions(user_id: int = Query(...), corpus_group_id: int | None = None, review_status: str | None = None):
    """获取审核员负责的采集包列表"""
    with Session(engine) as session:
        # 检查权限：该用户是否被分配到该语料组
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        if not group_ids:
            return {"code": 403, "data": [], "detail": "无权限"}

        # 如果指定了语料组，验证该审核员是否有权限
        if corpus_group_id:
            assignment = (
                session.query(CorpusReviewerAssignment)
                .filter(
                    CorpusReviewerAssignment.corpus_group_id == corpus_group_id,
                    CorpusReviewerAssignment.reviewer_group_id.in_(group_ids)
                )
                .first()
            )
            if not assignment:
                return {"code": 403, "data": [], "detail": "无权限访问该语料组"}

        # 查询包列表（逻辑与管理员相同）
        rec_sub = select(
            VoiceRecording.package_id,
            func.count(VoiceRecording.id).label('recorded_count')
        ).filter(VoiceRecording.status == "已提交").group_by(VoiceRecording.package_id).subquery()

        item_sub = select(
            CorpusPackageItem.package_id,
            func.count(CorpusPackageItem.id).label('total_count')
        ).group_by(CorpusPackageItem.package_id).subquery()

        CollectorAlias = aliased(User)
        q = session.query(
            CorpusPackage,
            CollectorAlias.username.label('collector_name'),
            CorpusGroup.name.label('corpus_group_name'),
            func.coalesce(rec_sub.c.recorded_count, 0).label('recorded_count'),
            func.coalesce(item_sub.c.total_count, 0).label('total_count'),
        ).outerjoin(CollectorAlias, CollectorAlias.id == CorpusPackage.claimed_by
        ).outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id
        ).outerjoin(rec_sub, rec_sub.c.package_id == CorpusPackage.id
        ).outerjoin(item_sub, item_sub.c.package_id == CorpusPackage.id
        )

        if review_status == "已打回":
            q = q.filter(CorpusPackage.review_status == "已打回")
        elif review_status == "已合格":
            q = q.filter(CorpusPackage.review_status == "已合格")
        else:
            q = q.filter(CorpusPackage.status == "已完成", CorpusPackage.review_status == "待审核")

        if corpus_group_id:
            q = q.filter(CorpusPackage.corpus_group_id == corpus_group_id)
        else:
            # 如果未指定语料组，只显示该审核员可访问的语料组的包
            authorized_corpus_groups = (
                session.query(CorpusReviewerAssignment.corpus_group_id)
                .filter(CorpusReviewerAssignment.reviewer_group_id.in_(group_ids))
                .all()
            )
            corpus_group_ids = [cg[0] for cg in authorized_corpus_groups]
            if corpus_group_ids:
                q = q.filter(CorpusPackage.corpus_group_id.in_(corpus_group_ids))
            else:
                return {"code": 200, "data": []}

        rows = q.order_by(CorpusPackage.id.desc()).all()
        result = []

        for row in rows:
            pkg = row.CorpusPackage
            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "review_status": pkg.review_status,
                "corpus_group_name": row.corpus_group_name or "",
                "collector_id": pkg.claimed_by,
                "collector_name": row.collector_name or "",
                "recorded_count": row.recorded_count,
                "total_count": row.total_count,
                "completed_at": pkg.created_at.strftime("%Y-%m-%d %H:%M"),
            })

        return {"code": 200, "data": result}


@app.get("/api/reviewer/package-detail/{package_id}")
def get_reviewer_package_detail(package_id: int, user_id: int = Query(...)):
    """获取包的详细信息（含所有语料和录音）"""
    with Session(engine) as session:
        # 权限检查：用户是否有权限查看该包
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusReviewerAssignment)
            .filter(
                CorpusReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusReviewerAssignment.reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        # 获取包内的语料和录音（只取最新的录音）
        # 使用子查询获取每个语料的最新录音ID
        latest_recording_subquery = (
            session.query(
                VoiceRecording.corpus_text_id,
                func.max(VoiceRecording.id).label('max_id')
            )
            .filter(VoiceRecording.package_id == package_id)
            .group_by(VoiceRecording.corpus_text_id)
            .subquery()
        )
        
        # 获取语料列表
        corpus_list = (
            session.query(CorpusText, PackageCorpusRejectionNote)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .outerjoin(PackageCorpusRejectionNote, PackageCorpusRejectionNote.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .all()
        )
        
        # 为每个语料获取最新录音
        result = []
        for corpus, rejection_note in corpus_list:
            # 查询该语料的最新录音
            recording = (
                session.query(VoiceRecording)
                .join(latest_recording_subquery, 
                      (VoiceRecording.corpus_text_id == latest_recording_subquery.c.corpus_text_id) &
                      (VoiceRecording.id == latest_recording_subquery.c.max_id))
                .filter(VoiceRecording.corpus_text_id == corpus.id)
                .first()
            )
            
            result.append({
                "id": corpus.id,
                "text_id": corpus.text_id,
                "content": corpus.content,
                "recording_id": recording.id if recording else None,
                "recording_file": recording.file_path if recording else None,
                "recorded_at": recording.recorded_at.isoformat() if recording else None,
                "annotated_text": recording.annotated_text if recording else None,
                "is_valid": recording.is_valid if recording else None,
                "annotation_note": recording.annotation_note if recording else None,
                "quality_note": recording.quality_note if recording else None,
                "was_rejected": rejection_note is not None,
                "rejection_note": rejection_note.note if rejection_note else None,
            })

        return {
            "code": 200,
            "data": {
                "package_id": pkg.id,
                "name": pkg.name,
                "review_status": pkg.review_status,
                "review_comment": pkg.review_comment,
                "corpus_list": result,
            }
        }


@app.get("/api/reviewer/download-recording/{recording_id}")
def reviewer_download_recording(recording_id: int, user_id: int = Query(...)):
    """获取录音预签名 URL"""
    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="录音不存在")

        # 权限检查
        pkg = session.query(CorpusPackage).filter_by(id=recording.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")
        
        # 检查采集审核员是否有权限访问这个包
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusReviewerAssignment)
            .filter(
                CorpusReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusReviewerAssignment.reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")
        
        # 检查包是否已被该审核员领取
        if pkg.review_claimed_by is not None and pkg.review_claimed_by != user_id:
            raise HTTPException(status_code=403, detail="该包已被其他审核员领取")

        # 生成预签名 URL
        if recording.file_path:
            try:
                url = storage_client.presigned_get_object(BUCKET_NAME, recording.file_path, expires=3600)
                return {"code": 200, "data": {"url": url, "filename": recording.file_path.split("/")[-1]}}
            except Exception as e:
                print(f"[下载录音] 生成预签名 URL 失败: {str(e)}")
                raise HTTPException(status_code=500, detail="生成下载链接失败")
        else:
            raise HTTPException(status_code=404, detail="录音文件不存在")


@app.post("/api/reviewer/claim-package")
def reviewer_claim_package(req: ReviewerClaimPackageRequest):
    """采集审核员领取待审核的包"""
    with Session(engine) as session:
        # 用 FOR UPDATE 锁定这一行，防止并发争用
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).with_for_update().first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")
        if pkg.review_status != "待审核":
            raise HTTPException(status_code=400, detail="该包不在待审核状态")
        if pkg.review_claimed_by is not None and pkg.review_claimed_by != req.user_id:
            raise HTTPException(status_code=409, detail="该包已被其他审核员领取")

        # 权限检查
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == req.user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]
        assignment = (
            session.query(CorpusReviewerAssignment)
            .filter(
                CorpusReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusReviewerAssignment.reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        pkg.review_claimed_by = req.user_id
        pkg.review_claimed_at = datetime.utcnow()
        session.commit()

    return {"code": 200, "msg": "领取成功"}


@app.post("/api/reviewer/review-package")
def reviewer_review_package(req: ReviewPackageRequest):
    """提交包的审核结果"""
    if req.review_status not in ["已合格", "已打回"]:
        raise HTTPException(status_code=400, detail="审核状态不合法")

    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        # 权限检查：用请求体中的 reviewer_id
        user_id = req.reviewer_id

        # 领取检查
        if pkg.review_claimed_by is not None and pkg.review_claimed_by != user_id:
            raise HTTPException(status_code=409, detail="该包已被其他审核员领取")

        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusReviewerAssignment)
            .filter(
                CorpusReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusReviewerAssignment.reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        # 执行审核逻辑（与管理员相同）
        pkg.review_status = req.review_status
        pkg.reviewed_by = user_id
        pkg.reviewed_at = datetime.utcnow()
        pkg.review_comment = req.review_comment or ""

        if req.review_status == "已合格":
            pkg.annotation_status = "待标注"
            collector = session.query(User).filter_by(id=pkg.claimed_by).first()
            if collector:
                pkg.collector_real_name = collector.real_name
                pkg.collector_gender    = collector.gender
                pkg.collector_age       = collector.age
                pkg.collector_hometown  = collector.hometown
                pkg.collector_city      = collector.city
        elif req.review_status == "已打回":
            if req.rejected_corpus_ids:
                for corpus_id in req.rejected_corpus_ids:
                    note = req.corpus_notes.get(corpus_id, "")
                    session.query(PackageCorpusRejectionNote).filter(
                        PackageCorpusRejectionNote.package_id == req.package_id,
                        PackageCorpusRejectionNote.corpus_text_id == corpus_id
                    ).delete()
                    rejection_note = PackageCorpusRejectionNote(
                        package_id=req.package_id,
                        corpus_text_id=corpus_id,
                        note=note
                    )
                    session.add(rejection_note)
                session.query(VoiceRecording).filter(
                    VoiceRecording.package_id == req.package_id,
                    VoiceRecording.corpus_text_id.in_(req.rejected_corpus_ids)
                ).delete(synchronize_session='fetch')
            else:
                session.query(VoiceRecording).filter_by(package_id=req.package_id).delete()

            if req.reject_to == "任务大厅":
                pkg.status = "未领取"
                pkg.claimed_by = None
                pkg.claimed_at = None
            else:
                pkg.status = "已领取"

        session.commit()

    return {
        "code": 200,
        "msg": f"审核完成：{req.review_status}",
        "review_status": req.review_status,
    }


# ── 质检审核员 API ────────────────────────────────────────────────────
@app.get("/api/quality-reviewer/corpus-groups")
def list_quality_reviewer_corpus_groups(user_id: int = Query(...)):
    """获取质检审核员可访问的语料组列表"""
    with Session(engine) as session:
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        if not group_ids:
            return {"code": 200, "data": []}

        corpus_groups = (
            session.query(CorpusGroup)
            .join(CorpusQualityReviewerAssignment, CorpusQualityReviewerAssignment.corpus_group_id == CorpusGroup.id)
            .filter(CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids))
            .order_by(CorpusGroup.id)
            .all()
        )

        result = [{"id": g.id, "name": g.name} for g in corpus_groups]
        return {"code": 200, "data": result}


@app.get("/api/quality-reviewer/package-submissions")
def list_quality_reviewer_package_submissions(user_id: int = Query(...), corpus_group_id: int | None = None, review_status: str | None = None):
    """获取质检审核员负责的包列表"""
    with Session(engine) as session:
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        if not group_ids:
            return {"code": 403, "data": [], "detail": "无权限"}

        if corpus_group_id:
            assignment = (
                session.query(CorpusQualityReviewerAssignment)
                .filter(
                    CorpusQualityReviewerAssignment.corpus_group_id == corpus_group_id,
                    CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
                )
                .first()
            )
            if not assignment:
                return {"code": 403, "data": [], "detail": "无权限访问该语料组"}

        rec_sub = select(
            VoiceRecording.package_id,
            func.count(VoiceRecording.id).label('recorded_count')
        ).filter(VoiceRecording.status == "已提交").group_by(VoiceRecording.package_id).subquery()

        item_sub = select(
            CorpusPackageItem.package_id,
            func.count(CorpusPackageItem.id).label('total_count')
        ).group_by(CorpusPackageItem.package_id).subquery()

        InspectorAlias = aliased(User)
        q = session.query(
            CorpusPackage,
            InspectorAlias.username.label('inspector_name'),
            CorpusGroup.name.label('corpus_group_name'),
            func.coalesce(rec_sub.c.recorded_count, 0).label('recorded_count'),
            func.coalesce(item_sub.c.total_count, 0).label('total_count'),
        ).outerjoin(InspectorAlias, InspectorAlias.id == CorpusPackage.quality_claimed_by
        ).outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id
        ).outerjoin(rec_sub, rec_sub.c.package_id == CorpusPackage.id
        ).outerjoin(item_sub, item_sub.c.package_id == CorpusPackage.id
        )

        if review_status:
            if review_status == "已打回":
                # 已打回的包：quality_status可能是"待质检"（被打回后回到质检员处）
                q = q.filter(
                    (CorpusPackage.quality_status == "已质检") |
                    (CorpusPackage.quality_review_status == "已打回")
                )
                q = q.filter(CorpusPackage.quality_review_status == "已打回")
            else:
                q = q.filter(CorpusPackage.quality_status == "已质检")
                q = q.filter(CorpusPackage.quality_review_status == review_status)
        else:
            q = q.filter(CorpusPackage.quality_status == "已质检")
            q = q.filter(CorpusPackage.quality_review_status == "待审核")

        if corpus_group_id:
            q = q.filter(CorpusPackage.corpus_group_id == corpus_group_id)
        else:
            authorized_corpus_groups = (
                session.query(CorpusQualityReviewerAssignment.corpus_group_id)
                .filter(CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids))
                .all()
            )
            corpus_group_ids = [cg[0] for cg in authorized_corpus_groups]
            if corpus_group_ids:
                q = q.filter(CorpusPackage.corpus_group_id.in_(corpus_group_ids))
            else:
                return {"code": 200, "data": []}

        rows = q.order_by(CorpusPackage.id.desc()).all()
        result = []

        for row in rows:
            pkg = row.CorpusPackage
            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "quality_status": pkg.quality_status,
                "quality_review_status": pkg.quality_review_status,
                "corpus_group_name": row.corpus_group_name or "",
                "inspector_name": row.inspector_name or "",
                "recorded_count": row.recorded_count,
                "total_count": row.total_count,
                "completed_at": pkg.created_at.strftime("%Y-%m-%d %H:%M"),
            })

        return {"code": 200, "data": result}


@app.get("/api/quality-reviewer/package-detail/{package_id}")
def get_quality_reviewer_package_detail(package_id: int, user_id: int = Query(...)):
    """获取包的详细信息（含所有语料、录音和标注质检信息）"""
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        # 获取包内的语料和录音（只取最新的录音）
        # 使用子查询获取每个语料的最新录音ID
        latest_recording_subquery = (
            session.query(
                VoiceRecording.corpus_text_id,
                func.max(VoiceRecording.id).label('max_id')
            )
            .filter(VoiceRecording.package_id == package_id)
            .group_by(VoiceRecording.corpus_text_id)
            .subquery()
        )
        
        # 获取语料列表
        corpus_list = (
            session.query(CorpusText, PackageCorpusRejectionNote)
            .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
            .outerjoin(PackageCorpusRejectionNote, PackageCorpusRejectionNote.corpus_text_id == CorpusText.id)
            .filter(CorpusPackageItem.package_id == package_id)
            .all()
        )
        
        # 为每个语料获取最新录音
        result = []
        for corpus, rejection_note in corpus_list:
            # 查询该语料的最新录音
            recording = (
                session.query(VoiceRecording)
                .join(latest_recording_subquery, 
                      (VoiceRecording.corpus_text_id == latest_recording_subquery.c.corpus_text_id) &
                      (VoiceRecording.id == latest_recording_subquery.c.max_id))
                .filter(VoiceRecording.corpus_text_id == corpus.id)
                .first()
            )
            
            result.append({
                "id": corpus.id,
                "text_id": corpus.text_id,
                "content": corpus.content,
                "recording_id": recording.id if recording else None,
                "recording_file": recording.file_path if recording else None,
                "recorded_at": recording.recorded_at.isoformat() if recording else None,
                "annotated_text": recording.annotated_text if recording else None,
                "is_valid": recording.is_valid if recording else None,
                "annotation_note": recording.annotation_note if recording else None,
                "quality_note": recording.quality_note if recording else None,
                "quality_review_action": recording.quality_review_action if recording else None,
                "quality_review_note": recording.quality_review_note if recording else None,
                "was_rejected": rejection_note is not None,
                "rejection_note": rejection_note.note if rejection_note else None,
            })

        return {
            "code": 200,
            "data": {
                "package_id": pkg.id,
                "name": pkg.name,
                "quality_status": pkg.quality_status,
                "quality_review_status": pkg.quality_review_status,
                "quality_review_comment": pkg.quality_review_result_comment,
                "corpus_list": result,
            }
        }


@app.get("/api/quality-reviewer/download-recording/{recording_id}")
def quality_reviewer_download_recording(recording_id: int, user_id: int = Query(...)):
    """质检审核员获取录音预签名 URL"""
    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="录音不存在")

        pkg = session.query(CorpusPackage).filter_by(id=recording.package_id).first()
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        if recording.file_path:
            try:
                url = storage_client.presigned_get_object(BUCKET_NAME, recording.file_path, expires=3600)
                return {"code": 200, "data": {"url": url, "filename": recording.file_path.split("/")[-1]}}
            except Exception as e:
                print(f"[质检审核下载录音] 生成预签名 URL 失败: {str(e)}")
                raise HTTPException(status_code=500, detail="生成下载链接失败")
        else:
            raise HTTPException(status_code=404, detail="录音文件不存在")


@app.post("/api/quality-reviewer/mark-item")
def quality_reviewer_mark_item(
    recording_id: int,
    user_id: int,
    action: str = "通过",
    note: str = "",
):
    """质检审核员标记单条语料（通过/打回）"""
    if action not in ["通过", "打回"]:
        raise HTTPException(status_code=400, detail="action 只能是'通过'或'打回'")

    with Session(engine) as session:
        recording = session.query(VoiceRecording).filter_by(id=recording_id).first()
        if not recording:
            raise HTTPException(status_code=404, detail="录音不存在")

        pkg = session.query(CorpusPackage).filter_by(id=recording.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        # 权限检查
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        # 更新标记
        recording.quality_review_action = action
        recording.quality_review_note = note.strip() if note else None
        session.commit()

        return {
            "code": 200,
            "msg": f"标记成功：{action}",
            "recording_id": recording_id,
            "action": action,
        }


@app.post("/api/quality-reviewer/review-package")
def quality_reviewer_review_package(req: QualityReviewPackageRequest):
    """质检审核员提交审核结果"""
    if req.review_status not in ["已合格", "已打回"]:
        raise HTTPException(status_code=400, detail="审核状态不合法")

    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=req.package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="包不存在")

        # 权限检查
        user_id = req.reviewer_id
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == pkg.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限")

        # 更新质检审核状态
        pkg.quality_review_status = req.review_status
        pkg.quality_reviewed_by = user_id
        pkg.quality_reviewed_at = datetime.utcnow()
        pkg.quality_review_result_comment = req.review_comment or ""

        if req.review_status == "已打回":
            # 打回：回到原质检员的"我的包"
            pkg.quality_status = "待质检"
            # 保留 quality_claimed_by，包直接回到原质检员
            # 清除被打回条目的标注标记（质检员需要重新检查这些条目）
            session.query(VoiceRecording).filter(
                VoiceRecording.package_id == req.package_id,
                VoiceRecording.quality_review_action == "打回"
            ).update({
                "annotated_by": None,
                "annotated_at": None,
                "inspected_by": None,
                "inspected_at": None,
            }, synchronize_session=False)
            # 清除通过条目的质检标记（质检员需要重新检查所有条目）
            session.query(VoiceRecording).filter(
                VoiceRecording.package_id == req.package_id,
                (VoiceRecording.quality_review_action == None) | (VoiceRecording.quality_review_action == "通过")
            ).update({
                "inspected_by": None,
                "inspected_at": None,
            }, synchronize_session=False)
            # 保留 quality_review_action 和 quality_review_note（质检员看到红色标记）

        session.commit()

    return {
        "code": 200,
        "msg": f"质检审核完成：{req.review_status}",
        "review_status": req.review_status,
    }


@app.post("/api/quality-reviewer/batch-approve-group")
def batch_approve_group(req: BatchApproveGroupRequest):
    """质检审核员整组合格：将指定语料组中所有待审核的包一次性标记为已合格"""
    with Session(engine) as session:
        # 权限检查
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == req.user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == req.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限访问该语料组")

        # 找到所有待审核的包
        pending_packages = (
            session.query(CorpusPackage)
            .filter(
                CorpusPackage.corpus_group_id == req.corpus_group_id,
                CorpusPackage.quality_review_status == "待审核",
            )
            .all()
        )

        if not pending_packages:
            raise HTTPException(status_code=400, detail="没有待审核的包")

        count = 0
        now = datetime.utcnow()
        for pkg in pending_packages:
            pkg.quality_review_status = "已合格"
            pkg.quality_reviewed_by = req.user_id
            pkg.quality_reviewed_at = now
            pkg.quality_review_result_comment = req.review_comment or ""
            count += 1

        session.commit()

    return {
        "code": 200,
        "msg": f"整组合格完成，共审核 {count} 个包",
        "approved_count": count,
    }


@app.post("/api/quality-reviewer/batch-reject-group")
def batch_reject_group(req: BatchRejectGroupRequest):
    """质检审核员整组打回：将指定语料组中所有待审核的包一次性打回，各自退回原质检员"""
    with Session(engine) as session:
        # 权限检查
        user_groups = (
            session.query(Group.id)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == req.user_id, Group.role_type == "quality_reviewer")
            .all()
        )
        group_ids = [g[0] for g in user_groups]

        assignment = (
            session.query(CorpusQualityReviewerAssignment)
            .filter(
                CorpusQualityReviewerAssignment.corpus_group_id == req.corpus_group_id,
                CorpusQualityReviewerAssignment.quality_reviewer_group_id.in_(group_ids)
            )
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=403, detail="无权限访问该语料组")

        # 找到所有待审核的包
        pending_packages = (
            session.query(CorpusPackage)
            .filter(
                CorpusPackage.corpus_group_id == req.corpus_group_id,
                CorpusPackage.quality_review_status == "待审核",
            )
            .all()
        )

        if not pending_packages:
            raise HTTPException(status_code=400, detail="没有待审核的包")

        count = 0
        now = datetime.utcnow()
        for pkg in pending_packages:
            pkg.quality_review_status = "已打回"
            pkg.quality_reviewed_by = req.user_id
            pkg.quality_reviewed_at = now
            pkg.quality_review_result_comment = req.review_comment or ""
            # 打回：回到原质检员
            pkg.quality_status = "待质检"
            # 保留 quality_claimed_by，包直接回到原质检员

            # 清除被打回条目的标注标记
            session.query(VoiceRecording).filter(
                VoiceRecording.package_id == pkg.id,
                VoiceRecording.quality_review_action == "打回"
            ).update({
                "annotated_by": None,
                "annotated_at": None,
                "inspected_by": None,
                "inspected_at": None,
            }, synchronize_session=False)
            # 清除通过条目的质检标记
            session.query(VoiceRecording).filter(
                VoiceRecording.package_id == pkg.id,
                (VoiceRecording.quality_review_action == None) | (VoiceRecording.quality_review_action == "通过")
            ).update({
                "inspected_by": None,
                "inspected_at": None,
            }, synchronize_session=False)

            count += 1

        session.commit()

    return {
        "code": 200,
        "msg": f"整组打回完成，共打回 {count} 个包，已退回各自原质检员",
        "rejected_count": count,
    }


def _ensure_minio_buckets():
    """确保存储服务中存在必要的bucket"""
    buckets_to_create = ["test", "agreements", "signatures"]
    for bucket in buckets_to_create:
        try:
            if not storage_client.bucket_exists(bucket):
                storage_client.make_bucket(bucket)
                print(f"[Storage] 创建bucket: {bucket}")
        except Exception as e:
            print(f"[Storage] bucket {bucket} 初始化失败: {e}")


def init_db():
    """初始化数据库，创建表并添加缺失列和索引"""
    Base.metadata.create_all(bind=engine)
    _ensure_minio_buckets()
    with Session(engine) as session:
        is_sqlite = str(engine.url).startswith("sqlite")

        # 需要确保存在的列: (表名, 列名, 列类型)
        columns_to_add = [
            ("voice_recordings", "duration_seconds", "INTEGER"),
            ("voice_recordings", "rejection_note", "VARCHAR(500)"),
        ]

        for table, column, col_type in columns_to_add:
            try:
                if is_sqlite:
                    result = session.execute(text(f"PRAGMA table_info({table})")).fetchall()
                    existing_cols = {row[1] for row in result}
                    if column not in existing_cols:
                        session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                        session.commit()
                        print(f"✓ 已添加 {table}.{column} 列")
                else:
                    result = session.execute(text(
                        f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                        f"WHERE TABLE_NAME='{table}' AND COLUMN_NAME='{column}'"
                    )).fetchall()
                    if not result:
                        session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
                        session.commit()
                        print(f"✓ 已添加 {table}.{column} 列")
            except Exception as e:
                print(f"列迁移 {table}.{column} 完成（可忽略）: {e}")

        # 创建性能优化索引
        try:
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_voice_recordings_collector ON voice_recordings(collector_id)"))
            session.execute(text("CREATE INDEX IF NOT EXISTS idx_voice_recordings_package_corpus ON voice_recordings(package_id, corpus_text_id, collector_id)"))
            if not is_sqlite:
                session.execute(text("CREATE INDEX IF NOT EXISTS idx_corpus_package_claimed ON corpus_packages(claimed_by)"))
            session.commit()
            print("✓ 已创建性能优化索引")
        except Exception as e:
            print(f"索引创建完成（可忽略）: {e}")



init_db()


# ── 统计 API ────────────────────────────────────────────────────────
@app.get("/api/admin/statistics")
@limiter.limit("30/minute")
def get_admin_statistics(request: Request, user_id: int,
    start_date: str | None = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="结束日期 (YYYY-MM-DD)")):
    """获取管理员统计信息（每个用户的详细统计）"""
    try:
        with Session(engine) as session:
            # 验证用户是管理员或二级管理员
            user = session.query(User).filter_by(id=user_id).first()
            if not user or user.role not in ('manager', 'sub_manager'):
                raise HTTPException(status_code=403, detail="无权限")

            # 日期过滤条件
            start_dt = datetime.strptime(start_date, "%Y-%m-%d") if start_date else None
            end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1) if end_date else None

            # ── 采集员统计 ──
            pkg_sub_q = select(
                CorpusPackage.claimed_by.label('uid'),
                func.count(CorpusPackage.id).label('pkg_cnt')
            ).where(CorpusPackage.status == "已完成")
            if start_dt:
                pkg_sub_q = pkg_sub_q.where(CorpusPackage.claimed_at >= start_dt)
            if end_dt:
                pkg_sub_q = pkg_sub_q.where(CorpusPackage.claimed_at <= end_dt)
            pkg_sub = pkg_sub_q.group_by(CorpusPackage.claimed_by).subquery()

            rec_sub_q = select(
                VoiceRecording.collector_id.label('uid'),
                func.count(VoiceRecording.id).label('rec_cnt'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
            ).where(
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                rec_sub_q = rec_sub_q.where(VoiceRecording.submitted_at >= start_dt)
            if end_dt:
                rec_sub_q = rec_sub_q.where(VoiceRecording.submitted_at <= end_dt)
            rec_sub = rec_sub_q.group_by(VoiceRecording.collector_id).subquery()

            approved_rec_sub_q = select(
                VoiceRecording.collector_id.label('uid'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('approved_dur')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.review_status == "已合格",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                approved_rec_sub_q = approved_rec_sub_q.where(VoiceRecording.submitted_at >= start_dt)
            if end_dt:
                approved_rec_sub_q = approved_rec_sub_q.where(VoiceRecording.submitted_at <= end_dt)
            approved_rec_sub = approved_rec_sub_q.group_by(VoiceRecording.collector_id).subquery()

            # 无效条数（包括被判定为无效、空录音或无文本录音）
            invalid_rec_sub_q = select(
                VoiceRecording.collector_id.label('uid'),
                func.count(VoiceRecording.id).label('invalid_cnt')
            ).where(
                or_(
                    VoiceRecording.is_valid == 0,
                    VoiceRecording.file_path.is_(None),
                    VoiceRecording.file_path == "",
                    VoiceRecording.annotated_text.is_(None),
                    VoiceRecording.annotated_text == ""
                )
            )
            if start_dt:
                invalid_rec_sub_q = invalid_rec_sub_q.where(VoiceRecording.submitted_at >= start_dt)
            if end_dt:
                invalid_rec_sub_q = invalid_rec_sub_q.where(VoiceRecording.submitted_at <= end_dt)
            invalid_rec_sub = invalid_rec_sub_q.group_by(VoiceRecording.collector_id).subquery()

            rows = (
                session.query(
                    User.id, User.username, User.real_name,
                    func.coalesce(pkg_sub.c.pkg_cnt, 0),
                    func.coalesce(rec_sub.c.rec_cnt, 0),
                    func.coalesce(rec_sub.c.dur, 0),
                    func.coalesce(approved_rec_sub.c.approved_dur, 0),
                    func.coalesce(invalid_rec_sub.c.invalid_cnt, 0),
                )
                .filter(User.role == 'collector')
                .outerjoin(pkg_sub, pkg_sub.c.uid == User.id)
                .outerjoin(rec_sub, rec_sub.c.uid == User.id)
                .outerjoin(approved_rec_sub, approved_rec_sub.c.uid == User.id)
                .outerjoin(invalid_rec_sub, invalid_rec_sub.c.uid == User.id)
                .all()
            )
            collector_ids = [r[0] for r in rows]
            group_map = {}
            if collector_ids:
                gm_rows = (
                    session.query(GroupMember.user_id, Group.name)
                    .join(Group, Group.id == GroupMember.group_id)
                    .filter(GroupMember.user_id.in_(collector_ids), Group.role_type == 'collector')
                    .all()
                )
                for uid, gname in gm_rows:
                    group_map.setdefault(uid, []).append(gname)
            collector_stats = [
                {"id": r[0], "username": r[1], "real_name": r[2], "packages": r[3],
                 "corpus_count": r[4], "total_duration_seconds": int(r[5]),
                 "approved_duration_seconds": int(r[6]),
                 "invalid_count": int(r[7]),
                 "valid_count": r[4],
                 "group_names": group_map.get(r[0], [])}
                for r in rows
            ]

            # ── 标注员统计 ──
            ann_pkg_sub_q = select(
                CorpusPackage.annotation_claimed_by.label('uid'),
                func.count(CorpusPackage.id).label('pkg_cnt')
            ).where(CorpusPackage.annotation_status == "已标注")
            if start_dt:
                ann_pkg_sub_q = ann_pkg_sub_q.where(CorpusPackage.annotation_claimed_at >= start_dt)
            if end_dt:
                ann_pkg_sub_q = ann_pkg_sub_q.where(CorpusPackage.annotation_claimed_at <= end_dt)
            ann_pkg_sub = ann_pkg_sub_q.group_by(CorpusPackage.annotation_claimed_by).subquery()

            ann_rec_sub_q = select(
                VoiceRecording.annotated_by.label('uid'),
                func.count(VoiceRecording.id).label('rec_cnt'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.annotation_status == "已标注",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                ann_rec_sub_q = ann_rec_sub_q.where(VoiceRecording.annotated_at >= start_dt)
            if end_dt:
                ann_rec_sub_q = ann_rec_sub_q.where(VoiceRecording.annotated_at <= end_dt)
            ann_rec_sub = ann_rec_sub_q.group_by(VoiceRecording.annotated_by).subquery()

            ann_approved_rec_sub_q = select(
                VoiceRecording.annotated_by.label('uid'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('approved_dur')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.quality_review_status == "已合格",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                ann_approved_rec_sub_q = ann_approved_rec_sub_q.where(VoiceRecording.annotated_at >= start_dt)
            if end_dt:
                ann_approved_rec_sub_q = ann_approved_rec_sub_q.where(VoiceRecording.annotated_at <= end_dt)
            ann_approved_rec_sub = ann_approved_rec_sub_q.group_by(VoiceRecording.annotated_by).subquery()

            # 无效条数
            ann_invalid_rec_sub_q = select(
                VoiceRecording.annotated_by.label('uid'),
                func.count(VoiceRecording.id).label('invalid_cnt')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.annotation_status == "已标注",
                or_(
                    VoiceRecording.is_valid == 0,
                    VoiceRecording.file_path.is_(None),
                    VoiceRecording.file_path == "",
                    VoiceRecording.annotated_text.is_(None),
                    VoiceRecording.annotated_text == ""
                )
            )
            if start_dt:
                ann_invalid_rec_sub_q = ann_invalid_rec_sub_q.where(VoiceRecording.annotated_at >= start_dt)
            if end_dt:
                ann_invalid_rec_sub_q = ann_invalid_rec_sub_q.where(VoiceRecording.annotated_at <= end_dt)
            ann_invalid_rec_sub = ann_invalid_rec_sub_q.group_by(VoiceRecording.annotated_by).subquery()

            ann_rows = (
                session.query(
                    User.id, User.username, User.real_name,
                    func.coalesce(ann_pkg_sub.c.pkg_cnt, 0),
                    func.coalesce(ann_rec_sub.c.rec_cnt, 0),
                    func.coalesce(ann_rec_sub.c.dur, 0),
                    func.coalesce(ann_approved_rec_sub.c.approved_dur, 0),
                    func.coalesce(ann_invalid_rec_sub.c.invalid_cnt, 0),
                )
                .filter(User.role == 'annotator')
                .outerjoin(ann_pkg_sub, ann_pkg_sub.c.uid == User.id)
                .outerjoin(ann_rec_sub, ann_rec_sub.c.uid == User.id)
                .outerjoin(ann_approved_rec_sub, ann_approved_rec_sub.c.uid == User.id)
                .outerjoin(ann_invalid_rec_sub, ann_invalid_rec_sub.c.uid == User.id)
                .all()
            )
            annotator_ids = [r[0] for r in ann_rows]
            ann_group_map = {}
            if annotator_ids:
                gm_rows = (
                    session.query(GroupMember.user_id, Group.name)
                    .join(Group, Group.id == GroupMember.group_id)
                    .filter(GroupMember.user_id.in_(annotator_ids), Group.role_type == 'annotator')
                    .all()
                )
                for uid, gname in gm_rows:
                    ann_group_map.setdefault(uid, []).append(gname)
            annotator_stats = [
                {"id": r[0], "username": r[1], "real_name": r[2], "packages": r[3],
                 "corpus_count": r[4], "total_duration_seconds": int(r[5]),
                 "approved_duration_seconds": int(r[6]),
                 "invalid_count": int(r[7]),
                 "valid_count": r[4],
                 "group_names": ann_group_map.get(r[0], [])}
                for r in ann_rows
            ]

            # ── 质检员统计 ──
            insp_pkg_sub_q = select(
                CorpusPackage.quality_claimed_by.label('uid'),
                func.count(CorpusPackage.id).label('pkg_cnt')
            ).where(CorpusPackage.quality_status == "已质检")
            if start_dt:
                insp_pkg_sub_q = insp_pkg_sub_q.where(CorpusPackage.quality_claimed_at >= start_dt)
            if end_dt:
                insp_pkg_sub_q = insp_pkg_sub_q.where(CorpusPackage.quality_claimed_at <= end_dt)
            insp_pkg_sub = insp_pkg_sub_q.group_by(CorpusPackage.quality_claimed_by).subquery()

            insp_rec_sub_q = select(
                VoiceRecording.inspected_by.label('uid'),
                func.count(VoiceRecording.id).label('rec_cnt'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.quality_status == "已质检",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                insp_rec_sub_q = insp_rec_sub_q.where(VoiceRecording.inspected_at >= start_dt)
            if end_dt:
                insp_rec_sub_q = insp_rec_sub_q.where(VoiceRecording.inspected_at <= end_dt)
            insp_rec_sub = insp_rec_sub_q.group_by(VoiceRecording.inspected_by).subquery()

            insp_approved_rec_sub_q = select(
                VoiceRecording.inspected_by.label('uid'),
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('approved_dur')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.quality_review_status == "已合格",
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            if start_dt:
                insp_approved_rec_sub_q = insp_approved_rec_sub_q.where(VoiceRecording.inspected_at >= start_dt)
            if end_dt:
                insp_approved_rec_sub_q = insp_approved_rec_sub_q.where(VoiceRecording.inspected_at <= end_dt)
            insp_approved_rec_sub = insp_approved_rec_sub_q.group_by(VoiceRecording.inspected_by).subquery()

            # 无效条数
            insp_invalid_rec_sub_q = select(
                VoiceRecording.inspected_by.label('uid'),
                func.count(VoiceRecording.id).label('invalid_cnt')
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).where(
                CorpusPackage.quality_status == "已质检",
                or_(
                    VoiceRecording.is_valid == 0,
                    VoiceRecording.file_path.is_(None),
                    VoiceRecording.file_path == "",
                    VoiceRecording.annotated_text.is_(None),
                    VoiceRecording.annotated_text == ""
                )
            )
            if start_dt:
                insp_invalid_rec_sub_q = insp_invalid_rec_sub_q.where(VoiceRecording.inspected_at >= start_dt)
            if end_dt:
                insp_invalid_rec_sub_q = insp_invalid_rec_sub_q.where(VoiceRecording.inspected_at <= end_dt)
            insp_invalid_rec_sub = insp_invalid_rec_sub_q.group_by(VoiceRecording.inspected_by).subquery()

            insp_rows = (
                session.query(
                    User.id, User.username, User.real_name,
                    func.coalesce(insp_pkg_sub.c.pkg_cnt, 0),
                    func.coalesce(insp_rec_sub.c.rec_cnt, 0),
                    func.coalesce(insp_rec_sub.c.dur, 0),
                    func.coalesce(insp_approved_rec_sub.c.approved_dur, 0),
                    func.coalesce(insp_invalid_rec_sub.c.invalid_cnt, 0),
                )
                .filter(User.role == 'inspector')
                .outerjoin(insp_pkg_sub, insp_pkg_sub.c.uid == User.id)
                .outerjoin(insp_rec_sub, insp_rec_sub.c.uid == User.id)
                .outerjoin(insp_approved_rec_sub, insp_approved_rec_sub.c.uid == User.id)
                .outerjoin(insp_invalid_rec_sub, insp_invalid_rec_sub.c.uid == User.id)
                .all()
            )
            insp_ids = [r[0] for r in insp_rows]
            insp_group_map = {}
            if insp_ids:
                gm_rows = (
                    session.query(GroupMember.user_id, Group.name)
                    .join(Group, Group.id == GroupMember.group_id)
                    .filter(GroupMember.user_id.in_(insp_ids), Group.role_type == 'inspector')
                    .all()
                )
                for uid, gname in gm_rows:
                    insp_group_map.setdefault(uid, []).append(gname)
            inspector_stats = [
                {"id": r[0], "username": r[1], "real_name": r[2], "packages": r[3],
                 "corpus_count": r[4], "total_duration_seconds": int(r[5]),
                 "approved_duration_seconds": int(r[6]),
                 "invalid_count": int(r[7]),
                 "valid_count": r[4],
                 "group_names": insp_group_map.get(r[0], [])}
                for r in insp_rows
            ]

            return {
                "code": 200,
                "data": {
                    "collectors": collector_stats,
                    "annotators": annotator_stats,
                    "inspectors": inspector_stats
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/reviewer-stats")
def get_reviewer_stats(
    user_id: int,
    reviewer_ids: str = Query(None, description="审核员ID列表（逗号分隔）"),
    start_date: str = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str = Query(None, description="结束日期 (YYYY-MM-DD)"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """获取审核员作业统计（采集审核员和质检审核员）"""
    try:
        with Session(engine) as session:
            # 验证用户是管理员或二级管理员
            user = session.query(User).filter_by(id=user_id).first()
            if not user or user.role not in ('manager', 'sub_manager'):
                raise HTTPException(status_code=403, detail="无权限")

            # 构建基础查询条件
            conditions = []
            
            # 筛选审核员
            reviewer_id_list = []
            if reviewer_ids:
                reviewer_id_list = [int(id.strip()) for id in reviewer_ids.split(',') if id.strip()]
            
            # 筛选日期范围
            date_conditions = []
            if start_date:
                try:
                    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
                    date_conditions.append(CorpusPackage.review_claimed_at >= start_dt)
                except ValueError:
                    raise HTTPException(status_code=400, detail="开始日期格式错误")
            
            if end_date:
                try:
                    end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
                    date_conditions.append(CorpusPackage.review_claimed_at <= end_dt)
                except ValueError:
                    raise HTTPException(status_code=400, detail="结束日期格式错误")

            # 采集审核员统计 - 使用批量查询
            collector_reviewer_stats = []
            collector_reviewers = session.query(User).filter_by(role='reviewer').all()
            
            if collector_reviewers:
                reviewer_ids = [r.id for r in collector_reviewers]
                if reviewer_id_list:
                    reviewer_ids = [rid for rid in reviewer_ids if rid in reviewer_id_list]
                
                if reviewer_ids:
                    # 批量查询：包数
                    pkg_cnt_map = dict(
                        session.query(CorpusPackage.review_claimed_by, func.count(CorpusPackage.id))
                        .filter(CorpusPackage.review_claimed_by.in_(reviewer_ids))
                        .group_by(CorpusPackage.review_claimed_by).all()
                    )
                    
                    # 批量查询：语料条数
                    rec_cnt_map = dict(
                        session.query(CorpusPackage.review_claimed_by, func.count(VoiceRecording.id))
                        .join(VoiceRecording, VoiceRecording.package_id == CorpusPackage.id)
                        .filter(
                            CorpusPackage.review_claimed_by.in_(reviewer_ids),
                            VoiceRecording.file_path.isnot(None),
                            VoiceRecording.file_path != "",
                            VoiceRecording.annotated_text.isnot(None),
                            VoiceRecording.annotated_text != "",
                            or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                        )
                        .group_by(CorpusPackage.review_claimed_by).all()
                    )
                    
                    # 批量查询：今日作业量
                    today = datetime.now().date()
                    today_cnt_map = dict(
                        session.query(CorpusPackage.review_claimed_by, func.count(CorpusPackage.id))
                        .filter(
                            CorpusPackage.review_claimed_by.in_(reviewer_ids),
                            func.date(CorpusPackage.review_claimed_at) == today
                        )
                        .group_by(CorpusPackage.review_claimed_by).all()
                    )
                    
                    # 批量查询：组名
                    group_names_map = {}
                    gm_rows = (
                        session.query(GroupMember.user_id, Group.name)
                        .join(Group, Group.id == GroupMember.group_id)
                        .filter(GroupMember.user_id.in_(reviewer_ids), Group.role_type == 'reviewer')
                        .all()
                    )
                    for uid, gname in gm_rows:
                        group_names_map.setdefault(uid, []).append(gname)
                    
                    for reviewer in collector_reviewers:
                        if reviewer_id_list and reviewer.id not in reviewer_id_list:
                            continue
                        collector_reviewer_stats.append({
                            "id": reviewer.id,
                            "username": reviewer.username,
                            "packages": pkg_cnt_map.get(reviewer.id, 0),
                            "corpus_count": rec_cnt_map.get(reviewer.id, 0),
                            "today_count": today_cnt_map.get(reviewer.id, 0),
                            "group_names": group_names_map.get(reviewer.id, [])
                        })

            # 质检审核员统计 - 使用批量查询
            quality_reviewer_stats = []
            quality_reviewers = session.query(User).filter_by(role='quality_reviewer').all()
            
            if quality_reviewers:
                reviewer_ids = [r.id for r in quality_reviewers]
                if reviewer_id_list:
                    reviewer_ids = [rid for rid in reviewer_ids if rid in reviewer_id_list]
                
                if reviewer_ids:
                    # 批量查询：包数
                    pkg_cnt_map = dict(
                        session.query(CorpusPackage.quality_review_claimed_by, func.count(CorpusPackage.id))
                        .filter(CorpusPackage.quality_review_claimed_by.in_(reviewer_ids))
                        .group_by(CorpusPackage.quality_review_claimed_by).all()
                    )
                    
                    # 批量查询：语料条数
                    rec_cnt_map = dict(
                        session.query(CorpusPackage.quality_review_claimed_by, func.count(VoiceRecording.id))
                        .join(VoiceRecording, VoiceRecording.package_id == CorpusPackage.id)
                        .filter(
                            CorpusPackage.quality_review_claimed_by.in_(reviewer_ids),
                            VoiceRecording.file_path.isnot(None),
                            VoiceRecording.file_path != "",
                            VoiceRecording.annotated_text.isnot(None),
                            VoiceRecording.annotated_text != "",
                            or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                        )
                        .group_by(CorpusPackage.quality_review_claimed_by).all()
                    )
                    
                    # 批量查询：今日作业量
                    today_cnt_map = dict(
                        session.query(CorpusPackage.quality_review_claimed_by, func.count(CorpusPackage.id))
                        .filter(
                            CorpusPackage.quality_review_claimed_by.in_(reviewer_ids),
                            func.date(CorpusPackage.quality_review_claimed_at) == today
                        )
                        .group_by(CorpusPackage.quality_review_claimed_by).all()
                    )
                    
                    # 批量查询：组名
                    group_names_map = {}
                    gm_rows = (
                        session.query(GroupMember.user_id, Group.name)
                        .join(Group, Group.id == GroupMember.group_id)
                        .filter(GroupMember.user_id.in_(reviewer_ids), Group.role_type == 'quality_reviewer')
                        .all()
                    )
                    for uid, gname in gm_rows:
                        group_names_map.setdefault(uid, []).append(gname)
                    
                    for reviewer in quality_reviewers:
                        if reviewer_id_list and reviewer.id not in reviewer_id_list:
                            continue
                        quality_reviewer_stats.append({
                            "id": reviewer.id,
                            "username": reviewer.username,
                            "packages": pkg_cnt_map.get(reviewer.id, 0),
                            "corpus_count": rec_cnt_map.get(reviewer.id, 0),
                            "today_count": today_cnt_map.get(reviewer.id, 0),
                            "group_names": group_names_map.get(reviewer.id, [])
                        })

            # 合并所有审核员数据并分页
            all_reviewers = collector_reviewer_stats + quality_reviewer_stats
            
            # 按包数排序（降序）
            all_reviewers.sort(key=lambda x: x["packages"], reverse=True)
            
            # 分页
            total = len(all_reviewers)
            paged_reviewers = all_reviewers[offset:offset + limit]

            return {
                "code": 200,
                "data": {
                    "reviewers": paged_reviewers,
                    "total": total
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/daily-work")
def get_daily_work(user_id: int, date: str, role: str = "collector", start_hour: int = None, end_hour: int = None):
    """获取指定日期的作业统计（支持多用户筛选）"""
    try:
        with Session(engine) as session:
            # 验证用户是管理员或二级管理员
            user = session.query(User).filter_by(id=user_id).first()
            if not user or user.role not in ('manager', 'sub_manager'):
                raise HTTPException(status_code=403, detail="无权限")

            # 解析日期
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=400, detail="日期格式错误，应为 YYYY-MM-DD")

            # 构建时间范围过滤条件
            time_filters = {}
            if start_hour is not None and end_hour is not None and start_hour <= end_hour:
                time_filters['start_hour'] = start_hour
                time_filters['end_hour'] = end_hour

            # 根据角色统计
            if role == "collector":
                # 采集员：统计当天提交的录音
                base_where = [
                    func.date(VoiceRecording.submitted_at) == target_date,
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                ]
                if time_filters:
                    base_where.append(extract('hour', VoiceRecording.submitted_at) >= time_filters['start_hour'])
                    base_where.append(extract('hour', VoiceRecording.submitted_at) < time_filters['end_hour'])

                rec_sub = select(
                    VoiceRecording.collector_id.label('uid'),
                    func.count(VoiceRecording.id).label('rec_cnt'),
                    func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
                ).where(*base_where).group_by(VoiceRecording.collector_id).subquery()

                rows = (
                    session.query(
                        User.id, User.username, User.real_name,
                        func.coalesce(rec_sub.c.rec_cnt, 0),
                        func.coalesce(rec_sub.c.dur, 0),
                    )
                    .filter(User.role == 'collector')
                    .outerjoin(rec_sub, rec_sub.c.uid == User.id)
                    .all()
                )

                # 获取每个采集员的组名
                collector_ids = [r[0] for r in rows]
                group_map = {}
                if collector_ids:
                    gm_rows = (
                        session.query(GroupMember.user_id, Group.name)
                        .join(Group, Group.id == GroupMember.group_id)
                        .filter(GroupMember.user_id.in_(collector_ids), Group.role_type == 'collector')
                        .all()
                    )
                    for uid, gname in gm_rows:
                        group_map.setdefault(uid, []).append(gname)

                result = [
                    {
                        "id": r[0],
                        "username": r[1],
                        "real_name": r[2],
                        "packages": 0,  # 采集员不统计包数
                        "corpus_count": r[3],
                        "total_duration_seconds": int(r[4]),
                        "group_names": group_map.get(r[0], [])
                    }
                    for r in rows
                ]

            elif role == "annotator":
                # 标注员：统计当天标注的语料
                ann_base_where = [
                    func.date(VoiceRecording.annotated_at) == target_date,
                    CorpusPackage.annotation_status == "已标注",
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                ]
                if time_filters:
                    ann_base_where.append(extract('hour', VoiceRecording.annotated_at) >= time_filters['start_hour'])
                    ann_base_where.append(extract('hour', VoiceRecording.annotated_at) < time_filters['end_hour'])

                ann_rec_sub = select(
                    VoiceRecording.annotated_by.label('uid'),
                    func.count(VoiceRecording.id).label('rec_cnt'),
                    func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
                ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
                ).where(*ann_base_where).group_by(VoiceRecording.annotated_by).subquery()

                annotators = session.query(User).filter_by(role='annotator').all()
                annotator_ids = [a.id for a in annotators]
                ann_group_map = {}
                if annotator_ids:
                    gm_rows = (
                        session.query(GroupMember.user_id, Group.name)
                        .join(Group, Group.id == GroupMember.group_id)
                        .filter(GroupMember.user_id.in_(annotator_ids), Group.role_type == 'annotator')
                        .all()
                    )
                    for uid, gname in gm_rows:
                        ann_group_map.setdefault(uid, []).append(gname)

                # 批量查询：直接JOIN子查询，避免N+1
                ann_rows = session.query(ann_rec_sub.c.uid, ann_rec_sub.c.rec_cnt, ann_rec_sub.c.dur).all() if annotator_ids else []
                ann_data = {row[0]: (row[1], row[2]) for row in ann_rows}
                
                result = []
                for annotator in annotators:
                    data = ann_data.get(annotator.id, (0, 0))
                    rec_cnt = data[0] if isinstance(data, tuple) else data
                    dur = data[1] if isinstance(data, tuple) else 0
                    result.append({
                        "id": annotator.id,
                        "username": annotator.username,
                        "real_name": annotator.real_name,
                        "packages": 0,
                        "corpus_count": rec_cnt or 0,
                        "total_duration_seconds": int(dur or 0),
                        "group_names": ann_group_map.get(annotator.id, [])
                    })

            elif role == "inspector":
                # 质检员：统计当天质检的语料
                insp_base_where = [
                    func.date(VoiceRecording.inspected_at) == target_date,
                    CorpusPackage.quality_status == "已质检",
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
                ]
                if time_filters:
                    insp_base_where.append(extract('hour', VoiceRecording.inspected_at) >= time_filters['start_hour'])
                    insp_base_where.append(extract('hour', VoiceRecording.inspected_at) < time_filters['end_hour'])

                insp_rec_sub = select(
                    VoiceRecording.inspected_by.label('uid'),
                    func.count(VoiceRecording.id).label('rec_cnt'),
                    func.coalesce(func.sum(VoiceRecording.duration_seconds), 0).label('dur')
                ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
                ).where(*insp_base_where).group_by(VoiceRecording.inspected_by).subquery()

                inspectors = session.query(User).filter_by(role='inspector').all()
                insp_ids = [i.id for i in inspectors]
                insp_group_map = {}
                if insp_ids:
                    gm_rows = (
                        session.query(GroupMember.user_id, Group.name)
                        .join(Group, Group.id == GroupMember.group_id)
                        .filter(GroupMember.user_id.in_(insp_ids), Group.role_type == 'inspector')
                        .all()
                    )
                    for uid, gname in gm_rows:
                        insp_group_map.setdefault(uid, []).append(gname)

                # 批量查询：直接JOIN子查询，避免N+1
                insp_rows = session.query(insp_rec_sub.c.uid, insp_rec_sub.c.rec_cnt, insp_rec_sub.c.dur).all() if insp_ids else []
                insp_data = {row[0]: (row[1], row[2]) for row in insp_rows}
                
                result = []
                for inspector in inspectors:
                    data = insp_data.get(inspector.id, (0, 0))
                    rec_cnt = data[0] if isinstance(data, tuple) else data
                    dur = data[1] if isinstance(data, tuple) else 0
                    result.append({
                        "id": inspector.id,
                        "username": inspector.username,
                        "real_name": inspector.real_name,
                        "packages": 0,
                        "corpus_count": rec_cnt or 0,
                        "total_duration_seconds": int(dur or 0),
                        "group_names": insp_group_map.get(inspector.id, [])
                    })
            else:
                raise HTTPException(status_code=400, detail="角色不支持，可选: collector, annotator, inspector")

            return {"code": 200, "data": result, "date": date, "role": role}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/collector/statistics")
def get_collector_statistics(user_id: int):
    """获取采集员个人统计信息"""
    try:
        with Session(engine) as session:
            user = session.query(User).filter_by(id=user_id).first()
            if not user:
                raise HTTPException(status_code=404, detail="用户不存在")

            packages = session.query(CorpusPackage).filter_by(claimed_by=user_id).count()
            completed_packages = session.query(CorpusPackage).filter_by(claimed_by=user_id, status="已完成").count()
            corpus_count = session.query(VoiceRecording).filter_by(collector_id=user_id).count()
            duration = session.query(
                func.coalesce(func.sum(VoiceRecording.duration_seconds), 0)
            ).filter(VoiceRecording.collector_id == user_id).scalar() or 0

            # 采集审核通过的包数和时长（只统计未被标记无效的录音）
            approved_packages = session.query(CorpusPackage).filter_by(
                claimed_by=user_id, review_status="已合格"
            ).count()
            approved_duration = session.query(
                func.sum(VoiceRecording.duration_seconds)
            ).join(CorpusPackage, CorpusPackage.id == VoiceRecording.package_id
            ).filter(
                VoiceRecording.collector_id == user_id,
                CorpusPackage.review_status == "已合格",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            ).scalar() or 0

            # 无效条数
            invalid_count = session.query(
                func.count(VoiceRecording.id)
            ).filter(
                VoiceRecording.collector_id == user_id,
                VoiceRecording.is_valid == 0
            ).scalar() or 0

            return {
                "code": 200,
                "data": {
                    "packages": packages,
                    "completed_packages": completed_packages,
                    "corpus_count": corpus_count,
                    "total_duration_seconds": int(duration),
                    "approved_packages": approved_packages,
                    "approved_duration_seconds": int(approved_duration),
                    "invalid_count": int(invalid_count),
                    "valid_count": int(corpus_count) - int(invalid_count)
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[错误] 采集员统计失败: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))






# ── 修复工具 ────────────────────────────────────────────────────────
@app.post("/api/admin/fix-annotation-status")
def fix_annotation_status():
    """修复所有已完成但状态未更新的标注包"""
    fixed = 0
    with Session(engine) as session:
        # 找出所有annotation_status不是"已标注"的包
        packages = session.query(CorpusPackage).filter(
            CorpusPackage.annotation_status != "已标注",
            CorpusPackage.annotation_status != "未分配"
        ).all()

        for pkg in packages:
            # 统计该包的标注完成情况
            total_corpus = session.query(CorpusPackageItem).filter_by(package_id=pkg.id).count()
            completed_annotations = session.query(VoiceRecording).filter_by(
                package_id=pkg.id
            ).filter(VoiceRecording.annotated_by.isnot(None)).count()

            # 如果所有语料都已标注，更新包的状态
            if total_corpus > 0 and completed_annotations >= total_corpus:
                pkg.annotation_status = "已标注"
                fixed += 1
                print(f"[修复] 包 {pkg.id} ({pkg.name}) 状态已更新为已标注")

        session.commit()

    return {
        "code": 200,
        "msg": f"修复完成，更新了 {fixed} 个包的状态",
        "fixed": fixed
    }


@app.post("/api/admin/fix-inspection-status")
def fix_inspection_status():
    """修复所有已完成但状态未更新的质检包"""
    fixed = 0
    with Session(engine) as session:
        # 找出所有quality_status不是"已质检"的包
        packages = session.query(CorpusPackage).filter(
            CorpusPackage.quality_status != "已质检",
            CorpusPackage.quality_status != "未分配"
        ).all()

        for pkg in packages:
            # 统计该包的质检完成情况
            total_corpus = session.query(CorpusPackageItem).filter_by(package_id=pkg.id).count()
            completed_inspections = session.query(VoiceRecording).filter_by(
                package_id=pkg.id
            ).filter(VoiceRecording.inspected_by.isnot(None)).count()

            # 如果所有语料都已质检，更新包的状态
            if total_corpus > 0 and completed_inspections >= total_corpus:
                pkg.quality_status = "已质检"
                pkg.quality_review_status = "待审核"
                fixed += 1
                print(f"[修复] 包 {pkg.id} ({pkg.name}) 质检状态已更新为已质检")

        session.commit()

    return {
        "code": 200,
        "msg": f"修复完成，更新了 {fixed} 个包的质检状态",
        "fixed": fixed
    }


@app.post("/api/admin/fix-package-group-mismatch")
def fix_package_group_mismatch():
    """修复所有包与语料文本之间的语料组ID不一致"""
    fixed = 0
    with Session(engine) as session:
        # 获取所有包的ID和对应的语料组ID
        packages = session.query(CorpusPackage.id, CorpusPackage.corpus_group_id).all()
        for pkg_id, group_id in packages:
            # 找到这个包下的所有文本，如果文本的组ID和包的组ID不一致，进行更新
            mismatched_texts = (
                session.query(CorpusText)
                .join(CorpusPackageItem, CorpusPackageItem.corpus_text_id == CorpusText.id)
                .filter(
                    CorpusPackageItem.package_id == pkg_id,
                    CorpusText.corpus_group_id != group_id
                )
                .all()
            )
            for text_obj in mismatched_texts:
                text_obj.corpus_group_id = group_id
                fixed += 1
        
        session.commit()
    return {"code": 200, "msg": f"修复完成，更新了 {fixed} 条文本的语料组绑定"}



# ── MinIO 预签名上传 ───────────────────────────────────────────────
def clean_transcript(text: str) -> str:
    """清理转写文本：去除特殊符号和标签"""
    if not text:
        return ""

    # 去除特殊标签 <...>
    import re
    text = re.sub(r'<[^>]+>', '', text)

    # 去除特殊符号（但保留中文标点、字母数字）
    # 需要去除的符号
    remove_chars = set('¥$€£₩%‰√∞π±×°℃℉㎡㎥μΩℓ@#&*©®™αβγΔλωαβγΔλω·《》')
    text = ''.join(c for c in text if c not in remove_chars)

    return text.strip()


def calc_audio_md5(audio_data: bytes) -> str:
    """计算音频文件的MD5哈希"""
    return hashlib.md5(audio_data).hexdigest()


@app.get("/api/admin/exportable-packages/{corpus_group_id}")
def get_exportable_packages(corpus_group_id: int):
    """获取语料组中可导出的包列表（已完成质检审核的）"""
    check_export_limit()
    with Session(engine) as session:
        group = session.query(CorpusGroup).filter_by(id=corpus_group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="语料组不存在")

        packages = session.query(CorpusPackage).filter(
            CorpusPackage.corpus_group_id == corpus_group_id,
            CorpusPackage.quality_status == "已质检",
            CorpusPackage.quality_review_status == "已合格",
        ).order_by(CorpusPackage.id).all()

        result = []
        for p in packages:
            collector = session.query(User).filter_by(id=p.claimed_by).first() if p.claimed_by else None
            result.append({
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "collector_name": collector.username if collector else "",
                "collector_real_name": p.collector_real_name or "",
            })

        return {"code": 200, "data": result, "total": len(result)}


@app.get("/api/admin/export-task/{task_id}")
def get_export_task_status(task_id: str):
    """查询导出任务状态"""
    task = get_export_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {
        "code": 200,
        "data": {
            "task_id": task_id,
            "status": task["status"],
            "progress": task["progress"],
            "message": task["message"],
            "result": task["result"],
        }
    }


def _convert_gender(gender_cn):
    if gender_cn == "男": return "male"
    elif gender_cn == "女": return "female"
    return gender_cn.lower() if gender_cn else ""


def _export_recordings_to_zip(zf, region, recording_ids, package_map, progress_callback=None):
    """
    通用导出核心：并行下载录音，直接写入 zip 文件。
    返回 (total_files, total_duration, total_skipped)
    """
    BATCH_SIZE = 1000
    DOWNLOAD_WORKERS = 20
    total_files = 0
    total_duration = 0.0
    total_skipped = 0
    metadata_lines = []

    total_batches = (len(recording_ids) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_index in range(total_batches):
        batch_start = batch_index * BATCH_SIZE
        batch_end = min(batch_start + BATCH_SIZE, len(recording_ids))
        batch_ids = recording_ids[batch_start:batch_end]

        if progress_callback:
            progress_callback(batch_index, total_batches)

        with Session(engine) as session:
            recordings = session.query(VoiceRecording).filter(
                VoiceRecording.id.in_(batch_ids)
            ).all()

        # 预过滤：跳过无效录音
        valid_recordings = []
        for rec in recordings:
            if not rec.file_path:
                total_skipped += 1
                continue
            pkg = package_map.get(rec.package_id)
            if not pkg:
                total_skipped += 1
                continue
            collector_id = rec.collector_id or pkg.claimed_by
            if not collector_id:
                total_skipped += 1
                continue
            raw_transcript = rec.annotated_text or ""
            if not raw_transcript:
                total_skipped += 1
                continue
            valid_recordings.append((rec, pkg, collector_id, raw_transcript))

        if not valid_recordings:
            continue

        # 并行下载 OSS
        download_results = {}
        def download_one(rec):
            try:
                data = storage_client.get_object(BUCKET_NAME, rec.file_path)
                return (rec.id, data)
            except Exception:
                return (rec.id, None)

        with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
            futures = {executor.submit(download_one, rec): rec.id for rec, _, _, _ in valid_recordings}
            for future in as_completed(futures):
                rec_id, audio_data = future.result()
                download_results[rec_id] = audio_data

        # 处理每条录音
        for rec, pkg, collector_id, raw_transcript in valid_recordings:
            audio_data = download_results.get(rec.id)
            if not audio_data:
                total_skipped += 1
                continue

            try:
                audio_md5 = hashlib.md5(audio_data).hexdigest()
                audio_id = f"spk{collector_id + 10000}_{region}_{rec.id:06d}"
                audio_filename = f"{audio_id}.wav"

                zf.write_audio(f"{region}/audio/{audio_filename}", audio_data)

                duration = rec.duration_seconds or 0
                total_duration += duration
                del audio_data

                transcript = clean_transcript(raw_transcript)
                speaker_id = f"spk{collector_id + 10000}"

                metadata_item = {
                    "audio_id": audio_id,
                    "audio_md5": audio_md5,
                    "audio_path": f"audio/{audio_filename}",
                    "duration": round(float(duration), 3),
                    "segments": [{
                        "start_time": 0.0,
                        "end_time": round(float(duration), 3),
                        "raw_transcript": raw_transcript,
                        "transcript": transcript,
                        "speaker_id": speaker_id,
                        "extra_info": {
                            "language": region,
                            "gender": _convert_gender(pkg.collector_gender) if pkg else "",
                            "age": str(pkg.collector_age) if pkg and pkg.collector_age else "",
                            "location": pkg.collector_hometown if pkg else "",
                        }
                    }]
                }
                metadata_lines.append(json.dumps(metadata_item, ensure_ascii=False))
                total_files += 1
            except Exception:
                total_skipped += 1

    # 写入 metadata 文件
    if metadata_lines:
        content = '\n'.join(metadata_lines) + '\n'
        zf.writestr(f"{region}/{region}_metadata_1.jsonl", content)
        zf.writestr(f"{region}/{region}_metadata_2.jsonl", content)

    # 写入 dataset_info.json
    dataset_info = {
        "dataset_name": f"{region}_dialect",
        "language": f"{region}_dialect",
        "total_files": total_files,
        "total_duration_seconds": int(total_duration),
        "supplier": "ADS"
    }
    zf.writestr(f"{region}/{region}_dataset_info.json", json.dumps(dataset_info, indent=2, ensure_ascii=False))

    return total_files, total_duration, total_skipped


class _ZipWriter:
    """ZIP 文件写入封装，使用 ZIP_STORED（音频不压缩）"""
    def __init__(self, zip_path):
        self.zf = zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED)

    def write_audio(self, arcname, data):
        self.zf.writestr(arcname, data)

    def writestr(self, arcname, data):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self.zf.writestr(arcname, data)

    def close(self):
        self.zf.close()


def _run_export_single_group(task_id: str, corpus_group_id: int, mode: str, selected_ids: list):
    """单组导出的后台任务（优化版）"""
    try:
        with Session(engine) as session:
            group = session.query(CorpusGroup).filter_by(id=corpus_group_id).first()
            if not group:
                update_export_task(task_id, status="failed", message="语料组不存在")
                return

            if not group.pinyin_region:
                update_export_task(task_id, status="failed", message="请先填写导出地区（拼音）")
                return

            update_export_task(task_id, progress=5, message="正在查询数据...")

            if mode == "selected" and selected_ids:
                packages = session.query(CorpusPackage).filter(
                    CorpusPackage.id.in_(selected_ids),
                    CorpusPackage.corpus_group_id == corpus_group_id,
                ).all()
                if not packages:
                    update_export_task(task_id, status="failed", message="未找到指定的包")
                    return
            else:
                packages = session.query(CorpusPackage).filter(
                    CorpusPackage.corpus_group_id == corpus_group_id,
                    CorpusPackage.quality_status == "已质检",
                    CorpusPackage.quality_review_status == "已合格",
                ).order_by(CorpusPackage.id).all()
                if not packages:
                    update_export_task(task_id, status="failed", message="语料组内没有已完成质检审核的包")
                    return

            package_map = {p.id: p for p in packages}
            package_ids = list(package_map.keys())

            recording_ids = [
                r[0] for r in session.query(VoiceRecording.id).filter(
                    VoiceRecording.package_id.in_(package_ids),
                    VoiceRecording.status == "已提交",
                    VoiceRecording.submitted_at.isnot(None),
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                    VoiceRecording.annotated_text.isnot(None),
                    VoiceRecording.annotated_text != "",
                    or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid == None),
                ).all()
            ]

            if not recording_ids:
                update_export_task(task_id, status="failed", message="没有有效的语料记录")
                return

            update_export_task(task_id, progress=10, message=f"共 {len(recording_ids)} 条录音，开始导出...")

            export_date = datetime.utcnow().strftime("%Y%m%d")
            zip_filename = f"{group.name}_export_{export_date}_{uuid.uuid4().hex[:8]}.zip"
            zip_path = os.path.join(EXPORT_DIR, zip_filename)

            zf = _ZipWriter(zip_path)
            try:
                def on_progress(batch_idx, total_batches):
                    progress = 10 + int(70 * batch_idx / total_batches)
                    update_export_task(task_id, progress=progress, message=f"处理第 {batch_idx + 1}/{total_batches} 批...")

                total_files, total_duration, total_skipped = _export_recordings_to_zip(
                    zf, group.pinyin_region, recording_ids, package_map, on_progress
                )

                update_export_task(task_id, progress=85, message="正在保存文件...")

                download_url = f"/api/download/export/{zip_filename}"
                update_export_task(
                    task_id,
                    status="completed",
                    progress=100,
                    message="导出成功",
                    result={
                        "filename": zip_filename,
                        "download_url": download_url,
                        "total_files": total_files,
                        "total_duration": int(total_duration),
                        "packages_count": len(packages),
                    }
                )
            finally:
                zf.close()

    except Exception as e:
        print(f"[导出] 错误: {str(e)}")
        update_export_task(task_id, status="failed", message=f"导出失败: {str(e)}")


@app.get("/api/download/export/{filename}")
def download_export_file(filename: str):
    """从服务器本地下载导出的zip文件"""
    check_export_limit()
    # 安全检查：防止路径遍历
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="文件名不合法")
    file_path = os.path.join(EXPORT_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/zip",
    )


# ── 自动导出配置 ─────────────────────────────────────────────────
@app.get("/api/admin/auto-export-config")
def get_auto_export_config():
    """获取自动导出配置（所有已保存的组+地区）"""
    with Session(engine) as session:
        configs = session.query(AutoExportConfig).all()
        groups = session.query(CorpusGroup).all()
        group_map = {g.id: g.name for g in groups}

        result = []
        for c in configs:
            result.append({
                "id": c.id,
                "corpus_group_id": c.corpus_group_id,
                "group_name": group_map.get(c.corpus_group_id, "未知"),
                "pinyin_region": c.pinyin_region,
            })

        # 所有可用的组（还没有配置的）
        configured_ids = {c.corpus_group_id for c in configs}
        available = [{"id": g.id, "name": g.name, "pinyin_region": g.pinyin_region or ""}
                     for g in groups if g.id not in configured_ids]

        # 上次自动导出结果
        status = session.query(AutoExportStatus).first()
        last_result = None
        is_enabled = True
        if status:
            is_enabled = status.is_enabled if status.is_enabled is not None else True
            if status.last_status != "未执行":
                last_result = {
                    "filename": status.last_filename,
                    "download_url": status.last_url,
                    "total_files": status.last_total_files,
                    "total_duration": status.last_total_duration,
                    "packages_count": status.last_packages_count,
                    "exported_at": status.last_exported_at.strftime("%Y-%m-%d %H:%M:%S") if status.last_exported_at else None,
                    "status": status.last_status,
                    "message": status.last_message,
                }

        return {"code": 200, "data": {"configs": result, "available_groups": available, "last_result": last_result, "is_enabled": is_enabled}}


@app.post("/api/admin/auto-export-config")
async def save_auto_export_config(req: Request):
    body = await req.json()
    items = body.get("items", [])  # [{corpus_group_id, pinyin_region}]

    for item in items:
        gid = item.get("corpus_group_id")
        region = item.get("pinyin_region", "").strip()
        if not gid or not region:
            continue
        with Session(engine) as session:
            existing = session.query(AutoExportConfig).filter_by(corpus_group_id=gid).first()
            if existing:
                existing.pinyin_region = region
            else:
                session.add(AutoExportConfig(corpus_group_id=gid, pinyin_region=region))
            session.commit()

    return {"code": 200, "msg": "保存成功"}


@app.post("/api/admin/auto-export-config/delete/{config_id}")
def delete_auto_export_config(config_id: int):
    with Session(engine) as session:
        config = session.query(AutoExportConfig).get(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="配置不存在")
        session.delete(config)
        session.commit()
    return {"code": 200, "msg": "删除成功"}


@app.post("/api/admin/auto-export-config/toggle")
async def toggle_auto_export_config(req: Request):
    body = await req.json()
    enabled = body.get("enabled", True)
    with Session(engine) as session:
        status = session.query(AutoExportStatus).first()
        if not status:
            status = AutoExportStatus(is_enabled=enabled)
            session.add(status)
        else:
            status.is_enabled = enabled
        session.commit()
    return {"code": 200, "msg": "设置成功", "is_enabled": enabled}


# ── 自动导出定时任务 ──────────────────────────────────────────────
def _run_auto_export():
    """每日凌晨5点自动导出所有已配置的组"""
    print("[自动导出] 开始执行...")
    try:
        with Session(engine) as session:
            status = session.query(AutoExportStatus).first()
            if status and status.is_enabled == False:
                print("[自动导出] 自动导出已关闭，跳过")
                return

            configs = session.query(AutoExportConfig).all()
            if not configs:
                print("[自动导出] 没有配置任何组，跳过")
                return

            group_regions = [{"group_id": c.corpus_group_id, "pinyin_region": c.pinyin_region} for c in configs]

            # 删除上次的自动导出文件
            status = session.query(AutoExportStatus).first()
            if status and status.last_filename:
                old_path = os.path.join(EXPORT_DIR, status.last_filename)
                if os.path.isfile(old_path):
                    try:
                        os.remove(old_path)
                        print(f"[自动导出] 已删除旧文件: {old_path}")
                    except Exception as e:
                        print(f"[自动导出] 删除旧文件失败: {e}")

        # 复用多组导出逻辑（同步版本，不用task_id）
        result = _run_export_multiple_groups_sync(group_regions)

        with Session(engine) as session:
            status = session.query(AutoExportStatus).first()
            if not status:
                status = AutoExportStatus()
                session.add(status)
            status.last_filename = result.get("filename")
            status.last_url = result.get("download_url")
            status.last_total_files = result.get("total_files", 0)
            status.last_total_duration = result.get("total_duration", 0)
            status.last_packages_count = result.get("packages_count", 0)
            status.last_exported_at = datetime.utcnow()
            status.last_status = "成功"
            status.last_message = f"导出成功，共{result.get('total_files', 0)}个文件"
            session.commit()
        print(f"[自动导出] 成功: {result.get('filename')}")

    except Exception as e:
        print(f"[自动导出] 失败: {e}")
        try:
            with Session(engine) as session:
                status = session.query(AutoExportStatus).first()
                if not status:
                    status = AutoExportStatus()
                    session.add(status)
                status.last_status = "失败"
                status.last_message = str(e)
                status.last_exported_at = datetime.utcnow()
                session.commit()
        except Exception:
            pass


def _run_export_multiple_groups_sync(group_regions: list) -> dict:
    """多组导出的同步版本（优化版）- 返回结果字典而非更新task"""
    with Session(engine) as session:
        region_groups = {}
        for item in group_regions:
            region = item["pinyin_region"].strip()
            gid = item["group_id"]
            if region not in region_groups:
                region_groups[region] = []
            region_groups[region].append(gid)

        region_data = {}
        total_recordings = 0
        for region, gids in region_groups.items():
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.corpus_group_id.in_(gids),
                CorpusPackage.quality_status == "已质检",
                CorpusPackage.quality_review_status == "已合格",
            ).all()
            if packages:
                package_ids = [p.id for p in packages]
                recording_ids = [
                    r[0] for r in session.query(VoiceRecording.id).filter(
                        VoiceRecording.package_id.in_(package_ids),
                        VoiceRecording.status == "已提交",
                        VoiceRecording.submitted_at.isnot(None),
                        VoiceRecording.file_path.isnot(None),
                        VoiceRecording.file_path != "",
                        VoiceRecording.annotated_text.isnot(None),
                        VoiceRecording.annotated_text != "",
                        or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid == None),
                    ).all()
                ]
                if recording_ids:
                    region_data[region] = {
                        "group_ids": gids,
                        "packages": packages,
                        "recording_ids": recording_ids,
                    }
                    total_recordings += len(recording_ids)

        if not region_data:
            raise Exception("所有已配置的语料组都没有已完成质检审核的有效录音")

        export_date = datetime.utcnow().strftime("%Y%m%d")
        region_names = "_".join(list(region_data.keys())[:3])
        if len(region_data) > 3:
            region_names += f"_等{len(region_data)}地区"
        zip_filename = f"auto_{region_names}_{export_date}.zip"
        zip_path = os.path.join(EXPORT_DIR, zip_filename)

        zf = _ZipWriter(zip_path)
        try:
            total_files_all = 0
            total_duration_all = 0
            total_packages_all = 0

            for region, data in region_data.items():
                packages = data["packages"]
                recording_ids = data["recording_ids"]
                package_map = {p.id: p for p in packages}

                print(f"[auto-export] 处理地区 {region}: {len(recording_ids)} 条录音")

                total_files, total_duration, total_skipped = _export_recordings_to_zip(
                    zf, region, recording_ids, package_map
                )

                total_files_all += total_files
                total_duration_all += total_duration
                total_packages_all += len(packages)

            return {
                "filename": zip_filename,
                "download_url": f"/api/download/export/{zip_filename}",
                "total_files": total_files_all,
                "total_duration": int(total_duration_all),
                "packages_count": total_packages_all,
            }
        finally:
            zf.close()


# 启动 APScheduler
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
scheduler.add_job(_run_auto_export, CronTrigger(hour=19, minute=0), id="auto_export", replace_existing=True)
scheduler.start()
print("[调度器] 自动导出任务已启动，每天下午19点执行")


def _export_collection_approved_recordings_to_zip(zf, folder_name, collection_type, language, recording_ids, package_map, progress_callback=None):
    BATCH_SIZE = 1000
    DOWNLOAD_WORKERS = 20
    total_files = 0
    total_batches = (len(recording_ids) + BATCH_SIZE - 1) // BATCH_SIZE
    import re

    for batch_index in range(total_batches):
        batch_start = batch_index * BATCH_SIZE
        batch_end = min(batch_start + BATCH_SIZE, len(recording_ids))
        batch_ids = recording_ids[batch_start:batch_end]

        if progress_callback:
            progress_callback(batch_index, total_batches)

        with Session(engine) as session:
            recordings = session.query(VoiceRecording).filter(
                VoiceRecording.id.in_(batch_ids)
            ).all()
            # 批量获取 corpus_text 的 text_id（即原始语料 ID）
            corpus_text_ids_in_batch = [r.corpus_text_id for r in recordings if r.corpus_text_id]
            corpus_text_map = {}
            if corpus_text_ids_in_batch:
                texts = session.query(CorpusText.id, CorpusText.text_id).filter(
                    CorpusText.id.in_(corpus_text_ids_in_batch)
                ).all()
                corpus_text_map = {t.id: t.text_id for t in texts}

        valid_recordings = []
        for rec in recordings:
            if not rec.file_path: continue
            pkg = package_map.get(rec.package_id)
            if not pkg: continue
            collector_name = pkg.collector_real_name or "未知采集员"
            # 使用原始语料 ID（text_id），若无则退化为录音数据库 ID
            original_id = corpus_text_map.get(rec.corpus_text_id) or str(rec.id)
            valid_recordings.append((rec, collector_name, original_id))

        if not valid_recordings: continue

        download_results = {}
        def download_one(rec):
            try:
                data = storage_client.get_object(BUCKET_NAME, rec.file_path)
                return (rec.id, data)
            except Exception:
                return (rec.id, None)

        with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
            futures = {executor.submit(download_one, rec): rec.id for rec, _, _ in valid_recordings}
            for future in as_completed(futures):
                rec_id, audio_data = future.result()
                download_results[rec_id] = audio_data

        for rec, collector_name, original_id in valid_recordings:
            audio_data = download_results.get(rec.id)
            if not audio_data: continue
            try:
                # 剥离防重前缀
                if "#" in str(original_id):
                    original_id = str(original_id).split("#", 1)[1]
                
                safe_collector_name = re.sub(r'[\\/*?"<>|]', "", collector_name)
                safe_collection_type = re.sub(r'[-]', '_', collection_type)
                safe_language = re.sub(r'[-]', '_', language)
                safe_original_id = re.sub(r'[-]', '_', str(original_id))
                audio_filename = f"{safe_collection_type}_{safe_language}_{safe_collector_name}_{safe_original_id}.wav"
                zf.write_audio(f"{folder_name}/{audio_filename}", audio_data)
                total_files += 1
            except Exception as e:
                print(f"写入zip失败: {e}")
    return total_files


def _run_export_collection_approved_group(task_id: str, corpus_group_id: int, collection_type: str, language: str):
    try:
        with Session(engine) as session:
            group = session.query(CorpusGroup).filter_by(id=corpus_group_id).first()
            if not group:
                update_export_task(task_id, status="failed", message="语料组不存在")
                return
            update_export_task(task_id, progress=5, message="正在查询数据...")
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.corpus_group_id == corpus_group_id,
                CorpusPackage.review_status == "已合格",
            ).all()
            if not packages:
                update_export_task(task_id, status="failed", message="语料组内没有采集审核已合格的包")
                return
            package_map = {p.id: p for p in packages}
            package_ids = list(package_map.keys())
            recording_ids = [
                r[0] for r in session.query(VoiceRecording.id).filter(
                    VoiceRecording.package_id.in_(package_ids),
                    VoiceRecording.status == "已提交",
                    VoiceRecording.submitted_at.isnot(None),
                    VoiceRecording.file_path.isnot(None),
                    VoiceRecording.file_path != "",
                ).all()
            ]
            if not recording_ids:
                update_export_task(task_id, status="failed", message="没有有效的语料记录")
                return
            update_export_task(task_id, progress=10, message=f"共 {len(recording_ids)} 条录音，开始导出...")
            export_date = datetime.utcnow().strftime("%Y%m%d")
            zip_filename = f"collection_{export_date}_{uuid.uuid4().hex[:8]}.zip"
            zip_path = os.path.join(EXPORT_DIR, zip_filename)
            zf = _ZipWriter(zip_path)
            try:
                def on_progress(batch_idx, total_batches):
                    progress = 10 + int(70 * batch_idx / total_batches)
                    update_export_task(task_id, progress=progress, message=f"处理第 {batch_idx + 1}/{total_batches} 批...")
                folder_name = f"{collection_type}-{language}"
                total_files = _export_collection_approved_recordings_to_zip(
                    zf, folder_name, collection_type, language, recording_ids, package_map, on_progress
                )
                update_export_task(task_id, progress=85, message="正在保存文件...")
                download_url = f"/api/download/export/{zip_filename}"
                update_export_task(
                    task_id, status="completed", progress=100, message="导出成功",
                    result={ "filename": zip_filename, "download_url": download_url, "total_files": total_files }
                )
            finally:
                zf.close()
    except Exception as e:
        print(f"[导出] 错误: {str(e)}")
        update_export_task(task_id, status="failed", message=f"导出失败: {str(e)}")

@app.post("/api/admin/export-collection-approved-group/{corpus_group_id}")
def export_collection_approved_group(corpus_group_id: int, req: dict = None):
    check_export_limit()
    collection_type = (req or {}).get("collection_type", "").strip()
    language = (req or {}).get("language", "").strip()
    if not collection_type or not language:
        raise HTTPException(status_code=400, detail="采集类型和语种不能为空")
    task_id = create_export_task()
    thread = threading.Thread(
        target=_run_export_collection_approved_group,
        args=(task_id, corpus_group_id, collection_type, language),
        daemon=True
    )
    thread.start()
    return { "code": 200, "msg": "导出任务已启动", "data": {"task_id": task_id} }


@app.post("/api/admin/export-corpus-group/{corpus_group_id}")
def export_corpus_group(corpus_group_id: int, req: dict = None):
    """导出语料组（异步）- 启动后台任务并立即返回任务ID"""
    check_export_limit()
    selected_ids = (req or {}).get("package_ids", [])
    mode = (req or {}).get("mode", "all_completed")

    # 创建任务
    task_id = create_export_task()

    # 启动后台线程
    thread = threading.Thread(
        target=_run_export_single_group,
        args=(task_id, corpus_group_id, mode, selected_ids),
        daemon=True
    )
    thread.start()

    return {
        "code": 200,
        "msg": "导出任务已启动",
        "data": {"task_id": task_id}
    }


def _run_export_multiple_groups(task_id: str, group_regions: list):
    """多组导出的后台任务（优化版）- 直接写入 ZIP，跳过临时文件"""
    try:
        with Session(engine) as session:
            # 按地区分组
            region_groups = {}
            for item in group_regions:
                region = item["pinyin_region"].strip()
                gid = item["group_id"]
                if region not in region_groups:
                    region_groups[region] = []
                region_groups[region].append(gid)

            update_export_task(task_id, progress=5, message=f"共 {len(region_groups)} 个地区，正在查询数据...")

            # 检查每个地区是否有数据
            region_data = {}
            total_recordings = 0
            for region, gids in region_groups.items():
                packages = session.query(CorpusPackage).filter(
                    CorpusPackage.corpus_group_id.in_(gids),
                    CorpusPackage.quality_status == "已质检",
                    CorpusPackage.quality_review_status == "已合格",
                ).all()
                if packages:
                    package_ids = [p.id for p in packages]
                    recording_ids = [
                        r[0] for r in session.query(VoiceRecording.id).filter(
                            VoiceRecording.package_id.in_(package_ids),
                            VoiceRecording.status == "已提交",
                            VoiceRecording.submitted_at.isnot(None),
                            VoiceRecording.file_path.isnot(None),
                            VoiceRecording.file_path != "",
                            VoiceRecording.annotated_text.isnot(None),
                            VoiceRecording.annotated_text != "",
                            or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid == None),
                        ).all()
                    ]
                    if recording_ids:
                        region_data[region] = {
                            "group_ids": gids,
                            "packages": packages,
                            "recording_ids": recording_ids,
                        }
                        total_recordings += len(recording_ids)

            if not region_data:
                update_export_task(task_id, status="failed", message="所有选中的语料组都没有已完成质检审核的有效录音")
                return

            update_export_task(task_id, progress=10, message=f"共 {total_recordings} 条录音，{len(region_data)} 个地区，开始导出...")

            export_date = datetime.utcnow().strftime("%Y%m%d")
            region_names = "_".join(list(region_data.keys())[:3])
            if len(region_data) > 3:
                region_names += f"_等{len(region_data)}地区"
            zip_filename = f"{region_names}_export_{export_date}_{uuid.uuid4().hex[:8]}.zip"
            zip_path = os.path.join(EXPORT_DIR, zip_filename)

            zf = _ZipWriter(zip_path)
            try:
                total_files_all = 0
                total_duration_all = 0
                total_packages_all = 0
                region_index = 0

                for region, data in region_data.items():
                    region_index += 1
                    packages = data["packages"]
                    recording_ids = data["recording_ids"]
                    package_map = {p.id: p for p in packages}

                    def on_progress(batch_idx, total_batches):
                        progress = 10 + int(70 * (region_index - 1 + batch_idx / total_batches) / len(region_data))
                        update_export_task(
                            task_id, progress=progress,
                            message=f"[{region_index}/{len(region_data)}] {region} 处理第 {batch_idx + 1}/{total_batches} 批..."
                        )

                    update_export_task(
                        task_id,
                        progress=10 + int(70 * (region_index - 1) / len(region_data)),
                        message=f"[{region_index}/{len(region_data)}] 正在处理地区 {region}（{len(recording_ids)} 条录音）..."
                    )

                    total_files, total_duration, total_skipped = _export_recordings_to_zip(
                        zf, region, recording_ids, package_map, on_progress
                    )

                    total_files_all += total_files
                    total_duration_all += total_duration
                    total_packages_all += len(packages)

                update_export_task(task_id, progress=90, message="正在保存文件...")

                download_url = f"/api/download/export/{zip_filename}"
                update_export_task(
                    task_id,
                    status="completed",
                    progress=100,
                    message="导出成功",
                    result={
                        "filename": zip_filename,
                        "download_url": download_url,
                        "total_files": total_files_all,
                        "total_duration": int(total_duration_all),
                        "regions_count": len(region_data),
                        "packages_count": total_packages_all,
                    }
                )
            finally:
                zf.close()

    except Exception as e:
        print(f"[导出] 错误: {str(e)}")
        update_export_task(task_id, status="failed", message=f"导出失败: {str(e)}")


@app.post("/api/admin/export-multiple-groups")
def export_multiple_groups(req: dict):
    """导出多个语料组（异步）- 每个组独立地区，启动后台任务并立即返回任务ID"""
    check_export_limit()
    group_regions = req.get("group_regions", [])

    if not group_regions:
        raise HTTPException(status_code=400, detail="请选择至少一个语料组")

    for item in group_regions:
        if not item.get("group_id"):
            raise HTTPException(status_code=400, detail="缺少语料组ID")
        if not item.get("pinyin_region", "").strip():
            raise HTTPException(status_code=400, detail=f"语料组 {item['group_id']} 请填写导出地区（拼音）")

    task_id = create_export_task()

    thread = threading.Thread(
        target=_run_export_multiple_groups,
        args=(task_id, group_regions),
        daemon=True
    )
    thread.start()

    return {
        "code": 200,
        "msg": "导出任务已启动",
        "data": {"task_id": task_id}
    }


@app.post("/api/get-upload-url")
async def get_upload_url(req: UploadRequest):
    try:
        unique_filename = f"voice_{uuid.uuid4().hex}{req.file_extension}"
        loop = asyncio.get_event_loop()
        presigned_result = await loop.run_in_executor(None, lambda: storage_client.presigned_put_object(
            BUCKET_NAME, unique_filename, expires=300
        ))
        presigned_url, download_url = presigned_result
        return {
            "code": 200, "msg": "获取成功",
            "data": {"upload_url": presigned_url, "download_url": download_url, "filename": unique_filename},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"存储服务异常: {str(e)}")


# ── 作业查询 ───────────────────────────────────────────────────────────────────
@app.get("/api/admin/users/simple")
def get_users_simple():
    """获取所有用户的简单列表（用于下拉选择）"""
    with Session(engine) as session:
        users = session.query(User.id, User.username, User.role).order_by(User.id).all()
        return {"code": 200, "data": [{"id": u.id, "username": u.username, "role": u.role} for u in users]}


@app.get("/api/admin/claimed-packages")
def get_claimed_packages(
    worker_name: str = Query(None, description="作业人员名称（模糊搜索）"),
    worker_ids: str = Query(None, description="作业人员ID列表（逗号分隔）"),
    role_filter: str = Query(None, description="角色筛选（collector/annotator/inspector/reviewer/quality_reviewer/no_role）"),
    exclude_quality_reviewer: bool = Query(True, description="是否排除质检审核员的数据"),
    start_date: str = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str = Query(None, description="结束日期 (YYYY-MM-DD)"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    offset: int = Query(0, ge=0, description="偏移量")
):
    """获取所有被领取的语料包（作业查询）"""
    with Session(engine) as session:
        # 构建查询
        q = session.query(CorpusPackage).filter(CorpusPackage.status != "未领取")
        
        # 排除质检审核员的数据（默认排除）
        if exclude_quality_reviewer:
            q = q.filter(CorpusPackage.quality_review_status != "待审核")
        
        # 角色筛选
        if role_filter:
            if role_filter == "no_role":
                # 筛选没有角色的包（所有角色字段都为空）
                q = q.filter(
                    CorpusPackage.claimed_by.is_(None),
                    CorpusPackage.annotation_claimed_by.is_(None),
                    CorpusPackage.quality_claimed_by.is_(None),
                    CorpusPackage.review_claimed_by.is_(None)
                )
            elif role_filter == "collector":
                q = q.filter(CorpusPackage.claimed_by.isnot(None), CorpusPackage.status == "已领取")
            elif role_filter == "annotator":
                q = q.filter(CorpusPackage.annotation_claimed_by.isnot(None), CorpusPackage.annotation_status == "待标注")
            elif role_filter == "inspector":
                q = q.filter(CorpusPackage.quality_claimed_by.isnot(None), CorpusPackage.quality_status == "待质检")
            elif role_filter == "reviewer":
                q = q.filter(CorpusPackage.review_claimed_by.isnot(None), CorpusPackage.review_status == "待审核")
        
        # 筛选作业人员（多选）
        if worker_ids:
            worker_id_list = [int(id.strip()) for id in worker_ids.split(',') if id.strip()]
            if worker_id_list:
                from sqlalchemy import or_
                q = q.filter(
                    or_(
                        CorpusPackage.claimed_by.in_(worker_id_list),
                        CorpusPackage.annotation_claimed_by.in_(worker_id_list),
                        CorpusPackage.quality_claimed_by.in_(worker_id_list),
                        CorpusPackage.review_claimed_by.in_(worker_id_list)
                    )
                )
        
        # 筛选作业人员（模糊搜索）
        if worker_name:
            # 获取所有用户的 ID 和名称映射
            users = session.query(User.id, User.username).all()
            user_map = {uid: uname for uid, uname in users}
            
            # 找到匹配的用户 ID
            matched_user_ids = [uid for uid, uname in user_map.items() if worker_name.lower() in uname.lower()]
            
            if matched_user_ids:
                from sqlalchemy import or_
                q = q.filter(
                    or_(
                        CorpusPackage.claimed_by.in_(matched_user_ids),
                        CorpusPackage.annotation_claimed_by.in_(matched_user_ids),
                        CorpusPackage.quality_claimed_by.in_(matched_user_ids),
                        CorpusPackage.review_claimed_by.in_(matched_user_ids)
                    )
                )
            else:
                # 如果没有匹配的用户，返回空结果
                return {"code": 200, "data": [], "total": 0}
        
        # 筛选日期范围（基于领取时间）
        if start_date:
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            q = q.filter(CorpusPackage.claimed_at >= start_datetime)
        
        if end_date:
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            q = q.filter(CorpusPackage.claimed_at <= end_datetime)
        
        # 获取总数
        total = q.count()
        
        # 获取分页数据
        packages = q.order_by(CorpusPackage.id.desc()).offset(offset).limit(limit).all()
        
        if not packages:
            return {"code": 200, "data": [], "total": total}
        
        # 批量查询：收集所有需要的用户ID和组ID
        user_ids = set()
        group_ids = set()
        for pkg in packages:
            if pkg.claimed_by: user_ids.add(pkg.claimed_by)
            if pkg.annotation_claimed_by: user_ids.add(pkg.annotation_claimed_by)
            if pkg.quality_claimed_by: user_ids.add(pkg.quality_claimed_by)
            if pkg.review_claimed_by: user_ids.add(pkg.review_claimed_by)
            if pkg.corpus_group_id: group_ids.add(pkg.corpus_group_id)
        
        # 批量查询用户信息
        user_map = {}
        if user_ids:
            users = session.query(User.id, User.username).filter(User.id.in_(user_ids)).all()
            user_map = {uid: uname for uid, uname in users}
        
        # 批量查询语料组信息
        group_map = {}
        if group_ids:
            groups = session.query(CorpusGroup.id, CorpusGroup.name).filter(CorpusGroup.id.in_(group_ids)).all()
            group_map = {gid: gname for gid, gname in groups}
        
        # 批量查询各角色最新的提交时间（录音级别）
        pkg_ids = [pkg.id for pkg in packages]
        
        # 采集员提交时间：max(submitted_at) per package
        collector_submit_map = {}
        if pkg_ids:
            cs_rows = session.query(
                VoiceRecording.package_id,
                func.max(VoiceRecording.submitted_at)
            ).filter(
                VoiceRecording.package_id.in_(pkg_ids),
                VoiceRecording.submitted_at.isnot(None)
            ).group_by(VoiceRecording.package_id).all()
            collector_submit_map = {pid: ts for pid, ts in cs_rows}
        
        # 标注员提交时间：max(annotated_at) per package
        annotator_submit_map = {}
        if pkg_ids:
            as_rows = session.query(
                VoiceRecording.package_id,
                func.max(VoiceRecording.annotated_at)
            ).filter(
                VoiceRecording.package_id.in_(pkg_ids),
                VoiceRecording.annotated_at.isnot(None)
            ).group_by(VoiceRecording.package_id).all()
            annotator_submit_map = {pid: ts for pid, ts in as_rows}
        
        # 质检员提交时间：max(inspected_at) per package
        inspector_submit_map = {}
        if pkg_ids:
            is_rows = session.query(
                VoiceRecording.package_id,
                func.max(VoiceRecording.inspected_at)
            ).filter(
                VoiceRecording.package_id.in_(pkg_ids),
                VoiceRecording.inspected_at.isnot(None)
            ).group_by(VoiceRecording.package_id).all()
            inspector_submit_map = {pid: ts for pid, ts in is_rows}
        
        result = []
        for pkg in packages:
            # 确定当前作业人员和角色
            worker_name_val = ""
            worker_role = ""
            last_worked_at = None
            
            # 根据包的状态确定当前作业人员，使用各角色的录音提交时间
            if pkg.status == "已领取" and pkg.claimed_by:
                worker_name_val = user_map.get(pkg.claimed_by, "")
                worker_role = "采集员"
                last_worked_at = collector_submit_map.get(pkg.id) or pkg.claimed_at
            elif pkg.annotation_status == "待标注" and pkg.annotation_claimed_by:
                worker_name_val = user_map.get(pkg.annotation_claimed_by, "")
                worker_role = "标注员"
                last_worked_at = annotator_submit_map.get(pkg.id) or pkg.annotation_claimed_at
            elif pkg.quality_status == "待质检" and pkg.quality_claimed_by:
                worker_name_val = user_map.get(pkg.quality_claimed_by, "")
                worker_role = "质检员"
                last_worked_at = inspector_submit_map.get(pkg.id) or pkg.quality_claimed_at
            elif pkg.review_status == "待审核" and pkg.review_claimed_by:
                worker_name_val = user_map.get(pkg.review_claimed_by, "")
                worker_role = "采集审核员"
                last_worked_at = pkg.review_claimed_at
            
            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "annotation_status": pkg.annotation_status,
                "quality_status": pkg.quality_status,
                "review_status": pkg.review_status,
                "corpus_group_name": group_map.get(pkg.corpus_group_id, ""),
                "worker_name": worker_name_val,
                "worker_role": worker_role,
                "claimed_at": pkg.claimed_at.strftime("%Y-%m-%d %H:%M") if pkg.claimed_at else "",
                "last_worked_at": last_worked_at.strftime("%Y-%m-%d %H:%M") if last_worked_at else "",
            })
        
        return {"code": 200, "data": result, "total": total}


@app.post("/api/admin/release-package")
def release_package(req: dict):
    """释放语料包，使其可以被重新领取"""
    package_id = req.get("package_id")
    if not package_id:
        raise HTTPException(status_code=400, detail="缺少 package_id")
    
    with Session(engine) as session:
        pkg = session.query(CorpusPackage).filter_by(id=package_id).first()
        if not pkg:
            raise HTTPException(status_code=404, detail="语料包不存在")
        
        # 检查包是否已被领取
        if pkg.status == "未领取":
            raise HTTPException(status_code=400, detail="该语料包未被领取，无需释放")
        
        # 根据包的当前状态进行释放
        # 1. 如果是采集中（status = "已领取"），重置为未领取
        if pkg.status == "已领取":
            pkg.status = "未领取"
            pkg.claimed_by = None
            pkg.claimed_at = None
            # 删除该包的所有录音记录（重新开始）
            session.query(VoiceRecording).filter_by(package_id=package_id).delete()
        
        # 2. 如果是标注中（annotation_status = "待标注"），释放领取锁，保持待标注状态
        if pkg.annotation_status == "待标注":
            pkg.annotation_status = "待标注"  # 保持待标注状态，让其他标注员可以领取
            pkg.annotation_claimed_by = None
            pkg.annotation_claimed_at = None
        
        # 3. 如果是质检中（quality_status = "待质检"），释放领取锁，保持待质检状态
        if pkg.quality_status == "待质检":
            pkg.quality_status = "待质检"  # 保持待质检状态，让其他质检员可以领取
            pkg.quality_claimed_by = None
            pkg.quality_claimed_at = None
        
        # 4. 如果是采集审核中（review_status = "待审核"），释放领取锁，保持待审核状态
        if pkg.review_status == "待审核":
            pkg.review_status = "待审核"  # 保持待审核状态，让其他审核员可以领取
            pkg.review_claimed_by = None
            pkg.review_claimed_at = None
        
        # 5. 如果是质检审核中（quality_review_status = "待审核"），释放领取锁，保持待审核状态
        if pkg.quality_review_status == "待审核":
            pkg.quality_review_status = "待审核"  # 保持待审核状态，让其他质检审核员可以领取
            pkg.quality_review_claimed_by = None
            pkg.quality_review_claimed_at = None
        
        session.commit()
        
        return {"code": 200, "msg": "释放成功"}


@app.post("/api/admin/release-packages-by-role")
def release_packages_by_role(req: dict):
    """释放某个角色的全部数据"""
    role = req.get("role")
    if not role:
        raise HTTPException(status_code=400, detail="缺少 role 参数")
    
    valid_roles = ["collector", "annotator", "inspector", "reviewer", "quality_reviewer"]
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"role 无效，可选: {', '.join(valid_roles)}")
    
    with Session(engine) as session:
        released_count = 0
        
        if role == "collector":
            # 释放所有采集中状态的包
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.status == "已领取",
                CorpusPackage.claimed_by.isnot(None)
            ).all()
            for pkg in packages:
                pkg.status = "未领取"
                pkg.claimed_by = None
                pkg.claimed_at = None
                session.query(VoiceRecording).filter_by(package_id=pkg.id).delete()
                released_count += 1
        
        elif role == "annotator":
            # 释放所有标注中状态的包
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.annotation_status == "待标注",
                CorpusPackage.annotation_claimed_by.isnot(None)
            ).all()
            for pkg in packages:
                pkg.annotation_claimed_by = None
                pkg.annotation_claimed_at = None
                released_count += 1
        
        elif role == "inspector":
            # 释放所有质检中状态的包
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.quality_status == "待质检",
                CorpusPackage.quality_claimed_by.isnot(None)
            ).all()
            for pkg in packages:
                pkg.quality_claimed_by = None
                pkg.quality_claimed_at = None
                released_count += 1
        
        elif role == "reviewer":
            # 释放所有采集审核中状态的包
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.review_status == "待审核",
                CorpusPackage.review_claimed_by.isnot(None)
            ).all()
            for pkg in packages:
                pkg.review_claimed_by = None
                pkg.review_claimed_at = None
                released_count += 1
        
        elif role == "quality_reviewer":
            # 释放所有质检审核中状态的包
            packages = session.query(CorpusPackage).filter(
                CorpusPackage.quality_review_status == "待审核",
                CorpusPackage.quality_review_claimed_by.isnot(None)
            ).all()
            for pkg in packages:
                pkg.quality_review_claimed_by = None
                pkg.quality_review_claimed_at = None
                released_count += 1
        
        session.commit()
        
        return {"code": 200, "msg": f"释放成功，共释放 {released_count} 个包", "released_count": released_count}


class ReleasePackagesByFilterRequest(BaseModel):
    worker_name: str | None = None
    worker_ids: list[int] = []
    role_filter: str | None = None
    exclude_quality_reviewer: bool = True
    start_date: str | None = None
    end_date: str | None = None


@app.post("/api/admin/release-packages-by-filter")
def release_packages_by_filter(req: ReleasePackagesByFilterRequest):
    """按筛选条件批量释放语料包"""
    with Session(engine) as session:
        # 构建查询（与 claimed-packages 相同的筛选逻辑）
        q = session.query(CorpusPackage).filter(CorpusPackage.status != "未领取")

        if req.exclude_quality_reviewer:
            q = q.filter(CorpusPackage.quality_review_status != "待审核")

        if req.role_filter:
            if req.role_filter == "no_role":
                q = q.filter(
                    CorpusPackage.claimed_by.is_(None),
                    CorpusPackage.annotation_claimed_by.is_(None),
                    CorpusPackage.quality_claimed_by.is_(None),
                    CorpusPackage.review_claimed_by.is_(None)
                )
            elif req.role_filter == "collector":
                q = q.filter(CorpusPackage.claimed_by.isnot(None), CorpusPackage.status == "已领取")
            elif req.role_filter == "annotator":
                q = q.filter(CorpusPackage.annotation_claimed_by.isnot(None), CorpusPackage.annotation_status == "待标注")
            elif req.role_filter == "inspector":
                q = q.filter(CorpusPackage.quality_claimed_by.isnot(None), CorpusPackage.quality_status == "待质检")
            elif req.role_filter == "reviewer":
                q = q.filter(CorpusPackage.review_claimed_by.isnot(None), CorpusPackage.review_status == "待审核")

        if req.worker_ids:
            from sqlalchemy import or_
            q = q.filter(
                or_(
                    CorpusPackage.claimed_by.in_(req.worker_ids),
                    CorpusPackage.annotation_claimed_by.in_(req.worker_ids),
                    CorpusPackage.quality_claimed_by.in_(req.worker_ids),
                    CorpusPackage.review_claimed_by.in_(req.worker_ids)
                )
            )

        if req.worker_name:
            users = session.query(User.id, User.username).all()
            matched_ids = [uid for uid, uname in users if req.worker_name.lower() in uname.lower()]
            if matched_ids:
                from sqlalchemy import or_
                q = q.filter(
                    or_(
                        CorpusPackage.claimed_by.in_(matched_ids),
                        CorpusPackage.annotation_claimed_by.in_(matched_ids),
                        CorpusPackage.quality_claimed_by.in_(matched_ids),
                        CorpusPackage.review_claimed_by.in_(matched_ids)
                    )
                )
            else:
                return {"code": 200, "msg": "没有匹配的作业人员", "released_count": 0}

        if req.start_date:
            q = q.filter(CorpusPackage.claimed_at >= datetime.strptime(req.start_date, "%Y-%m-%d"))
        if req.end_date:
            q = q.filter(CorpusPackage.claimed_at <= datetime.strptime(req.end_date, "%Y-%m-%d") + timedelta(days=1))

        packages = q.all()
        if not packages:
            return {"code": 200, "msg": "没有匹配的包", "released_count": 0}

        released_count = 0
        for pkg in packages:
            if pkg.status == "已领取":
                pkg.status = "未领取"
                pkg.claimed_by = None
                pkg.claimed_at = None
                session.query(VoiceRecording).filter_by(package_id=pkg.id).delete()

            if pkg.annotation_status == "待标注":
                pkg.annotation_status = "待标注"  # 保持待标注状态，让其他标注员可以领取
                pkg.annotation_claimed_by = None
                pkg.annotation_claimed_at = None

            if pkg.quality_status == "待质检":
                pkg.quality_status = "待质检"  # 保持待质检状态，让其他质检员可以领取
                pkg.quality_claimed_by = None
                pkg.quality_claimed_at = None

            if pkg.review_status == "待审核":
                pkg.review_claimed_by = None
                pkg.review_claimed_at = None

            if pkg.quality_review_status == "待审核":
                pkg.quality_review_claimed_by = None
                pkg.quality_review_claimed_at = None

            released_count += 1

        session.commit()

    return {"code": 200, "msg": f"已释放 {released_count} 个语料包", "released_count": released_count}


# ── 被打回包管理 ─────────────────────────────────────────────────────────────
@app.get("/api/admin/rejected-packages")
def get_rejected_packages(
    corpus_group_id: int | None = Query(None, description="按语料组筛选"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取所有被打回的包（review_status = 已打回）"""
    offset = (page - 1) * limit
    with Session(engine) as session:
        q = session.query(CorpusPackage).filter(CorpusPackage.review_status == "已打回")

        if corpus_group_id:
            q = q.filter(CorpusPackage.corpus_group_id == corpus_group_id)

        total = q.count()
        packages = q.order_by(CorpusPackage.id.desc()).offset(offset).limit(limit).all()

        if not packages:
            return {"code": 200, "data": [], "total": total}

        # 批量查询用户和语料组
        user_ids = set()
        group_ids = set()
        for pkg in packages:
            if pkg.claimed_by:
                user_ids.add(pkg.claimed_by)
            if pkg.corpus_group_id:
                group_ids.add(pkg.corpus_group_id)

        users_map = {u.id: u for u in session.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
        groups_map = {g.id: g for g in session.query(CorpusGroup).filter(CorpusGroup.id.in_(group_ids)).all()} if group_ids else {}

        # 批量查询录音完成度
        package_ids = [p.id for p in packages]
        recording_counts = {}
        if package_ids:
            # 每个包的总语料数
            total_counts = dict(
                session.query(
                    CorpusPackageItem.package_id,
                    func.count(CorpusPackageItem.id)
                ).filter(CorpusPackageItem.package_id.in_(package_ids))
                .group_by(CorpusPackageItem.package_id).all()
            )
            # 每个包有录音的语料数
            recorded_counts = dict(
                session.query(
                    VoiceRecording.package_id,
                    func.count(func.distinct(VoiceRecording.corpus_text_id))
                ).filter(VoiceRecording.package_id.in_(package_ids))
                .group_by(VoiceRecording.package_id).all()
            )
            for pid in package_ids:
                recording_counts[pid] = {
                    "total": total_counts.get(pid, 0),
                    "recorded": recorded_counts.get(pid, 0),
                }

        result = []
        for pkg in packages:
            collector = users_map.get(pkg.claimed_by)
            group = groups_map.get(pkg.corpus_group_id)
            rec = recording_counts.get(pkg.id, {"total": 0, "recorded": 0})

            result.append({
                "id": pkg.id,
                "name": pkg.name,
                "size": pkg.size,
                "status": pkg.status,
                "review_status": pkg.review_status,
                "review_comment": pkg.review_comment or "",
                "reviewed_at": pkg.reviewed_at.strftime("%Y-%m-%d %H:%M") if pkg.reviewed_at else "",
                "collector_id": pkg.claimed_by,
                "collector_name": collector.username if collector else "",
                "collector_real_name": collector.real_name if collector else "",
                "corpus_group_id": pkg.corpus_group_id,
                "corpus_group_name": group.name if group else "",
                "recorded_count": rec["recorded"],
                "total_count": rec["total"],
            })

        return {"code": 200, "data": result, "total": total}


@app.post("/api/admin/reset-rejected-packages")
def reset_rejected_packages(req: dict):
    """批量重置被打回的包为待标注状态"""
    package_ids = req.get("package_ids", [])
    if not package_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个包")

    with Session(engine) as session:
        packages = session.query(CorpusPackage).filter(
            CorpusPackage.id.in_(package_ids),
            CorpusPackage.review_status == "已打回"
        ).all()

        if not packages:
            raise HTTPException(status_code=400, detail="没有被打回的包")

        reset_count = 0
        for pkg in packages:
            pkg.review_status = "待审核"
            pkg.annotation_status = "待标注"
            pkg.annotation_claimed_by = None
            pkg.annotation_claimed_at = None
            reset_count += 1

        session.commit()

    return {"code": 200, "msg": f"已重置 {reset_count} 个包为待标注状态", "reset_count": reset_count}


# ── 已合格包管理 ─────────────────────────────────────────────────────────────
@app.get("/api/admin/quality-approved-packages")
def get_quality_approved_packages(
    collector_ids: str | None = None,
    annotator_ids: str | None = None,
    inspector_ids: str | None = None,
):
    """获取所有已通过质检审核的包，按语料组分组，支持按采集员/标注员/质检员筛选"""
    with Session(engine) as session:
        # 解析筛选参数（逗号分隔的ID列表）
        collector_id_list = [int(x) for x in collector_ids.split(",") if x.strip()] if collector_ids else []
        annotator_id_list = [int(x) for x in annotator_ids.split(",") if x.strip()] if annotator_ids else []
        inspector_id_list = [int(x) for x in inspector_ids.split(",") if x.strip()] if inspector_ids else []

        # 基础查询
        packages = (
            session.query(CorpusPackage, CorpusGroup.name.label('group_name'))
            .outerjoin(CorpusGroup, CorpusGroup.id == CorpusPackage.corpus_group_id)
            .filter(CorpusPackage.quality_review_status == "已合格")
            .order_by(CorpusPackage.corpus_group_id, CorpusPackage.id)
            .all()
        )

        if not packages:
            return {"code": 200, "data": []}

        package_ids = [p.CorpusPackage.id for p in packages]

        # 批量查询所有录音记录的统计信息
        recording_stats = (
            session.query(
                VoiceRecording.package_id,
                func.count(VoiceRecording.id).label('count'),
                func.min(VoiceRecording.annotated_by).label('annotator_id'),
                func.min(VoiceRecording.inspected_by).label('inspector_id'),
            )
            .filter(
                VoiceRecording.package_id.in_(package_ids),
                VoiceRecording.file_path.isnot(None),
                VoiceRecording.file_path != "",
                VoiceRecording.annotated_text.isnot(None),
                VoiceRecording.annotated_text != "",
                or_(VoiceRecording.is_valid != 0, VoiceRecording.is_valid.is_(None))
            )
            .group_by(VoiceRecording.package_id)
            .all()
        )
        recording_map = {r.package_id: r for r in recording_stats}

        # 批量查询所有相关用户
        all_user_ids = set()
        for row in packages:
            p = row.CorpusPackage
            if p.claimed_by:
                all_user_ids.add(p.claimed_by)
            if p.quality_reviewed_by:
                all_user_ids.add(p.quality_reviewed_by)
        for r in recording_stats:
            if r.annotator_id:
                all_user_ids.add(r.annotator_id)
            if r.inspector_id:
                all_user_ids.add(r.inspector_id)

        users_map = {}
        if all_user_ids:
            users = session.query(User).filter(User.id.in_(all_user_ids)).all()
            for u in users:
                users_map[u.id] = u.real_name or u.username

        def get_user_name(uid):
            return users_map.get(uid) if uid else None

        # 按组分组
        groups_map = {}
        for row in packages:
            p = row.CorpusPackage
            gid = p.corpus_group_id
            if gid not in groups_map:
                groups_map[gid] = {
                    "group_id": gid,
                    "group_name": row.group_name or f"组#{gid}",
                    "packages": [],
                }

            rec_stat = recording_map.get(p.id)
            recording_count = rec_stat.count if rec_stat else 0
            annotator_id = rec_stat.annotator_id if rec_stat else None
            inspector_id = rec_stat.inspector_id if rec_stat else None

            # 应用筛选条件
            if collector_id_list and p.claimed_by not in collector_id_list:
                continue
            if annotator_id_list and annotator_id not in annotator_id_list:
                continue
            if inspector_id_list and inspector_id not in inspector_id_list:
                continue

            groups_map[gid]["packages"].append({
                "id": p.id,
                "name": p.name,
                "collector_id": p.claimed_by,
                "collector": get_user_name(p.claimed_by),
                "annotator_id": annotator_id,
                "annotator": get_user_name(annotator_id),
                "inspector_id": inspector_id,
                "inspector": get_user_name(inspector_id),
                "quality_reviewer": get_user_name(p.quality_reviewed_by),
                "recording_count": recording_count,
                "quality_reviewed_at": p.quality_reviewed_at.strftime("%Y-%m-%d %H:%M") if p.quality_reviewed_at else "",
            })

        # 移除空组
        result = [g for g in groups_map.values() if g["packages"]]
        return {"code": 200, "data": result}


@app.post("/api/admin/reject-packages")
def admin_reject_packages(req: dict):
    """管理员打回已合格的包到指定阶段"""
    package_ids = req.get("package_ids", [])
    target_stage = req.get("target_stage", "")
    reason = req.get("reason", "")

    if not package_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个包")
    if target_stage not in ["annotator", "inspector", "quality_reviewer"]:
        raise HTTPException(status_code=400, detail="目标阶段不合法")

    with Session(engine) as session:
        packages = session.query(CorpusPackage).filter(
            CorpusPackage.id.in_(package_ids),
            CorpusPackage.quality_review_status == "已合格"
        ).all()

        if not packages:
            raise HTTPException(status_code=404, detail="未找到已合格的包")

        for pkg in packages:
            # 清除录音的质检审核标记
            session.query(VoiceRecording).filter_by(package_id=pkg.id).update({
                VoiceRecording.quality_review_action: None,
                VoiceRecording.quality_review_note: None,
            })

            if target_stage == "annotator":
                # 打回到标注员：清除所有标注/质检/审核标记
                pkg.annotated_by = None
                pkg.annotation_status = "待标注"
                pkg.quality_status = "未质检"
                pkg.quality_claimed_by = None
                pkg.quality_claimed_at = None
                pkg.quality_review_status = "未审核"
                pkg.quality_reviewed_by = None
                pkg.quality_reviewed_at = None
                # 清除所有录音的标注标记
                session.query(VoiceRecording).filter_by(package_id=pkg.id).update({
                    VoiceRecording.annotated_by: None,
                    VoiceRecording.annotated_at: None,
                    VoiceRecording.annotated_text: None,
                    VoiceRecording.inspected_by: None,
                    VoiceRecording.inspected_at: None,
                    VoiceRecording.is_valid: None,
                    VoiceRecording.quality_note: None,
                    VoiceRecording.annotation_note: None,
                })

            elif target_stage == "inspector":
                # 打回到质检员：保留标注，清除质检/审核标记
                pkg.annotation_status = "已标注"
                pkg.quality_status = "待质检"
                pkg.quality_claimed_by = None
                pkg.quality_claimed_at = None
                pkg.quality_review_status = "未审核"
                pkg.quality_reviewed_by = None
                pkg.quality_reviewed_at = None
                # 清除录音的质检标记
                session.query(VoiceRecording).filter_by(package_id=pkg.id).update({
                    VoiceRecording.inspected_by: None,
                    VoiceRecording.is_valid: None,
                    VoiceRecording.quality_note: None,
                })

            elif target_stage == "quality_reviewer":
                # 打回到质检审核员：保留标注和质检，清除审核标记
                pkg.annotation_status = "已标注"
                pkg.quality_status = "已质检"
                pkg.quality_review_status = "待审核"
                pkg.quality_reviewed_by = None
                pkg.quality_reviewed_at = None

            # 记录打回原因
            if reason:
                pkg.review_comment = f"[管理员打回] {reason}"

        session.commit()

        stage_names = {
            "annotator": "标注员",
            "inspector": "质检员",
            "quality_reviewer": "质检审核员",
        }

        return {
            "code": 200,
            "msg": f"已将 {len(packages)} 个包打回到{stage_names[target_stage]}",
            "rejected_count": len(packages),
        }


# ── 无效语料查询 ──────────────────────────────────────────────
@app.get("/api/admin/invalid-recordings")
def get_invalid_recordings(
    user_id: int = Query(..., description="管理员ID"),
    collector_id: int | None = Query(None, description="按采集员筛选"),
    group_id: int | None = Query(None, description="按语料组筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
):
    """获取所有被标记为无效的语料（is_valid=0）"""
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role not in ('manager', 'sub_manager'):
            raise HTTPException(status_code=403, detail="无权限")

        q = session.query(VoiceRecording).filter(VoiceRecording.is_valid == 0)
        if collector_id:
            q = q.filter(VoiceRecording.collector_id == collector_id)
        if group_id:
            pkg_ids_sq = session.query(CorpusPackage.id).filter(CorpusPackage.corpus_group_id == group_id).subquery()
            q = q.filter(VoiceRecording.package_id.in_(select(pkg_ids_sq)))
        total = q.count()
        recordings = q.order_by(VoiceRecording.submitted_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

        if not recordings:
            return {"code": 200, "data": [], "total": total}

        # 批量查询采集员
        collector_ids = list(set(r.collector_id for r in recordings if r.collector_id))
        collectors_map = {}
        if collector_ids:
            for u in session.query(User).filter(User.id.in_(collector_ids)).all():
                collectors_map[u.id] = u

        # 批量查询标注员
        annotator_ids = list(set(r.annotated_by for r in recordings if r.annotated_by))
        annotators_map = {}
        if annotator_ids:
            for u in session.query(User).filter(User.id.in_(annotator_ids)).all():
                annotators_map[u.id] = u

        # 批量查询语料文本
        text_ids = list(set(r.corpus_text_id for r in recordings if r.corpus_text_id))
        texts_map = {}
        if text_ids:
            for t in session.query(CorpusText).filter(CorpusText.id.in_(text_ids)).all():
                texts_map[t.id] = t

        # 批量查询包
        pkg_ids = list(set(r.package_id for r in recordings if r.package_id))
        pkgs_map = {}
        groups_map = {}
        if pkg_ids:
            for p in session.query(CorpusPackage).filter(CorpusPackage.id.in_(pkg_ids)).all():
                pkgs_map[p.id] = p
            group_ids = list(set(p.corpus_group_id for p in pkgs_map.values() if p.corpus_group_id))
            if group_ids:
                for g in session.query(CorpusGroup).filter(CorpusGroup.id.in_(group_ids)).all():
                    groups_map[g.id] = g

        result = []
        for rec in recordings:
            collector = collectors_map.get(rec.collector_id)
            annotator = annotators_map.get(rec.annotated_by) if rec.annotated_by else None
            corpus_text = texts_map.get(rec.corpus_text_id)
            pkg = pkgs_map.get(rec.package_id)
            group = groups_map.get(pkg.corpus_group_id) if pkg else None

            result.append({
                "id": rec.id,
                "collector_username": collector.username if collector else "",
                "collector_real_name": collector.real_name if collector else "",
                "original_text": corpus_text.content if corpus_text else "",
                "annotated_text": rec.annotated_text or "",
                "annotation_note": rec.annotation_note or "",
                "quality_note": rec.quality_note or "",
                "quality_review_note": rec.quality_review_note or "",
                "annotated_by_name": (annotator.real_name or annotator.username) if annotator else "",
                "package_name": pkg.name if pkg else "",
                "package_status": pkg.status if pkg else "",
                "group_name": group.name if group else "",
                "file_path": rec.file_path or "",
                "duration_seconds": rec.duration_seconds or 0,
                "submitted_at": rec.submitted_at.strftime("%Y-%m-%d %H:%M:%S") if rec.submitted_at else "",
            })

        return {"code": 200, "data": result, "total": total}


@app.get("/api/admin/invalid-recordings/export")
def export_invalid_recordings_csv(
    user_id: int = Query(..., description="管理员ID"),
    collector_id: int | None = Query(None, description="按采集员筛选"),
    group_id: int | None = Query(None, description="按语料组筛选"),
):
    """导出所有无效语料为CSV（流式输出，支持大数据量）"""
    with Session(engine) as session:
        user = session.query(User).filter_by(id=user_id).first()
        if not user or user.role not in ('manager', 'sub_manager'):
            raise HTTPException(status_code=403, detail="无权限")

        def generate():
            yield '\ufeff'  # BOM for Excel
            header = 'ID,采集员账号,采集员姓名,原始语料,标注文本,标注备注,质检备注,质检审核备注,标注员,所属语料组,包名称,包状态,时长(秒),提交时间\n'
            yield header

            q = session.query(VoiceRecording).filter(VoiceRecording.is_valid == 0)
            if collector_id:
                q = q.filter(VoiceRecording.collector_id == collector_id)
            if group_id:
                pkg_ids_sq = session.query(CorpusPackage.id).filter(CorpusPackage.corpus_group_id == group_id).subquery()
                q = q.filter(VoiceRecording.package_id.in_(select(pkg_ids_sq)))

            BATCH = 1000
            offset = 0
            while True:
                recs = q.order_by(VoiceRecording.submitted_at.desc()).offset(offset).limit(BATCH).all()
                if not recs:
                    break

                c_ids = list(set(r.collector_id for r in recs if r.collector_id))
                a_ids = list(set(r.annotated_by for r in recs if r.annotated_by))
                t_ids = list(set(r.corpus_text_id for r in recs if r.corpus_text_id))
                p_ids = list(set(r.package_id for r in recs if r.package_id))

                c_map = {u.id: u for u in session.query(User).filter(User.id.in_(c_ids)).all()} if c_ids else {}
                a_map = {u.id: u for u in session.query(User).filter(User.id.in_(a_ids)).all()} if a_ids else {}
                t_map = {t.id: t for t in session.query(CorpusText).filter(CorpusText.id.in_(t_ids)).all()} if t_ids else {}

                p_map = {}
                g_map = {}
                if p_ids:
                    for p in session.query(CorpusPackage).filter(CorpusPackage.id.in_(p_ids)).all():
                        p_map[p.id] = p
                    g_ids = list(set(p.corpus_group_id for p in p_map.values() if p.corpus_group_id))
                    if g_ids:
                        for g in session.query(CorpusGroup).filter(CorpusGroup.id.in_(g_ids)).all():
                            g_map[g.id] = g

                for rec in recs:
                    c = c_map.get(rec.collector_id)
                    a = a_map.get(rec.annotated_by) if rec.annotated_by else None
                    t = t_map.get(rec.corpus_text_id)
                    p = p_map.get(rec.package_id)
                    g = g_map.get(p.corpus_group_id) if p else None

                    row = [
                        rec.id,
                        c.username if c else "",
                        c.real_name if c else "",
                        t.content if t else "",
                        rec.annotated_text or "",
                        rec.annotation_note or "",
                        rec.quality_note or "",
                        rec.quality_review_note or "",
                        (a.real_name or a.username) if a else "",
                        g.name if g else "",
                        p.name if p else "",
                        p.status if p else "",
                        rec.duration_seconds or 0,
                        rec.submitted_at.strftime("%Y-%m-%d %H:%M:%S") if rec.submitted_at else "",
                    ]
                    line = ','.join(f'"{str(v).replace(chr(34), chr(34)+chr(34))}"' for v in row)
                    yield line + '\n'

                offset += BATCH

        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=invalid_recordings_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )


if __name__ == '__main__':
    init_db()
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, access_log=False)
