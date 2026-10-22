"""
批量裁剪录音：将 OSS 中所有录音的前后留白裁剪到 0.3 秒
用法: python trim_recordings.py [--dry-run] [--limit N] [--package-id ID]
  --dry-run   只统计，不实际修改
  --limit N   最多处理 N 条
  --package-id ID  只处理指定包
"""

import io
import os
import sys
import wave
import struct
import argparse
import numpy as np
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

load_dotenv()

# ── 配置 ────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'app.db')}")
SILENCE_SECONDS = 0.3
THRESHOLD = 0.02  # 声音检测阈值

# ── 初始化 ────────────────────────────────────────────────────────
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10)

from storage_client import get_storage_client
storage_client = get_storage_client()
BUCKET_NAME = os.getenv("ALIYUN_BUCKET_NAME", os.getenv("MINIO_BUCKET_NAME", "test"))

# 尝试导入 librosa
try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("⚠️  librosa 未安装，无法处理")


def load_wav(wav_data: bytes):
    """加载 WAV 数据，返回 (audio_data_float32, sample_rate)"""
    with wave.open(io.BytesIO(wav_data), 'rb') as wf:
        sr = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth == 2:
        audio_int16 = np.frombuffer(raw, dtype=np.int16)
        audio_float = audio_int16.astype(np.float32) / 32768.0
    else:
        raise ValueError(f"不支持的采样位深: {sampwidth * 8}bit")

    if n_channels > 1:
        audio_float = audio_float[::n_channels]  # 取第一声道

    return audio_float, sr


def trim_audio(audio_data: np.ndarray, sr: int, silence_samples: int):
    """裁剪音频：去除前后静默，保留 voice + 前后 silence_samples"""
    # 找到声音开始位置
    voice_start = 0
    for i in range(len(audio_data)):
        if abs(audio_data[i]) > THRESHOLD:
            voice_start = i
            break
    else:
        # 全是静默，返回原始音频
        return audio_data

    # 找到声音结束位置
    voice_end = len(audio_data) - 1
    for i in range(len(audio_data) - 1, -1, -1):
        if abs(audio_data[i]) > THRESHOLD:
            voice_end = i
            break

    # 提取声音部分
    voice_data = audio_data[voice_start:voice_end + 1]

    # 创建带留白的音频：前 silence + voice + 后 silence
    total_length = silence_samples + len(voice_data) + silence_samples
    result = np.zeros(total_length, dtype=np.float32)
    result[silence_samples:silence_samples + len(voice_data)] = voice_data

    return result


def encode_wav(audio_data: np.ndarray, sr: int) -> bytes:
    """将 float32 音频编码为 WAV bytes"""
    # 转为 int16
    audio_int16 = np.clip(audio_data * 32768, -32768, 32767).astype(np.int16)

    # 写入 WAV
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(audio_int16.tobytes())

    return buf.getvalue()


def get_wav_duration(wav_data: bytes) -> int:
    """获取 WAV 时长（秒）"""
    try:
        with wave.open(io.BytesIO(wav_data), 'rb') as wf:
            return int(wf.getnframes() / wf.getframerate())
    except:
        return 0


def process_recording(recording_id: int, file_path: str, dry_run: bool) -> dict:
    """处理单条录音"""
    result = {"id": recording_id, "status": "skip", "old_duration": 0, "new_duration": 0}

    if not file_path:
        result["status"] = "no_file"
        return result

    if not LIBROSA_AVAILABLE:
        result["status"] = "no_librosa"
        return result

    try:
        # 下载
        wav_data = storage_client.get_object(BUCKET_NAME, file_path)
        if not wav_data:
            result["status"] = "download_failed"
            return result

        # 加载
        audio_data, sr = load_wav(wav_data)
        result["old_duration"] = len(audio_data) / sr

        # 计算留白样本数
        silence_samples = int(sr * SILENCE_SECONDS)

        # 检测声音边界
        voice_start = None
        voice_end = None
        for i in range(len(audio_data)):
            if abs(audio_data[i]) > THRESHOLD:
                voice_start = i
                break
        for i in range(len(audio_data) - 1, -1, -1):
            if abs(audio_data[i]) > THRESHOLD:
                voice_end = i
                break

        if voice_start is None or voice_end is None:
            result["status"] = "silent"
            return result

        # 计算当前前后留白
        leading_silence = voice_start / sr
        trailing_silence = (len(audio_data) - voice_end - 1) / sr

        # 检查是否需要裁剪
        if leading_silence <= SILENCE_SECONDS + 0.05 and trailing_silence <= SILENCE_SECONDS + 0.05:
            result["status"] = "ok"
            result["new_duration"] = result["old_duration"]
            return result

        if dry_run:
            result["status"] = "needs_trim"
            result["leading"] = round(leading_silence, 3)
            result["trailing"] = round(trailing_silence, 3)
            return result

        # 裁剪
        trimmed = trim_audio(audio_data, sr, silence_samples)
        new_wav = encode_wav(trimmed, sr)
        result["new_duration"] = get_wav_duration(new_wav)

        # 上传覆盖
        storage_client.put_object(BUCKET_NAME, file_path, new_wav, "audio/wav")
        result["status"] = "trimmed"
        return result

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)
        return result


def main():
    parser = argparse.ArgumentParser(description="批量裁剪录音前后留白到0.3秒")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不实际修改")
    parser.add_argument("--limit", type=int, default=0, help="最多处理N条（0=不限）")
    parser.add_argument("--package-id", type=int, default=0, help="只处理指定包")
    args = parser.parse_args()

    if not LIBROSA_AVAILABLE:
        print("❌ librosa 未安装，请先 pip install librosa")
        sys.exit(1)

    print(f"{'🔍 DRY RUN 模式' if args.dry_run else '🔧 开始批量裁剪'}")
    print(f"   目标留白: {SILENCE_SECONDS} 秒")
    print()

    with Session(engine) as session:
        # 查询需要处理的录音
        sql = """
            SELECT id, file_path, package_id
            FROM voice_recordings
            WHERE file_path IS NOT NULL AND file_path != ''
        """
        if args.package_id:
            sql += f" AND package_id = {args.package_id}"
        sql += " ORDER BY id"
        if args.limit:
            sql += f" LIMIT {args.limit}"

        rows = session.execute(text(sql)).fetchall()
        total = len(rows)
        print(f"📊 共 {total} 条录音需要检查")

        stats = {"ok": 0, "trimmed": 0, "needs_trim": 0, "silent": 0, "no_file": 0, "error": 0, "download_failed": 0}
        errors = []

        for i, (rec_id, file_path, pkg_id) in enumerate(rows, 1):
            result = process_recording(rec_id, file_path, args.dry_run)
            stats[result["status"]] = stats.get(result["status"], 0) + 1

            if result["status"] == "trimmed":
                # 更新数据库中的时长
                session.execute(
                    text("UPDATE voice_recordings SET duration_seconds = :dur WHERE id = :id"),
                    {"dur": int(result["new_duration"]), "id": rec_id}
                )
                session.commit()

            if result["status"] == "error":
                errors.append(f"  #{rec_id}: {result.get('error', '未知错误')}")

            # 进度显示
            status_icon = {
                "ok": "✅", "trimmed": "✂️", "needs_trim": "🔧",
                "silent": "🔇", "no_file": "⏭️", "error": "❌",
                "download_failed": "📥"
            }.get(result["status"], "❓")

            if result["status"] not in ("ok",):
                leading = result.get("leading", "")
                trailing = result.get("trailing", "")
                detail = ""
                if leading != "":
                    detail = f" (前:{leading}s 后:{trailing}s)"
                print(f"  [{i}/{total}] {status_icon} #{rec_id} 包#{pkg_id} {result['status']}{detail}")

            if i % 100 == 0:
                print(f"  ... 进度 {i}/{total} ...")

        # 更新包的时长统计
        if not args.dry_run and stats["trimmed"] > 0:
            print("\n📦 更新包的录音时长统计...")
            session.execute(text("""
                UPDATE corpus_packages SET
                    collector_real_name = collector_real_name
                WHERE id IN (
                    SELECT DISTINCT package_id FROM voice_recordings WHERE duration_seconds > 0
                )
            """))
            session.commit()

    # 输出统计
    print(f"\n{'='*50}")
    print(f"📊 统计结果:")
    print(f"   ✅ 正常(无需裁剪): {stats['ok']}")
    print(f"   ✂️  已裁剪:         {stats['trimmed']}")
    if args.dry_run:
        print(f"   🔧 需要裁剪:       {stats['needs_trim']}")
    print(f"   🔇 全静默:         {stats['silent']}")
    print(f"   ⏭️  无文件:         {stats['no_file']}")
    print(f"   📥 下载失败:       {stats['download_failed']}")
    print(f"   ❌ 处理失败:       {stats['error']}")

    if errors:
        print(f"\n❌ 错误详情:")
        for e in errors[:20]:
            print(e)
        if len(errors) > 20:
            print(f"  ... 还有 {len(errors) - 20} 个错误")


if __name__ == "__main__":
    main()
