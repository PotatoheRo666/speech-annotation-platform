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
  inspected_by: number | null;
  quality_review_action: string | null;
  quality_review_note: string | null;
}

interface Props {
  package: { id: number; name: string; size: number; corpus_group_name: string };
  userId: number;
  onBack: () => void;
  onComplete: () => void;
}

const InspectionWork: React.FC<Props> = ({ package: pkg, userId, onBack, onComplete }) => {
  const [corpus, setCorpus] = useState<CorpusRecording[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittingPackage, setSubmittingPackage] = useState(false);
  const [rejectingPackage, setRejectingPackage] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [collectorInfo, setCollectorInfo] = useState({
    real_name: '',
    gender: '',
    age: 0,
    hometown: '',
  });

  const [annotatedText, setAnnotatedText] = useState('');
  const [isValid, setIsValid] = useState(1);
  const [qualityNote, setQualityNote] = useState('');
  const [qualityAction, setQualityAction] = useState<'通过' | '打回'>('通过');

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchCorpus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/inspector/package-corpus?package_id=${pkg.id}&user_id=${userId}`));
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
        // 找到第一个未质检的语料
        const firstUnInspected = corpusData.findIndex((c: CorpusRecording) => !c.inspected_by);
        const targetIndex = Math.max(0, firstUnInspected);
        setCurrentIndex(targetIndex);
        loadCorpusData(corpusData[targetIndex]);
      } else {
        setError(data.detail || '加载语料失败');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`整包提交失败: ${errMsg}`);
      setSubmittingPackage(false);
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
      setQualityNote('');
      setQualityAction('通过');
      setError('');
    }
  };

  const selectItem = (index: number) => {
    if (index >= 0 && index < corpus.length) {
      setCurrentIndex(index);
      loadCorpusData(corpus[index]);
      const itemEl = document.getElementById(`corpus-item-${index}`);
      itemEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const playAudio = () => {
    if (!corpus[currentIndex]?.recording_file) return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    apiFetch(getApiUrl(`/inspector/download-recording/${corpus[currentIndex].recording_id}?user_id=${userId}`))
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
        quality_note: qualityNote,
        quality_action: qualityAction,
      });

      const res = await apiFetch(getApiUrl(`/inspector/submit-inspection?${queryParams}`), {
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
        quality_note: qualityAction === '打回' ? qualityNote : null,
        inspected_by: userId,
      };
      setCorpus(newCorpus);

      // 自动跳转到下一条未质检
      const nextUnInspected = newCorpus.findIndex((c, i) => i > currentIndex && !c.inspected_by);
      if (nextUnInspected >= 0) {
        selectItem(nextUnInspected);
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
        quality_note: '跳过（无录音）',
        quality_action: '通过',
      });

      const res = await apiFetch(getApiUrl(`/inspector/submit-inspection?${queryParams}`), {
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
        is_valid: 0,
        quality_note: null,
        inspected_by: userId,
      };
      setCorpus(newCorpus);

      // 自动跳转到下一条
      const nextUnInspected = newCorpus.findIndex((c, i) => i > currentIndex && !c.inspected_by);
      if (nextUnInspected >= 0) {
        selectItem(nextUnInspected);
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

    // 找出未确认的条目
    const uninspected = corpus.filter(c => !c.inspected_by);
    
    // 如果有未确认的条目，提示用户
    if (uninspected.length > 0) {
      if (!window.confirm(`有 ${uninspected.length} 条语料未确认，将自动标记为通过。确定继续？`)) {
        return;
      }
    } else {
      // 全部已确认，正常确认
      const rejectedCount = corpus.filter(c => c.quality_note).length;
      const msg = rejectedCount > 0
        ? `有 ${rejectedCount} 条被打回，确定整包提交？提交后将回到标注员。`
        : '确定整包提交？提交后将进入质检审核。';
      if (!window.confirm(msg)) return;
    }

    setSubmittingPackage(true);
    setError('');

    try {
      // 自动保存未确认的条目
      if (uninspected.length > 0) {
        for (const item of uninspected) {
          const queryParams = new URLSearchParams({
            package_id: String(pkg.id),
            corpus_text_id: String(item.id),
            user_id: String(userId),
            annotated_text: item.annotated_text || item.content,
            is_valid: String(item.is_valid ?? 1),
            quality_note: '',
            quality_action: '通过',
          });

          const res = await apiFetch(getApiUrl(`/inspector/submit-inspection?${queryParams}`), {
            method: 'POST',
          });

          if (!res.ok) {
            const data = await res.json();
            setError(data.detail || `自动保存失败`);
            setSubmittingPackage(false);
            return;
          }
        }

        // 更新本地数据
        const newCorpus = corpus.map(item => {
          if (!item.inspected_by) {
            return {
              ...item,
              inspected_by: userId,
              quality_note: null,
            };
          }
          return item;
        });
        setCorpus(newCorpus);
      }

      // 整包提交
      const res = await apiFetch(getApiUrl(`/inspector/submit-package?package_id=${pkg.id}&user_id=${userId}`), {
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

  const handleRejectPackage = async () => {
    if (!rejectReason.trim()) {
      setError('请输入打回原因');
      return;
    }

    setRejectingPackage(true);
    setError('');

    try {
      const res = await apiFetch(getApiUrl('/inspector/reject-package'), {
        method: 'POST',
        body: JSON.stringify({
          package_id: pkg.id,
          user_id: userId,
          reason: rejectReason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || '整包打回失败');
        setRejectingPackage(false);
        return;
      }

      setShowRejectDialog(false);
      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(`整包打回失败: ${errMsg}`);
      setRejectingPackage(false);
    }
  };

  // 统计
  const inspectedCount = corpus.filter(c => c.inspected_by).length;
  const rejectedCount = corpus.filter(c => c.quality_note).length;
  const qualityRejectedCount = corpus.filter(c => c.quality_review_action === '打回').length;

  // 获取条目状态
  const getItemStatus = (item: CorpusRecording) => {
    if (item.quality_review_action === '打回') return 'quality_rejected';
    if (item.quality_note) return 'rejected';
    if (item.inspected_by) return 'inspected';
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
          <h1 className="flex-1 font-bold text-slate-800">质检工作</h1>
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
          <p className="text-xs text-slate-400">
            已质检 {inspectedCount}/{corpus.length}
            {rejectedCount > 0 && ` · ${rejectedCount} 条打回`}
            {qualityRejectedCount > 0 && ` · ${qualityRejectedCount} 条被审核打回`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRejectDialog(true)}
            disabled={rejectingPackage}
            className="flex items-center gap-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-all"
          >
            {rejectingPackage ? '处理中...' : '整包打回'}
          </button>
          <button
            onClick={submitPackage}
            disabled={submittingPackage}
            className="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Package className="w-4 h-4" />
            {submittingPackage ? '提交中...' : '整包提交'}
          </button>
        </div>
      </header>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-slate-800 mb-4">整包打回</h3>
            <p className="text-sm text-slate-600 mb-4">
              确定要打回整个语料包吗？打回后将回到标注员重新标注。
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="请输入打回原因（必填）"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRejectPackage}
                disabled={rejectingPackage || !rejectReason.trim()}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors"
              >
                {rejectingPackage ? '处理中...' : '确认打回'}
              </button>
            </div>
          </div>
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
        <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex-shrink-0">
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
                      ? 'bg-blue-50 border border-blue-300'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    status === 'quality_rejected'
                      ? 'bg-purple-100 text-purple-600'
                      : status === 'rejected'
                        ? 'bg-red-100 text-red-600'
                        : status === 'inspected'
                          ? 'bg-green-100 text-green-600'
                          : 'bg-slate-100 text-slate-400'
                  }`}>
                    {status === 'quality_rejected' ? '!' : status === 'rejected' ? '✗' : status === 'inspected' ? '✓' : index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{item.text_id}</p>
                    <p className="text-sm text-slate-700 truncate">{item.content}</p>
                    {status === 'quality_rejected' && item.quality_review_note && (
                      <p className="text-xs text-purple-500 truncate mt-0.5">审核打回: {item.quality_review_note}</p>
                    )}
                    {status === 'rejected' && item.quality_note && (
                      <p className="text-xs text-red-500 truncate mt-0.5">打回: {item.quality_note}</p>
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
                        isPlaying ? 'bg-red-500' : 'bg-blue-500'
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
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
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

          {/* Quality Review Rejected Warning */}
          {current.quality_review_action === '打回' && (
            <div className="mb-3 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-600">
              ⚠️ 此条被质检审核员打回：{current.quality_review_note || '无备注'}
            </div>
          )}

          {/* Annotation Area */}
          <div className="flex-1 flex flex-col">
            <p className="text-xs text-slate-400 mb-1">标注文本（可编辑）</p>
            <textarea
              value={annotatedText}
              onChange={(e) => setAnnotatedText(e.target.value)}
              disabled={submitting}
              className="flex-1 bg-white rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              placeholder="标注文本..."
            />

            {/* Options */}
            <div className="mt-3 grid grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-slate-400 mb-1">有效性</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setIsValid(1)}
                    disabled={submitting}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      isValid === 1 ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    有效
                  </button>
                  <button
                    onClick={() => setIsValid(0)}
                    disabled={submitting}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      isValid === 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    无效
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1">质检结果</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setQualityAction('通过')}
                    disabled={submitting}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      qualityAction === '通过' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    通过
                  </button>
                  <button
                    onClick={() => setQualityAction('打回')}
                    disabled={submitting}
                    className={`flex-1 py-1.5 rounded text-xs font-bold ${
                      qualityAction === '打回' ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'
                    } disabled:opacity-50`}
                  >
                    打回
                  </button>
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-400 mb-1">质检备注</p>
                <input
                  type="text"
                  value={qualityNote}
                  onChange={(e) => setQualityNote(e.target.value)}
                  disabled={submitting}
                  className="w-full py-1.5 px-2 rounded border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  placeholder="质检意见..."
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3 flex gap-2">
              {!current.recording_file && (
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
                disabled={submitting}
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

export default InspectionWork;
