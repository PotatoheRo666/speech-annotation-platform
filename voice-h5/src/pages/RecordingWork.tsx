import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Mic, RotateCcw, Play, Send, SkipForward } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';

// 生成2秒静默WAV
const createSilentWav = (): Blob => {
  const sampleRate = 16000;
  const duration = 2;
  const numSamples = sampleRate * duration;
  const headerLength = 44;
  const dataLength = numSamples * 2;
  const fileLength = headerLength + dataLength;

  const buffer = new Uint8Array(fileLength);
  const view = new DataView(buffer.buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
  };

  writeString(0, 'RIFF');
  view.setUint32(4, fileLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  return new Blob([buffer], { type: 'audio/wav' });
};

interface Corpus {
  id: number;
  text_id: string;
  content: string;
  recorded: boolean;
  note?: string;
}

interface Props {
  package: {
    id: number;
    name: string;
    size: number;
    corpus_group_name: string;
    review_status?: string;
  };
  userId: number;
  onBack: () => void;
  onComplete: () => void;
}

const RecordingWork: React.FC<Props> = ({ package: pkg, userId, onBack, onComplete }) => {
  const [corpus, setCorpus] = useState<Corpus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unrecordedCount, setUnrecordedCount] = useState(0);
  const [resettingRecording, setResettingRecording] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [isPackageCompleted, setIsPackageCompleted] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [releasing, setReleasing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silentBlobRef = useRef<Blob | null>(null);
  const wavWorkerRef = useRef<Worker | null>(null);

  // 初始化：获取语料列表，并防止返回按钮离开页面
  useEffect(() => {
    fetchCorpus();

    // 防止通过返回键离开录音界面
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
      onBack();
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      // 清理 Web Worker
      if (wavWorkerRef.current) {
        wavWorkerRef.current.terminate();
        wavWorkerRef.current = null;
      }
    };
  }, []);

  // 防止正在录音或正在上传时，用户意外关闭浏览器/刷新页面
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording || submitting) {
        e.preventDefault();
        e.returnValue = '您正在录音或提交数据，离开可能导致录音丢失，确定要离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRecording, submitting]);

  const fetchCorpus = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/package-corpus?package_id=${pkg.id}&user_id=${userId}`));
      const data = await res.json();
      if (res.ok) {
        // 检查包的状态是否允许编辑
        const canEdit = (data.package_status !== '已完成') && (data.package_review_status === '已打回' || (data.package_status === '已领取' && data.package_review_status !== '已合格'));
        if (!canEdit) {
          setError(data.package_status === '已完成' ? '该包已完成提交，无法修改' : '该包已提交审核或已通过审核，无法编辑');
          return;
        }
        setCorpus(data.data || []);
        setUnrecordedCount(data.unrecorded_count || 0);
        // 找到第一个未录制的语料
        const firstUnrecorded = data.data?.findIndex((c: Corpus) => !c.recorded) ?? 0;
        setCurrentIndex(Math.max(0, firstUnrecorded));
      } else {
        setError(data.detail || '加载语料失败');
      }
    } catch {
      setError('网络异常');
    } finally {
      setLoading(false);
    }
  };

  const releasePackage = async () => {
    if (!window.confirm('确认释放此包？释放后其他采集员可以领取此包。')) return;
    setReleasing(true);
    try {
      const res = await apiFetch(getApiUrl('/collector/release-package'), {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, package_id: pkg.id }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('释放成功');
        onBack();
      } else {
        alert(data.detail || '释放失败');
      }
    } catch {
      alert('网络异常');
    } finally {
      setReleasing(false);
    }
  };

  const startRecording = async () => {
    try {
      // 先显示倒计时
      setCountdownSeconds(1);
      setIsRecording(true);
      setRecordedBlob(null);

      // 1秒倒计时
      await new Promise(resolve => setTimeout(resolve, 1000));
      setCountdownSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
      });

      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        // 生成WAV文件（带0.3秒空白）
        generateWavFile(audioChunksRef.current);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      // 300秒后自动停止录音
      recordingTimerRef.current = setInterval(() => {
        mediaRecorder.stop();
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      }, 300000);
    } catch {
      setError('无法访问麦克风');
      setIsRecording(false);
      setCountdownSeconds(0);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const generateWavFile = async (audioChunks: Blob[]) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      // decodeAudioData 是异步的，不阻塞主线程
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);

      const targetSampleRate = 16000;
      const originalSampleRate = audioBuffer.sampleRate;
      // getChannelData 复制出 Float32Array，可以 transfer 给 Worker
      const originalData = audioBuffer.getChannelData(0);
      const transferable = new Float32Array(originalData);

      // 终止上一个未完成的 Worker（防止录两次快速提交时串台）
      if (wavWorkerRef.current) {
        wavWorkerRef.current.terminate();
      }
      const worker = new Worker('/wav-worker.js');
      wavWorkerRef.current = worker;

      worker.onmessage = (ev) => {
        wavWorkerRef.current = null;
        if (ev.data.type === 'error') {
          setError(ev.data.message);
          setIsRecording(false);
          setCountdownSeconds(0);
          setRecordedBlob(null);
        } else {
          const wavBlob = new Blob([ev.data.wavBuffer], { type: 'audio/wav' });
          setRecordedBlob(wavBlob);
          setError('');
        }
        worker.terminate();
      };

      worker.onerror = () => {
        setError('音频处理失败');
        wavWorkerRef.current = null;
        worker.terminate();
      };

      // 把 Float32Array 的 buffer transfer 给 Worker，零拷贝
      worker.postMessage(
        { audioBuffer: transferable, originalSampleRate, targetSampleRate },
        [transferable.buffer]
      );
    } catch (e) {
      console.error('音频处理失败:', e);
      setError('音频处理失败');
    }
  };





  const playRecording = () => {
    if (!recordedBlob) return;
    if (!audioElementRef.current) {
      audioElementRef.current = new Audio();
    }

    const url = URL.createObjectURL(recordedBlob);
    audioElementRef.current.src = url;
    audioElementRef.current.onplay = () => setIsPlaying(true);
    audioElementRef.current.onended = () => setIsPlaying(false);
    audioElementRef.current.play();
  };

  const retRecord = () => {
    setRecordedBlob(null);
    audioChunksRef.current = [];
  };

  const skipRecording = async () => {
    if (!window.confirm('确定跳过这条语料？将生成空录音并标记为无效。')) return;
    if (!silentBlobRef.current) {
      silentBlobRef.current = createSilentWav();
    }
    const blob = silentBlobRef.current;
    if (!blob || !(blob instanceof Blob)) {
      setError('生成静默录音失败');
      return;
    }
    await submitBlob(blob, 0);
  };

  const submitBlob = async (blob: Blob, isValid: number) => {
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.wav');
      const queryParams = new URLSearchParams({
        package_id: String(pkg.id),
        corpus_text_id: String(corpus[currentIndex].id),
        user_id: String(userId),
        is_valid: String(isValid),
      });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        setError('提交超时（300秒），请检查网络连接');
        setSubmitting(false);
      }, 300000);
      const res = await apiFetch(getApiUrl(`/collector/submit-recording?${queryParams}`), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || '提交失败');
        setSubmitting(false);
        return;
      }
      await handleSubmitSuccess(data);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`提交失败: ${errMsg}`);
      setSubmitting(false);
    }
  };

  const handleSubmitSuccess = async (data: any) => {
    setRecordedBlob(null);
    audioChunksRef.current = [];
    setCompleted(data.completed);
    if (data.is_package_completed) {
      setIsPackageCompleted(true);
      setSubmitting(false);
      setTimeout(() => onComplete(), 1500);
    } else if (data.next) {
      setSubmitting(false);
      const nextIndex = corpus.findIndex(c => c.id === data.next!.id);
      if (nextIndex >= 0) {
        setCurrentIndex(nextIndex);
      } else {
        try {
          const res = await apiFetch(getApiUrl(`/collector/package-corpus?package_id=${pkg.id}&user_id=${userId}`));
          const freshData = await res.json();
          if (res.ok && freshData.data) {
            setCorpus(freshData.data);
            const freshNextIndex = freshData.data.findIndex((c: Corpus) => c.id === data.next!.id);
            if (freshNextIndex >= 0) setCurrentIndex(freshNextIndex);
          }
        } catch { setError('刷新语料列表失败'); }
      }
    } else {
      setSubmitting(false);
      setTimeout(() => onComplete(), 500);
    }
  };

  const resetAllRecordings = async () => {
    if (!window.confirm('确定要全部重录吗？这将清除所有已录的语料。')) return;

    setResettingRecording(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/reset-recording?package_id=${pkg.id}&user_id=${userId}`), {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setRecordedBlob(null);
        await fetchCorpus();
      } else {
        setError(data.detail || '重置失败');
      }
    } catch {
      setError('网络异常');
    } finally {
      setResettingRecording(false);
    }
  };

  const submitRecording = async () => {
    if (!recordedBlob) return;

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', recordedBlob, 'recording.wav');

      const queryParams = new URLSearchParams({
        package_id: String(pkg.id),
        corpus_text_id: String(corpus[currentIndex].id),
        user_id: String(userId),
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        setError('提交超时（300秒），请检查网络连接');
        setSubmitting(false);
      }, 300000);

      const res = await apiFetch(getApiUrl(`/collector/submit-recording?${queryParams}`), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      let data: any;
      try {
        data = await res.json();
      } catch {
        setError('服务器响应格式错误');
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        if (Array.isArray(data.detail)) {
          const errorDetails = data.detail.map((err: any) => {
            const field = err.loc?.[1] || err.loc?.[0] || '未知字段';
            return `${field}: ${err.msg}`;
          }).join('; ');
          setError(`参数错误: ${errorDetails}`);
        } else {
          setError(data.detail || `提交失败 (${res.status})`);
        }
        setSubmitting(false);
        return;
      }

      if (!data || typeof data !== 'object') {
        setError(`服务器返回了无效数据`);
        setSubmitting(false);
        return;
      }

      await handleSubmitSuccess(data);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('AbortError') || errMsg.includes('timeout')) {
        setError('提交超时，请检查网络或稍后重试');
      } else if (errMsg.includes('Failed to fetch')) {
        setError('网络连接失败，请检查服务器地址');
      } else {
        setError(`提交失败: ${errMsg}`);
      }
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-blue-50 flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (corpus.length === 0 && !loading && !error) {
    return (
      <div className="w-full min-h-screen bg-blue-50 flex flex-col">
        <header className="flex items-center gap-3 px-6 py-4 bg-white">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h1 className="flex-1 font-bold text-slate-800">语料采集</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-500 mb-4">暂无语料数据</p>
            <button
              onClick={releasePackage}
              disabled={releasing}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg text-sm font-medium transition-colors mb-2"
            >
              {releasing ? '释放中...' : '释放此包'}
            </button>
            <p className="text-xs text-slate-400 mt-2">如果包没有语料数据，请释放后重新领取</p>
            <button onClick={onBack} className="text-blue-500 text-sm mt-4 block">
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 错误状态（且没有语料数据时）
  if (error && corpus.length === 0) {
    return (
      <div className="w-full min-h-screen bg-blue-50 flex flex-col">
        <header className="flex items-center gap-3 px-6 py-4 bg-white">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h1 className="flex-1 font-bold text-slate-800">语料采集</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-red-500 mb-4 font-medium">{error}</p>
            <button
              onClick={releasePackage}
              disabled={releasing}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg text-sm font-medium transition-colors mb-2"
            >
              {releasing ? '释放中...' : '释放此包'}
            </button>
            <p className="text-xs text-slate-400 mt-2">如果无法解决问题，请释放此包后重新领取</p>
            <button onClick={onBack} className="text-blue-500 text-sm mt-4 block mx-auto">
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = corpus[currentIndex];
  const progress = currentIndex + 1;
  const total = corpus.length;
  const displayCompleted = completed || 0;

  // 包完成时显示完成提示
  if (isPackageCompleted) {
    const handleAutoClaimNext = async () => {
      setSubmitting(true);
      try {
        const res = await apiFetch(getApiUrl('/collector/claim-next'), {
          method: 'POST',
          body: JSON.stringify({ user_id: userId }),
        });
        const data = await res.json();
        if (res.ok) {
          onComplete();
        } else {
          alert('领取失败: ' + (data.detail || '未知错误'));
          setSubmitting(false);
        }
      } catch (err) {
        alert('领取异常: ' + (err instanceof Error ? err.message : String(err)));
        setSubmitting(false);
      }
    };

    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
            <svg className="w-12 h-12 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-green-600 mb-2">语料包完成！</h1>
          <p className="text-slate-600 mb-8">成功录制 {displayCompleted} 条语料</p>

          <div className="flex gap-3">
            <button
              onClick={onComplete}
              className="flex-1 px-6 py-3 bg-slate-500 hover:bg-slate-600 text-white rounded-2xl font-bold transition-all active:scale-95"
            >
              回到首页
            </button>
            <button
              onClick={handleAutoClaimNext}
              disabled={submitting}
              className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-400 text-white rounded-2xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  领取中...
                </>
              ) : (
                '自动领取下一个'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-blue-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
          <ChevronLeft className="w-6 h-6 text-slate-600" />
        </button>
        <h1 className="font-bold text-slate-800">语料采集</h1>
        <div className="text-sm font-bold text-blue-600 w-12 text-right">
          {progress} / {total}
        </div>
      </header>

      {/* 打回提示横幅 */}
      {pkg.review_status === '已打回' && unrecordedCount > 0 && unrecordedCount < total && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <span className="text-sm text-orange-700 font-medium">
                {unrecordedCount} 条需要重录
              </span>
            </div>
            <button
              onClick={resetAllRecordings}
              disabled={resettingRecording}
              className="px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white text-xs rounded font-bold transition-colors"
            >
              {resettingRecording ? '处理中...' : '全部重录'}
            </button>
          </div>
        </div>
      )}

      {/* 语料展示区 */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="bg-white rounded-3xl shadow-lg p-8 max-w-md w-full">
          <p className="text-xs text-slate-400 mb-4 text-center">第 {progress} 条 · {current.text_id}</p>
          <p className="text-2xl font-bold text-slate-800 text-center leading-relaxed">
            {current.content}
          </p>
          {current.note && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs font-semibold text-orange-700 mb-1">📝 审核备注</p>
              <p className="text-sm text-orange-700">{current.note}</p>
            </div>
          )}
          <p className="text-xs text-slate-300 mt-4 text-center">
            {current.recorded ? '✓ 已录制' : pkg.review_status === '已打回' ? '⟳ 需要重录' : '未录制'}
          </p>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border-2 border-red-300 rounded-xl text-sm text-red-700 font-medium shadow-md">
          <div>❌ {error}</div>
          <div className="text-xs text-red-600 mt-1">
            {error.includes('MinIO') || error.includes('上传') ? '• 请检查MinIO服务是否运行' : ''}
            {error.includes('权限') ? '• 您无权访问该语料包' : ''}
            {error.includes('超时') ? '• 网络可能很慢，请稍候' : ''}
          </div>
        </div>
      )}

      {/* 底部控制区 */}
      <div className="px-6 pb-8">
        {!recordedBlob ? (
          // 录音状态
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={submitting || countdownSeconds > 0}
              className={`w-32 h-32 rounded-full flex items-center justify-center shadow-lg transition-all ${countdownSeconds > 0
                ? 'bg-yellow-500'
                : isRecording
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {countdownSeconds > 0 ? (
                <span className="text-3xl font-bold text-white">{countdownSeconds}</span>
              ) : (
                <Mic className="w-12 h-12 text-white" />
              )}
            </button>
            <p className="text-sm text-slate-500 text-center">
              {countdownSeconds > 0 ? '倒计时准备中...' : isRecording ? '正在录音，点击停止' : '点击开始录音'}
            </p>
            <p className="text-xs text-slate-400 text-center">最大录音时长：300秒</p>
            <button
              onClick={skipRecording}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <SkipForward className="w-4 h-4" />
              跳过（标记无效）
            </button>
          </div>
        ) : (
          // 试听确认状态
          <div className="flex gap-3 justify-center">
            <button
              onClick={retRecord}
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-slate-300 text-slate-600 rounded-2xl font-bold hover:bg-slate-400 disabled:opacity-50 transition-all"
            >
              <RotateCcw className="w-5 h-5" />
              重录
            </button>
            <button
              onClick={playRecording}
              disabled={submitting || isPlaying || !recordedBlob}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 rounded-2xl font-bold transition-all ${isPlaying
                ? 'bg-blue-400 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
                } disabled:opacity-50`}
            >
              <Play className="w-5 h-5" />
              {isPlaying ? '播放中' : '试听'}
            </button>
            <button
              onClick={submitRecording}
              disabled={submitting || !recordedBlob}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold disabled:opacity-50 transition-all active:scale-95"
            >
              <Send className="w-5 h-5" />
              {submitting ? '上传中...' : '提交'}
            </button>
          </div>
        )}

        {/* 提交进度提示 */}
        {submitting && recordedBlob && (
          <div className="mt-4 text-center text-sm text-slate-500">
            <div className="animate-pulse">正在上传到服务器（文件大小: {Math.round(recordedBlob.size / 1024)} KB）</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingWork;
