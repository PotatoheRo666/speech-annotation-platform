// WAV 处理 Web Worker
// 负责：重采样、声音检测、WAV 编码，避免阻塞主线程

self.onmessage = function(e) {
  const { audioBuffer, originalSampleRate, targetSampleRate } = e.data;

  try {
    const originalData = audioBuffer; // Float32Array

    // 重采样到 16kHz
    let pcmData;
    if (originalSampleRate === targetSampleRate) {
      pcmData = originalData;
    } else {
      const ratio = targetSampleRate / originalSampleRate;
      const newLength = Math.round(originalData.length * ratio);
      pcmData = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const inputPosition = i / ratio;
        const inputIndexFloor = Math.floor(inputPosition);
        const inputIndexCeil = Math.min(inputIndexFloor + 1, originalData.length - 1);
        const fraction = inputPosition - inputIndexFloor;
        pcmData[i] =
          originalData[inputIndexFloor] * (1 - fraction) +
          originalData[inputIndexCeil] * fraction;
      }
    }

    // 声音检测 (降低阈值防止截断声音)
    const threshold = 0.005;
    let voiceStart = 0;
    for (let i = 0; i < pcmData.length; i++) {
      if (Math.abs(pcmData[i]) > threshold) {
        voiceStart = Math.max(0, i - Math.round(targetSampleRate * 0.3)); // 预留0.3s
        break;
      }
    }
    let voiceEnd = pcmData.length - 1;
    for (let i = pcmData.length - 1; i >= 0; i--) {
      if (Math.abs(pcmData[i]) > threshold) {
        voiceEnd = Math.min(i + Math.round(targetSampleRate * 0.5), pcmData.length - 1); // 预留0.5s尾音
        break;
      }
    }

    if (voiceStart >= voiceEnd) {
      self.postMessage({ type: 'error', message: '未检测到声音，请重录' });
      return;
    }

    // 提取有效声音段
    const leadingSilence = Math.round(targetSampleRate * 0.5);
    const trailingSilence = Math.round(targetSampleRate * 0.5);
    const voiceLength = Math.max(1, voiceEnd - voiceStart + 1);
    const totalLength = leadingSilence + voiceLength + trailingSilence;
    const combinedData = new Float32Array(totalLength);
    for (let i = 0; i < voiceLength; i++) {
      combinedData[leadingSilence + i] = pcmData[voiceStart + i];
    }

    // 编码为 16-bit PCM WAV
    const int16Data = new Int16Array(combinedData.length);
    for (let i = 0; i < combinedData.length; i++) {
      const s = Math.max(-1, Math.min(1, combinedData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const headerLength = 44;
    const dataLength = int16Data.length * 2;
    const fileLength = headerLength + dataLength;
    const wavBuffer = new ArrayBuffer(fileLength);
    const view = new DataView(wavBuffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, fileLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    const dataView = new Int16Array(wavBuffer, headerLength);
    dataView.set(int16Data);

    // 把结果 ArrayBuffer 传回主线程（零拷贝 transfer）
    self.postMessage({ type: 'success', wavBuffer }, [wavBuffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: '音频处理失败: ' + err.message });
  }
};
