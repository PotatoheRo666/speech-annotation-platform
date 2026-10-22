"""
批量裁剪录音文件：将目录中所有 WAV 的前后留白裁剪到 0.3 秒
并更新 metadata JSONL 文件中的 start_time、end_time、duration

用法: python trim_audio_files.py <目录路径>
示例: python trim_audio_files.py ds_20260507/quanzhou/audio
"""

import io
import os
import sys
import json
import wave
import numpy as np

SILENCE_SECONDS = 0.5
THRESHOLD = 0.02

try:
    import librosa
except ImportError:
    print("❌ 需要安装 librosa: pip install librosa")
    sys.exit(1)


def load_wav(wav_path: str):
    with wave.open(wav_path, 'rb') as wf:
        sr = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sampwidth != 2:
        raise ValueError(f"不支持 {sampwidth*8}bit 采样位深")

    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if n_channels > 1:
        audio = audio[::n_channels]
    return audio, sr


def trim_audio(audio: np.ndarray, sr: int, silence_samples: int) -> np.ndarray:
    # 找声音边界
    voice_start = None
    voice_end = None
    for i in range(len(audio)):
        if abs(audio[i]) > THRESHOLD:
            voice_start = i
            break
    for i in range(len(audio) - 1, -1, -1):
        if abs(audio[i]) > THRESHOLD:
            voice_end = i
            break

    if voice_start is None:
        return audio  # 全静默，不动

    voice = audio[voice_start:voice_end + 1]
    result = np.zeros(silence_samples + len(voice) + silence_samples, dtype=np.float32)
    result[silence_samples:silence_samples + len(voice)] = voice
    return result


def save_wav(audio: np.ndarray, sr: int, path: str):
    int16 = np.clip(audio * 32768, -32768, 32767).astype(np.int16)
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int16.tobytes())


def find_metadata_files(audio_dir: str) -> list:
    """查找对应的 metadata JSONL 文件和 dataset_info.json 文件"""
    # audio 目录的父目录
    parent_dir = os.path.dirname(audio_dir)
    metadata_files = []
    dataset_info_file = None
    
    for f in os.listdir(parent_dir):
        if f.endswith('_metadata_1.jsonl') or f.endswith('_metadata_2.jsonl'):
            metadata_files.append(os.path.join(parent_dir, f))
        elif f.endswith('_dataset_info.json'):
            dataset_info_file = os.path.join(parent_dir, f)
    
    return metadata_files, dataset_info_file


def load_metadata(metadata_files: list) -> dict:
    """加载所有 metadata 文件，返回 {audio_filename: (file_path, line_index, item)} 的映射"""
    metadata_map = {}
    
    for file_path in metadata_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_index, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    audio_path = item.get('audio_path', '')
                    # 提取文件名: audio/spk10001_quanzhou_001.wav -> spk10001_quanzhou_001.wav
                    audio_filename = os.path.basename(audio_path)
                    if audio_filename:
                        metadata_map[audio_filename] = (file_path, line_index, item)
                except json.JSONDecodeError:
                    continue
    
    return metadata_map


def update_metadata(metadata_map: dict, audio_filename: str, new_duration: float):
    """更新 metadata 中对应音频的时长信息"""
    if audio_filename not in metadata_map:
        return False
    
    file_path, line_index, item = metadata_map[audio_filename]
    
    # 更新 duration
    item['duration'] = round(new_duration, 3)
    
    # 更新 segments 中的 start_time 和 end_time
    if 'segments' in item:
        for segment in item['segments']:
            segment['start_time'] = 0.3  # 留白
            segment['end_time'] = round(new_duration - 0.3, 3)  # 减去尾部留白
    
    # 更新 map 中的数据
    metadata_map[audio_filename] = (file_path, line_index, item)
    return True


def save_metadata(metadata_files: list, metadata_map: dict):
    """保存更新后的 metadata 到文件"""
    # 按文件分组
    file_items = {}
    for audio_filename, (file_path, line_index, item) in metadata_map.items():
        if file_path not in file_items:
            file_items[file_path] = {}
        file_items[file_path][line_index] = item
    
    # 写入每个文件
    for file_path, items_by_index in file_items.items():
        # 读取原有内容
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # 更新对应行
        for line_index, item in items_by_index.items():
            if line_index < len(lines):
                lines[line_index] = json.dumps(item, ensure_ascii=False) + '\n'
        
        # 写回文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)


def update_dataset_info(dataset_info_file: str, metadata_map: dict):
    """更新 dataset_info.json 中的总时长"""
    if not dataset_info_file or not os.path.exists(dataset_info_file):
        return
    
    # 读取原有内容
    with open(dataset_info_file, 'r', encoding='utf-8') as f:
        dataset_info = json.load(f)
    
    # 计算新的总时长（从 metadata 中获取）
    total_duration = 0
    total_files = 0
    for audio_filename, (_, _, item) in metadata_map.items():
        duration = item.get('duration', 0)
        if duration > 0:
            total_duration += duration
            total_files += 1
    
    # 更新字段
    dataset_info['total_duration_seconds'] = int(total_duration)
    # total_files 保持不变（音频文件数量没有变化）
    
    # 写回文件
    with open(dataset_info_file, 'w', encoding='utf-8') as f:
        json.dump(dataset_info, f, indent=2, ensure_ascii=False)
    
    print(f"✅ 更新 dataset_info: 总时长 {int(total_duration)} 秒")


def main():
    if len(sys.argv) < 2:
        print("用法: python trim_audio_files.py <audio目录>")
        print("示例: python trim_audio_files.py ds_20260507/quanzhou/audio")
        sys.exit(1)

    audio_dir = sys.argv[1]
    if not os.path.isdir(audio_dir):
        print(f"❌ 目录不存在: {audio_dir}")
        sys.exit(1)

    wav_files = sorted([f for f in os.listdir(audio_dir) if f.lower().endswith('.wav')])
    total = len(wav_files)
    print(f"📂 目录: {audio_dir}")
    print(f"📊 共 {total} 个 WAV 文件")
    print(f"🎯 目标留白: {SILENCE_SECONDS} 秒")
    print()

    # 查找并加载 metadata 文件
    metadata_files, dataset_info_file = find_metadata_files(audio_dir)
    if metadata_files:
        print(f"📋 找到 {len(metadata_files)} 个 metadata 文件:")
        for f in metadata_files:
            print(f"   - {os.path.basename(f)}")
        metadata_map = load_metadata(metadata_files)
        print(f"📋 加载了 {len(metadata_map)} 条 metadata 记录")
    else:
        print("⚠️  未找到 metadata 文件，将只裁剪音频")
        metadata_map = {}
    
    if dataset_info_file:
        print(f"📋 找到 dataset_info 文件: {os.path.basename(dataset_info_file)}")
    print()

    trimmed = 0
    skipped = 0
    errors = 0
    metadata_updated = 0

    for i, filename in enumerate(wav_files, 1):
        filepath = os.path.join(audio_dir, filename)
        try:
            audio, sr = load_wav(filepath)
            silence_samples = int(sr * SILENCE_SECONDS)

            # 检测声音边界
            voice_start = None
            voice_end = None
            for j in range(len(audio)):
                if abs(audio[j]) > THRESHOLD:
                    voice_start = j
                    break
            for j in range(len(audio) - 1, -1, -1):
                if abs(audio[j]) > THRESHOLD:
                    voice_end = j
                    break

            if voice_start is None:
                skipped += 1
                continue

            leading = voice_start / sr
            trailing = (len(audio) - voice_end - 1) / sr

            # 已经符合要求（留 0.05s 容差）
            if leading <= SILENCE_SECONDS + 0.05 and trailing <= SILENCE_SECONDS + 0.05:
                skipped += 1
                continue

            # 裁剪并保存
            trimmed_audio = trim_audio(audio, sr, silence_samples)
            save_wav(trimmed_audio, sr, filepath)
            trimmed += 1

            # 计算新的时长
            new_duration = len(trimmed_audio) / sr

            # 更新 metadata
            if metadata_map:
                if update_metadata(metadata_map, filename, new_duration):
                    metadata_updated += 1

            if i % 50 == 0 or i == total:
                print(f"  [{i}/{total}] ✂️  {filename}  前:{leading:.2f}s→0.3s  后:{trailing:.2f}s→0.3s  时长:{new_duration:.2f}s")

        except Exception as e:
            errors += 1
            print(f"  [{i}/{total}] ❌ {filename}: {e}")

    # 保存更新后的 metadata
    if metadata_map and metadata_updated > 0:
        print(f"\n📝 正在更新 metadata 文件...")
        save_metadata(metadata_files, metadata_map)
        print(f"✅ 更新了 {metadata_updated} 条 metadata 记录")
    
    # 始终更新 dataset_info.json（即使全部跳过）
    if dataset_info_file and metadata_map:
        print(f"\n📝 正在更新 dataset_info 文件...")
        update_dataset_info(dataset_info_file, metadata_map)

    print()
    print(f"{'='*40}")
    print(f"✅ 已裁剪: {trimmed}")
    print(f"⏭️  跳过(正常): {skipped}")
    print(f"❌ 失败: {errors}")
    print(f"📝 metadata 更新: {metadata_updated}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ 发生错误: {e}")
    input("\n按回车键退出...")
