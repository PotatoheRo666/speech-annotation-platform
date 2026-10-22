"""
导出后处理脚本
用于处理导出的 zip 文件，添加语音边界检测和 MD5 哈希

用法:
    python post_process_export.py <input.zip> [output.zip]

功能:
    1. 检测每条录音的语音开始/结束时间
    2. 计算每条录音的 MD5 哈希
    3. 更新 metadata 文件
    4. 生成新的 zip 文件
"""

import sys
import os
import json
import hashlib
import zipfile
import tempfile
import shutil
from pathlib import Path

# 尝试导入音频处理库
try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("[警告] librosa 未安装，无法进行语音边界检测")
    print("       安装命令: pip install librosa")

try:
    import webrtcvad
    VAD_AVAILABLE = True
except ImportError:
    VAD_AVAILABLE = False
    print("[警告] webrtcvad 未安装，无法进行语音边界检测")
    print("       安装命令: pip install webrtcvad")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("[警告] numpy 未安装，无法进行语音边界检测")
    print("       安装命令: pip install numpy")


def calc_audio_md5(audio_data: bytes) -> str:
    """计算音频文件的 MD5 哈希"""
    return hashlib.md5(audio_data).hexdigest()


def detect_speech_boundaries(audio_bytes: bytes) -> tuple:
    """
    使用 WebRTC VAD 检测语音段的开始和结束时间
    返回 (start_time, end_time)
    """
    if not VAD_AVAILABLE or not LIBROSA_AVAILABLE or not NUMPY_AVAILABLE:
        return (0.0, 0.0)

    try:
        import io

        # 用 librosa 读取音频
        audio_data, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)

        # 重采样到 16kHz（webrtcvad 要求）
        if sr != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)

        # 转换为 int16
        audio_int16 = np.int16(audio_data * 32767)
        audio_bytes_16k = audio_int16.tobytes()

        # 初始化 VAD（mode=3 为最激进，检测能力最强）
        vad = webrtcvad.Vad(3)

        # 处理 10ms 帧
        frame_duration_ms = 10
        frame_size = int(16000 * frame_duration_ms / 1000)  # 160 samples per frame

        speech_frames = []
        for i in range(0, len(audio_bytes_16k), frame_size * 2):  # *2 因为是 int16
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
        print(f"  [警告] 语音边界检测失败: {e}")
        return (0.0, 0.0)


def process_metadata_item(item: dict, audio_dir: str) -> dict:
    """处理单条 metadata，添加 MD5 和语音边界"""
    audio_path = os.path.join(audio_dir, os.path.basename(item.get("audio_path", "")))
    
    if not os.path.exists(audio_path):
        print(f"  [跳过] 音频文件不存在: {audio_path}")
        return item
    
    # 读取音频文件
    with open(audio_path, 'rb') as f:
        audio_data = f.read()
    
    # 计算 MD5
    audio_md5 = calc_audio_md5(audio_data)
    item["audio_md5"] = audio_md5
    
    # 检测语音边界
    if item.get("segments"):
        for segment in item["segments"]:
            # 只有当 start_time 和 end_time 都是 0.0 时才检测
            if segment.get("start_time", 0.0) == 0.0 and segment.get("end_time", 0.0) == 0.0:
                start_time, end_time = detect_speech_boundaries(audio_data)
                segment["start_time"] = start_time
                segment["end_time"] = end_time
                print(f"  [检测] {os.path.basename(audio_path)}: {start_time}s - {end_time}s")
            else:
                print(f"  [跳过] {os.path.basename(audio_path)}: 已有时间信息")
    
    return item


def process_export_zip(input_zip: str, output_zip: str = None):
    """处理导出的 zip 文件"""
    if not os.path.exists(input_zip):
        print(f"[错误] 文件不存在: {input_zip}")
        return
    
    if output_zip is None:
        # 默认在原文件名基础上加 _processed
        base, ext = os.path.splitext(input_zip)
        output_zip = f"{base}_processed{ext}"
    
    print(f"[信息] 输入文件: {input_zip}")
    print(f"[信息] 输出文件: {output_zip}")
    
    # 创建临时目录
    temp_dir = tempfile.mkdtemp()
    
    try:
        # 解压 zip 文件
        print("[信息] 解压文件...")
        with zipfile.ZipFile(input_zip, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
        
        # 找到所有 metadata 文件
        metadata_files = []
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith('_metadata_1.jsonl') or file.endswith('_metadata_2.jsonl'):
                    metadata_files.append(os.path.join(root, file))
        
        if not metadata_files:
            print("[错误] 未找到 metadata 文件")
            return
        
        print(f"[信息] 找到 {len(metadata_files)} 个 metadata 文件")
        
        # 处理每个 metadata 文件
        for metadata_file in metadata_files:
            print(f"\n[处理] {os.path.basename(metadata_file)}")
            
            # 获取音频目录（metadata 文件所在目录的 audio 子目录）
            audio_dir = os.path.join(os.path.dirname(metadata_file), "audio")
            if not os.path.exists(audio_dir):
                print(f"  [警告] 音频目录不存在: {audio_dir}")
                continue
            
            # 读取 metadata
            items = []
            with open(metadata_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        items.append(json.loads(line))
            
            print(f"  [信息] 共 {len(items)} 条记录")
            
            # 处理每条记录
            processed_items = []
            for i, item in enumerate(items):
                print(f"\n  [{i+1}/{len(items)}] 处理: {item.get('audio_id', 'unknown')}")
                processed_item = process_metadata_item(item, audio_dir)
                processed_items.append(processed_item)
            
            # 写回 metadata 文件
            with open(metadata_file, 'w', encoding='utf-8') as f:
                for item in processed_items:
                    f.write(json.dumps(item, ensure_ascii=False) + '\n')
            
            print(f"\n  [完成] 已更新 {metadata_file}")
        
        # 创建新的 zip 文件
        print(f"\n[信息] 创建新的 zip 文件: {output_zip}")
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, temp_dir)
                    zipf.write(file_path, arcname)
        
        print(f"\n[完成] 处理完成！")
        print(f"[完成] 输出文件: {output_zip}")
        print(f"[完成] 文件大小: {os.path.getsize(output_zip) / 1024 / 1024:.2f} MB")
        
    except Exception as e:
        print(f"[错误] 处理失败: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    if len(sys.argv) < 2:
        print("用法: python post_process_export.py <input.zip> [output.zip]")
        print("")
        print("功能:")
        print("  1. 检测每条录音的语音开始/结束时间")
        print("  2. 计算每条录音的 MD5 哈希")
        print("  3. 更新 metadata 文件")
        print("  4. 生成新的 zip 文件")
        print("")
        print("依赖:")
        print("  pip install librosa webrtcvad numpy")
        sys.exit(1)
    
    input_zip = sys.argv[1]
    output_zip = sys.argv[2] if len(sys.argv) > 2 else None
    
    # 检查依赖
    if not LIBROSA_AVAILABLE or not VAD_AVAILABLE or not NUMPY_AVAILABLE:
        print("\n[警告] 缺少依赖库，语音边界检测将被跳过")
        print("       安装命令: pip install librosa webrtcvad numpy")
        print("")
        response = input("是否继续？(y/n): ")
        if response.lower() != 'y':
            sys.exit(0)
    
    process_export_zip(input_zip, output_zip)


if __name__ == "__main__":
    main()
