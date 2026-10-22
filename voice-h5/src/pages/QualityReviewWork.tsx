import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Play, Pause, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';

interface CorpusItem {
  id: number;
  text_id: string;
  content: string;
  recording_id: number | null;
  recording_file: string | null;
  recorded_at: string | null;
  annotated_text?: string | null;
  is_valid?: number | null;
  annotation_note?: string | null;
  quality_note?: string | null;
  quality_review_action?: string | null;
  quality_review_note?: string | null;
  was_rejected?: boolean;
  rejection_note?: string | null;
}

interface PackageData {
  package_id: number;
  name: string;
  quality_status: string;
  quality_review_status: string;
  quality_review_comment: string | null;
  corpus_list: CorpusItem[];
}

interface Props {
  corpusGroupId: number;
  corpusGroupName: string;
  userId: number;
  onBack: () => void;
}

const QualityReviewWork: React.FC<Props> = ({ corpusGroupId, corpusGroupName, userId, onBack }) => {
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PackageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<string>('待审核');

  const [playingRecordingId, setPlayingRecordingId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchApproving, setBatchApproving] = useState(false);
  const [batchRejecting, setBatchRejecting] = useState(false);
  const [error, setError] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [corpusNotes, setCorpusNotes] = useState<Record<number, string>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filterPackages = (pkgs: any[]) => {
    let filtered = pkgs;
    if (dateFrom) {
      filtered = filtered.filter(pkg => pkg.completed_at >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(pkg => pkg.completed_at <= dateTo + ' 23:59');
    }
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.name.toLowerCase().includes(search) ||
        (pkg.inspector_name || '').toLowerCase().includes(search)
      );
    }
    return filtered;
  };

  useEffect(() => {
    fetchPackages();
  }, [reviewFilter]);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      let url = getApiUrl(`/quality-reviewer/package-submissions?user_id=${userId}&corpus_group_id=${corpusGroupId}`);
      if (reviewFilter) {
        url += `&review_status=${reviewFilter}`;
      }

      const res = await apiFetch(url);
      const data = await res.json();
      setPackages(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [reviewFilter, corpusGroupId, userId]);

  const fetchPackageDetail = async (packageId: number) => {
    try {
      const res = await apiFetch(getApiUrl(`/quality-reviewer/package-detail/${packageId}?user_id=${userId}`));
      if (!res.ok) {
        let errorMsg = '未知错误';
        try {
          const data = await res.json();
          errorMsg = data.detail || errorMsg;
        } catch {
          errorMsg = res.statusText || `HTTP ${res.status}`;
        }
        alert(`加载包详情失败: ${errorMsg}`);
        return;
      }
      const data = await res.json();
      setSelectedPackage(data.data);
      setReviewComment(data.data.quality_review_comment || '');
      setCurrentIndex(0);
      setCorpusNotes({});
      setError('');
    } catch (error) {
      console.error('Fetch error:', error);
      alert('加载包详情失败: 网络错误');
    }
  };

  const playAudio = (recordingId: number) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    if (playingRecordingId === recordingId && isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    apiFetch(getApiUrl(`/quality-reviewer/download-recording/${recordingId}?user_id=${userId}`))
      .then(res => res.json())
      .then(data => {
        if (data.code === 200 && data.data?.url) {
          audio.src = data.data.url;
          audio.onplay = () => {
            setIsPlaying(true);
            setPlayingRecordingId(recordingId);
          };
          audio.onended = () => {
            setIsPlaying(false);
            setPlayingRecordingId(null);
            setAudioProgress(0);
          };
          audio.onloadedmetadata = () => {
            setAudioDuration(audio.duration);
          };
          audio.ontimeupdate = () => {
            setAudioProgress(audio.currentTime);
          };
          audio.play().catch(() => setError('无法播放音频'));
        } else {
          setError('获取音频失败');
        }
      })
      .catch(() => setError('无法播放音频'));
  };

  const markItem = async (recordingId: number, action: string, note: string) => {
    try {
      const res = await apiFetch(getApiUrl(`/quality-reviewer/mark-item?recording_id=${recordingId}&user_id=${userId}&action=${action}&note=${encodeURIComponent(note)}`), {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || '标记失败');
        return;
      }

      // 更新本地数据
      if (selectedPackage) {
        const newCorpusList = selectedPackage.corpus_list.map(c => {
          if (c.recording_id === recordingId) {
            return { ...c, quality_review_action: action, quality_review_note: note };
          }
          return c;
        });
        setSelectedPackage({ ...selectedPackage, corpus_list: newCorpusList });
      }
    } catch (err) {
      setError('标记失败');
    }
  };

  const submitReview = async (status: string) => {
    if (!selectedPackage) return;

    const rejectedCount = selectedPackage.corpus_list.filter(c => c.quality_review_action === '打回').length;
    const msg = status === '已打回'
      ? `确认打回？${rejectedCount > 0 ? `有 ${rejectedCount} 条标记为问题` : '整包打回'}`
      : '确认该包合格？';

    if (!window.confirm(msg)) return;

    setSubmittingReview(true);
    setError('');

    try {
      const body: any = {
        package_id: selectedPackage.package_id,
        reviewer_id: userId,
        review_status: status,
        review_comment: reviewComment || "",
      };

      const res = await apiFetch(getApiUrl(`/quality-reviewer/review-package`), {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.msg);
        setSelectedPackage(null);
        fetchPackages();
      } else {
        setError(data.detail || '审核失败');
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const batchApproveGroup = async () => {
    const pendingCount = packages.filter(p => p.quality_review_status === '待审核').length;
    if (pendingCount === 0) { alert('没有待审核的包'); return; }
    if (!window.confirm(`确认将当前语料组中 ${pendingCount} 个待审核包全部标记为合格？`)) return;

    setBatchApproving(true);
    try {
      const res = await apiFetch(getApiUrl('/quality-reviewer/batch-approve-group'), {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          corpus_group_id: corpusGroupId,
          review_comment: '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.msg);
        fetchPackages();
      } else {
        setError(data.detail || '操作失败');
      }
    } catch {
      setError('网络异常');
    } finally {
      setBatchApproving(false);
    }
  };

  const batchRejectGroup = async () => {
    const pendingCount = packages.filter(p => p.quality_review_status === '待审核').length;
    if (pendingCount === 0) { alert('没有待审核的包'); return; }
    if (!window.confirm(`确认将当前语料组中 ${pendingCount} 个待审核包全部打回？\n\n每个包将退回各自的原质检员。`)) return;

    setBatchRejecting(true);
    try {
      const res = await apiFetch(getApiUrl('/quality-reviewer/batch-reject-group'), {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          corpus_group_id: corpusGroupId,
          review_comment: '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.msg);
        fetchPackages();
      } else {
        setError(data.detail || '操作失败');
      }
    } catch {
      setError('网络异常');
    } finally {
      setBatchRejecting(false);
    }
  };

  // Package list view
  if (!selectedPackage) {
    return (
      <div className="w-full min-h-screen bg-teal-50 flex justify-center p-4">
        <div className="w-full max-w-md">
          <header className="flex items-center justify-between py-4 mb-4">
            <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors text-slate-600">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-slate-800">质检审核</h1>
            <div className="w-10" />
          </header>

          {/* 筛选 */}
          <div className="flex gap-2 mb-4">
            {['待审核', '已合格', '已打回'].map(status => (
              <button
                key={status}
                onClick={() => setReviewFilter(status)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${reviewFilter === status
                    ? 'bg-teal-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* 整组合格按钮 */}
          {reviewFilter === '待审核' && packages.length > 0 && (
            <div className="flex gap-2 mt-3">
              <button
                onClick={batchApproveGroup}
                disabled={batchApproving}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <Check className="w-5 h-5" />
                {batchApproving ? '处理中...' : `整组合格（${packages.filter(p => p.quality_review_status === '待审核').length}）`}
              </button>
              <button
                onClick={batchRejectGroup}
                disabled={batchRejecting}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <X className="w-5 h-5" />
                {batchRejecting ? '处理中...' : `整组打回（${packages.filter(p => p.quality_review_status === '待审核').length}）`}
              </button>
            </div>
          )}

          {/* 日期筛选和搜索 */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs text-slate-500 mb-1">搜索</label>
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="输入质检员或包名..."
                  className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>
              {(dateFrom || dateTo || searchText) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setSearchText(''); }}
                  className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 underline"
                >
                  清除
                </button>
              )}
            </div>
          </div>

          {/* 包列表 */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin w-6 h-6 text-teal-400" />
              </div>
            ) : (() => {
              const filtered = filterPackages(packages);
              return filtered.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-6">
                  {packages.length === 0 ? '暂无待审核的包' : '无符合条件的包'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {filtered.map(pkg => (
                    <li key={pkg.id}>
                      <button
                        onClick={() => fetchPackageDetail(pkg.id)}
                        className="w-full text-left p-4 bg-slate-50 hover:bg-teal-50 rounded-xl border border-slate-100 hover:border-teal-300 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-bold text-slate-800">{pkg.name}</p>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${pkg.quality_review_status === '已合格' ? 'bg-green-100 text-green-600' :
                              pkg.quality_review_status === '已打回' ? 'bg-red-100 text-red-600' :
                                'bg-amber-100 text-amber-600'
                            }`}>
                            {pkg.quality_review_status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          语料组: {pkg.corpus_group_name}
                          {pkg.inspector_name && ` • 质检员: ${pkg.inspector_name}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          进度: {pkg.recorded_count} / {pkg.total_count}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      </div>
    );
  }

  // Package detail view with sidebar
  const current = selectedPackage.corpus_list[currentIndex];
  const rejectedCount = selectedPackage.corpus_list.filter(c => c.quality_review_action === '打回').length;
  const markedCount = selectedPackage.corpus_list.filter(c => c.quality_review_action).length;
  const invalidCount = selectedPackage.corpus_list.filter(c => c.is_valid === 0).length;

  const getItemStatus = (item: CorpusItem) => {
    if (item.quality_review_action === '打回') return 'rejected';
    if (item.quality_review_action === '通过') return 'passed';
    if (item.is_valid === 0) return 'invalid';
    return 'pending';
  };

  return (
    <div className="w-full h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <button onClick={() => setSelectedPackage(null)} className="p-2 hover:bg-slate-100 rounded-full">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="font-bold text-slate-800 text-sm">{selectedPackage.name}</h1>
          <p className="text-xs text-slate-400">
            {corpusGroupName} | 已标记 {markedCount}/{selectedPackage.corpus_list.length}
            {rejectedCount > 0 && ` · ${rejectedCount} 条打回`}
            {invalidCount > 0 && ` · ${invalidCount} 条无效`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => submitReview('已打回')}
            disabled={submittingReview}
            className="flex items-center gap-1 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            {submittingReview ? '处理中...' : '打回'}
          </button>
          <button
            onClick={() => submitReview('已合格')}
            disabled={submittingReview}
            className="flex items-center gap-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {submittingReview ? '处理中...' : '合格'}
          </button>
        </div>
      </header>

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
            {selectedPackage.corpus_list.map((item, index) => {
              const status = getItemStatus(item);
              return (
                <div
                  key={item.id}
                  id={`corpus-item-${index}`}
                  onClick={() => {
                    setCurrentIndex(index);
                    const el = document.getElementById(`corpus-item-${index}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-1 transition-all ${
                    index === currentIndex
                      ? 'bg-teal-50 border border-teal-300'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  {/* Status Icon */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    status === 'rejected'
                      ? 'bg-red-100 text-red-600'
                      : status === 'passed'
                        ? 'bg-green-100 text-green-600'
                        : status === 'invalid'
                          ? 'bg-orange-100 text-orange-600'
                          : 'bg-slate-100 text-slate-400'
                  }`}>
                    {status === 'rejected' ? '✗' : status === 'passed' ? '✓' : status === 'invalid' ? '⊘' : index + 1}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{item.text_id}</p>
                    <p className="text-sm text-slate-700 truncate">{item.content}</p>
                    {status === 'rejected' && item.quality_review_note && (
                      <p className="text-xs text-red-500 truncate mt-0.5">打回: {item.quality_review_note}</p>
                    )}
                    {status === 'invalid' && (
                      <p className="text-xs text-orange-500 truncate mt-0.5">无效数据</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content - Detail Area */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
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
                      onClick={() => playAudio(current.recording_id!)}
                      disabled={submittingReview}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        playingRecordingId === current.recording_id && isPlaying ? 'bg-red-500' : 'bg-teal-500'
                      } disabled:opacity-50`}
                    >
                      {playingRecordingId === current.recording_id && isPlaying
                        ? <Pause className="w-5 h-5 text-white" />
                        : <Play className="w-5 h-5 text-white fill-white" />
                      }
                    </button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0}
                        max={audioDuration || 0}
                        step={0.1}
                        value={playingRecordingId === current.recording_id ? audioProgress : 0}
                        onChange={(e) => {
                          const time = parseFloat(e.target.value);
                          if (audioRef.current && playingRecordingId === current.recording_id) {
                            audioRef.current.currentTime = time;
                            setAudioProgress(time);
                          }
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                      />
                      <p className="text-xs text-slate-500 text-center mt-1">
                        {playingRecordingId === current.recording_id ? Math.floor(audioProgress) : 0}s / {Math.floor(audioDuration)}s
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-orange-500">暂无录音</p>
                )}
              </div>
            </div>
          </div>

          {/* Annotation Info */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">标注文本</p>
              <div className="bg-white rounded-lg border border-slate-200 p-2 h-20 overflow-y-auto">
                <p className="text-sm text-slate-700">{current.annotated_text || '无'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">质检意见</p>
              <div className="bg-white rounded-lg border border-slate-200 p-2 h-20 overflow-y-auto">
                <p className="text-sm text-slate-700">{current.quality_note || '无'}</p>
              </div>
            </div>
          </div>

          {/* Invalid Data Indicator */}
          {current.is_valid === 0 && (
            <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-sm text-orange-600 font-medium">⚠️ 此条数据标记为无效</p>
              {current.annotation_note && (
                <p className="text-xs text-orange-500 mt-1">备注: {current.annotation_note}</p>
              )}
            </div>
          )}

          {/* Mark Area */}
          <div className="flex-1 flex flex-col">
            <p className="text-xs text-slate-400 mb-1">审核标记</p>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  const recordingId = current.recording_id;
                  if (recordingId) {
                    markItem(recordingId, '通过', '');
                  }
                }}
                disabled={!current.recording_id || submittingReview}
                className={`flex-1 py-2 rounded-lg text-sm font-bold ${
                  current.quality_review_action === '通过'
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                } disabled:opacity-50`}
              >
                通过
              </button>
              <button
                onClick={() => {
                  const recordingId = current.recording_id;
                  if (recordingId) {
                    const note = corpusNotes[current.id] || '';
                    markItem(recordingId, '打回', note);
                  }
                }}
                disabled={!current.recording_id || submittingReview}
                className={`flex-1 py-2 rounded-lg text-sm font-bold ${
                  current.quality_review_action === '打回'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                } disabled:opacity-50`}
              >
                打回
              </button>
            </div>

            {/* Note input for rejection */}
            {current.quality_review_action === '打回' && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-1">打回备注</p>
                <input
                  type="text"
                  value={corpusNotes[current.id] || current.quality_review_note || ''}
                  onChange={(e) => {
                    setCorpusNotes({ ...corpusNotes, [current.id]: e.target.value });
                  }}
                  onBlur={() => {
                    if (current.recording_id) {
                      markItem(current.recording_id, '打回', corpusNotes[current.id] || '');
                    }
                  }}
                  disabled={submittingReview}
                  className="w-full py-2 px-3 rounded-lg border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50"
                  placeholder="说明问题所在..."
                />
              </div>
            )}

            {/* Review Comment */}
            <div className="flex-1 flex flex-col">
              <p className="text-xs text-slate-400 mb-1">审核意见（整包）</p>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                disabled={submittingReview}
                className="flex-1 bg-white rounded-lg border border-slate-200 p-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                placeholder="可选：输入审核意见..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default QualityReviewWork;
