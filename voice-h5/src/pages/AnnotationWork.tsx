import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Play, Pause, Send, SkipForward, Package, AlertTriangle } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';

interface CorpusRecording {
  id: number;
  text_id: string;
  content: string;
  recording_id: number | null;
  recording_file: string | null;
  recorded_at: string | null;
  annotated_text: string | null;
  is_valid: number | null;
  annotation_note: string | null;
  quality_note: string | null;
  quality_review_action: string | null;
  quality_review_note: string | null;
}

interface Props {
  package: {
    id: number;
    name: string;
    size: number;
    corpus_group_name: string;
    annotation_status?: string;
    quality_status?: string;
  };
  userId: number;
  onBack: () => void;
  onComplete: () => void;
}

const AnnotationWork: React.FC<Props> = ({ package: pkg, userId, onBack, onComplete }) => {
  const [corpus, setCorpus] = useState<CorpusRecording[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingPackage, setSubmittingPackage] = useState(false);

  const [collectorInfo, setCollectorInfo] = useState({
    real_name: '',
    gender: '',
    age: 0,
    hometown: '',
  });
  const [packageRejectReason, setPackageRejectReason] = useState<string | null>(null);

  const [annotatedText, setAnnotatedText] = useState('');
  const [isValid, setIsValid] = useState(1);
  const [annotationNote, setAnnotationNote] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const isReadOnly = pkg.annotation_status === '已标注' && pkg.quality_status !== '已打回';

  const fetchCorpus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/annotator/package-corpus?package_id=${pkg.id}&user_id=${userId}`));
      const data = await res.json();
      if (res.ok) {
        const corpusData = data.data || [];
        setCorpus(corpusData);
        setCollectorInfo({
          real_name: data.collector_real_name || '',
          gender: data.collector_gender || '',
          age: data.collector_age || 0,
          hometown: data.collector_hometown || '',
        });
        setPackageRejectReason(data.package_reject_reason || null);
        // 找到第一个未标注的语料
        const firstUnAnnotated = corpusData.findIndex((c: CorpusRecording) => c.annotated_text === null);
        const targetIndex = Math.max(0, firstUnAnnotated);
        setCurrentIndex(targetIndex);
        loadCorpusData(corpusData[targetIndex]);
      } else {
        setError(data.detail || '加载语料失败');
      }
    } catch {
      setError('网络异常');
    } finally {
      setLoading(false);
    }
  }, [pkg.id, userId]);

  useEffect(() => {
    fetchCorpus();
  }, [fetchCorpus]);

  const loadCorpusData = (item: CorpusRecording) => {
    if (item) {
      setAnnotatedText(item.annotated_text || item.content);
      setIsValid(item.is_valid ?? (item.recording_file ? 1 : 0));
      setAnnotationNote(item.annotation_note || '');
      setError('');
    }
  };

  const selectItem = (index: number) => {
    if (index >= 0 && index < corpus.length) {
      setCurrentIndex(index);
      loadCorpusData(corpus[index]);
      // 滚动到选中项
      const itemEl = document.getElementById(`corpus-item-${index}`);
      itemEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const playAudio = () => {
    if (!corpus[currentIndex]?.recording_file) return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    apiFetch(getApiUrl(`/annotator/download-recording/${corpus[currentIndex].recording_id}?user_id=${userId}`))
      .then(res => res.json())
      .then(data => {
        if (data.code === 200 && data.data?.url) {
          audioRef.current!.src = data.data.url;
          audioRef.current!.onplay = () => setIsPlaying(true);
          audioRef.current!.onended = () => {
            setIsPlaying(false);
            setAudioProgress(0);
          };
          audioRef.current!.onloadedmetadata = () => {
            setAudioDuration(audioRef.current!.duration);
          };
          audioRef.current!.ontimeupdate = () => {
            setAudioProgress(audioRef.current!.currentTime);
          };
          audioRef.current!.play().catch(() => setError('无法播放音频'));
        } else {
          setError('获取音频失败');
        }
      })
      .catch(() => setError('无法播放音频'));
  };

  const pauseAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const saveCurrentItem = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      const queryParams = new URLSearchParams({
        package_id: String(pkg.id),
        corpus_text_id: String(corpus[currentIndex].id),
        user_id: String(userId),
        annotated_text: annotatedText,
        is_valid: String(isValid),
        annotation_note: annotationNote,
      });

      const res = await apiFetch(getApiUrl(`/annotator/submit-annotation?${queryParams}`), {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || '保存失败');
        setSubmitting(false);
        return;
      }

      // 更新本地数据
      const newCorpus = [...corpus];
      newCorpus[currentIndex] = {
        ...newCorpus[currentIndex],
        annotated_text: annotatedText,
        is_valid: isValid,
        annotation_note: annotationNote,
      };
      setCorpus(newCorpus);

      // 自动跳转到下一条未标注
      const nextUnAnnotated = newCorpus.findIndex((c, i) => i > currentIndex && c.annotated_text === null);
      if (nextUnAnnotated >= 0) {
        selectItem(nextUnAnnotated);
      }

      setSubmitting(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`保存失败: ${errMsg}`);
      setSubmitting(false);
    }
  };

  const skipItem = async () => {
    if (!window.confirm('确定跳过这条语料？将标记为无效。')) return;
    setSubmitting(true);
    setError('');

    try {
      const queryParams = new URLSearchParams({
        package_id: String(pkg.id),
        corpus_text_id: String(corpus[currentIndex].id),
        user_id: String(userId),
        annotated_text: corpus[currentIndex].content,
        is_valid: '0',
        annotation_note: '跳过（无录音）',
      });

      const res = await apiFetch(getApiUrl(`/annotator/submit-annotation?${queryParams}`), {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || '跳过失败');
        setSubmitting(false);
        return;
      }

      // 更新本地数据
      const newCorpus = [...corpus];
      newCorpus[currentIndex] = {
        ...newCorpus[currentIndex],
        annotated_text: corpus[currentIndex].content,
        is_valid: 0,
        annotation_note: '跳过（无录音）',
      };
      setCorpus(newCorpus);

      // 自动跳转到下一条
      const nextUnAnnotated = newCorpus.findIndex((c, i) => i > currentIndex && c.annotated_text === null);
      if (nextUnAnnotated >= 0) {
        selectItem(nextUnAnnotated);
      }

      setSubmitting(false);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`跳过失败: ${errMsg}`);
      setSubmitting(false);
    }
  };

  const submitPackage = async () => {
    if (submittingPackage) return;

    // 检查是否所有语料都已标注
    const unannotated = corpus.filter(c => c.annotated_text === null);
    if (unannotated.length > 0) {
      setError(`还有 ${unannotated.length} 条语料未标注，请先完成所有标注`);
      return;
    }

    if (!window.confirm('确定整包提交？提交后将进入任务大厅等待质检。')) return;

    setSubmittingPackage(true);
    setError('');

    try {
      const res = await apiFetch(getApiUrl(`/annotator/submit-package?package_id=${pkg.id}&user_id=${userId}`), {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || '整包提交失败');
        setSubmittingPackage(false);
        return;
      }

      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`整包提交失败: ${errMsg}`);
      setSubmittingPackage(false);
    }
  };

  // 统计
  const annotatedCount = corpus.filter(c => c.annotated_text !== null).length;
  const rejectedCount = corpus.filter(c => c.quality_review_action === '打回').length;

  // 获取条目状态
  const getItemStatus = (item: CorpusRecording) => {
    if (item.quality_note !== null && item.quality_note !== '') return 'rejected';
    if (item.quality_review_action === '打回') return 'rejected';
    if (item.annotated_text !== null) return 'annotated';
    return 'pending';
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (corpus.length === 0) {
    return (
      <div className="w-full h-screen bg-slate-50 flex flex-col">
        <header className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <h1 className="flex-1 font-bold text-slate-800">标注工作</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-500 mb-2">暂无语料</p>
            <button onClick={onBack} className="text-blue-500 text-sm">返回</button>
          </div>
        </div>
      </div>
    );
  }

  const current = corpus[currentIndex];

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="font-bold text-slate-800 text-sm">{pkg.name}</h1>
          <p className="text-xs text-slate-400">已标注 {annotatedCount}/{corpus.length}{rejectedCount > 0 && ` · ${rejectedCount} 条被打回`}</p>
        </div>
        <button
          onClick={submitPackage}
          disabled={submittingPackage || isReadOnly || annotatedCount < corpus.length}
          className="flex items-center gap-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Package className="w-4 h-4" />
          {submittingPackage ? '提交中...' : '整包提交'}
        </button>
      </header>

      {/* Package Reject Reason Banner */}
      {packageRejectReason && (
        <div className="mx-4 mt-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
          <p className="font-semibold">质检员打回原因：</p>
          <p>{packageRejectReason}</p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Corpus List */}
        <div ref={sidebarRef} className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
          <div className="p-2">
            {corpus.map((item, index) => {
              const status = getItemStatus(item);
              return (
                <div
                  key={item.id}
                  id={`corpus-item-${index}`}
                  onClick={() => selectItem(index)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 transition-all ${
                    index === currentIndex
                      ? 'bg-green-50 border border-green-300'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    status === 'rejected'
                      ? 'bg-red-100 text-red-600'
                      : status === 'annotated'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {status === 'rejected' ? '!' : status === 'annotated' ? '✓' : index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{item.text_id}</p>
                    <p className="text-sm text-slate-700 truncate">{item.content}</p>
                    {status === 'rejected' && item.quality_note && (
                      <p className="text-xs text-orange-500 truncate mt-0.5">质检打回: {item.quality_note}</p>
                    )}
                    {status === 'rejected' && item.quality_review_note && (
                      <p className="text-xs text-red-500 truncate mt-0.5">审核打回: {item.quality_review_note}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content - Work Area */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
          {/* Collector Info */}
          <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
            <span>采集员: {collectorInfo.real_name}</span>
            <span>性别: {collectorInfo.gender}</span>
            <span>年龄: {collectorInfo.age}</span>
            <span>籍贯: {collectorInfo.hometown}</span>
          </div>

          {/* Top Section - Text and Audio */}
          <div className="flex gap-4 mb-4">
            {/* Text Section */}
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">原始文本</p>
              <div className="bg-white rounded-lg border border-slate-200 p-3 h-24 overflow-y-auto">
                <p className="text-sm font-semibold text-slate-800">{current.content}</p>
              </div>
            </div>

            {/* Audio Player Section */}
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">录音 ({current.text_id})</p>
              <div className="bg-white rounded-lg border border-slate-200 p-3 h-24 flex items-center justify-center">
                {current.recording_file ? (
                  <div className="flex items-center gap-3 w-full">
                    <button
                      onClick={isPlaying ? pauseAudio : playAudio}
                      disabled={submitting}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isPlaying ? 'bg-red-500' : 'bg-green-500'
                      } disabled:opacity-50`}
                    >
                      {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                    </button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0}
                        max={audioDuration || 0}
                        step={0.1}
                        value={audioProgress}
                        onChange={(e) => {
                          const time = parseFloat(e.target.value);
                          if (audioRef.current) {
                            audioRef.current.currentTime = time;
                            setAudioProgress(time);
                          }
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                      />
                      <p className="text-xs text-slate-500 text-center mt-1">
                        {Math.floor(audioProgress)}s / {Math.floor(audioDuration)}s
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-orange-500">暂无录音</p>
                )}
              </div>
            </div>
          </div>

          {/* Rejected Warning */}
          {current.quality_note && current.quality_note !== '' && (
            <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-600">
              ⚠️ 此条被质检员打回：{current.quality_note}
            </div>
          )}
          {current.quality_review_action === '打回' && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              ⚠️ 此条被质检审核员打回：{current.quality_review_note || '无备注'}
            </div>
          )}

          {/* Annotation Area */}
          <div className="flex-1 flex flex-col">
            <p className="text-xs text-slate-400 mb-1">标注文本</p>
            <textarea
              value={annotatedText}
              onChange={(e) => setAnnotatedText(e.target.value)}
              disabled={submitting || isReadOnly}
              className="flex-1 bg-white rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
              placeholder="输入标注后的文本..."
            />

            {/* Options */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">有效性</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setIsValid(1)}
                    disabled={submitting || isReadOnly}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      isValid === 1 ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    有效
                  </button>
                  <button
                    onClick={() => setIsValid(0)}
                    disabled={submitting || isReadOnly}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      isValid === 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    无效
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-400 mb-1">备注</p>
                <input
                  type="text"
                  value={annotationNote}
                  onChange={(e) => setAnnotationNote(e.target.value)}
                  disabled={submitting || isReadOnly}
                  className="w-full py-1.5 px-2 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  placeholder="可选备注..."
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3 flex gap-2">
              {!current.recording_file && !isReadOnly && (
                <button
                  onClick={skipItem}
                  disabled={submitting}
                  className="flex items-center gap-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  <SkipForward className="w-4 h-4" />
                  跳过
                </button>
              )}
              <button
                onClick={saveCurrentItem}
                disabled={submitting || isReadOnly}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationWork;
