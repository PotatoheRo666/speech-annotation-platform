import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Play, Check, X, Loader2, CheckCircle } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import Pagination from '../components/Pagination';

interface CorpusItem {
  id: number;
  text_id: string;
  content: string;
  recording_id: number | null;
  recording_file: string | null;
  recorded_at: string | null;
  was_rejected?: boolean;
  rejection_note?: string;
  is_valid?: number | null;
}

interface PackageData {
  id: number;
  name: string;
  size: number;
  status: string;
  review_status: string;
  corpus_group_name: string;
  collector_id: number;
  collector_name: string;
  corpus_list: CorpusItem[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
}

interface Props {
  onBack: () => void;
  userId: number;
  corpusGroupId?: number;
}

const PackageReview: React.FC<Props> = ({ onBack, userId, corpusGroupId }) => {
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PackageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<string>('待审核');

  const [playingRecordingId, setPlayingRecordingId] = useState<number | null>(null);
  const [listenedIds, setListenedIds] = useState<Set<number>>(new Set());
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [rejectTo, setRejectTo] = useState<'原采集员' | '任务大厅'>('原采集员');
  const [markedCorpusIds, setMarkedCorpusIds] = useState<Set<number>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [corpusNotes, setCorpusNotes] = useState<Record<number, string>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 10;
  const [selectedCollectors, setSelectedCollectors] = useState<Set<number>>(new Set());
  const [showCollectorDropdown, setShowCollectorDropdown] = useState(false);
  const [allCollectors, setAllCollectors] = useState<{ id: number, username: string }[]>([]);
  const [batchApproving, setBatchApproving] = useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCollectorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch all collectors for the corpus group
  useEffect(() => {
    const fetchCollectors = async () => {
      try {
        const res = await apiFetch(getApiUrl(`/admin/corpus-group-collectors/${corpusGroupId}`));
        const json = await res.json();
        if (json.code === 200) setAllCollectors(json.data ?? []);
      } catch { /* ignore */ }
    };
    fetchCollectors();
  }, [corpusGroupId]);

  useEffect(() => {
    setPage(0);
    fetchPackages(0);
  }, [reviewFilter]);

  const fetchPackages = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      let url = getApiUrl('/admin/package-submissions');
      const params = new URLSearchParams();

      if (corpusGroupId) {
        params.append('corpus_group_id', corpusGroupId.toString());
      }
      if (reviewFilter) {
        params.append('review_status', reviewFilter);
      }
      params.append('limit', PAGE_SIZE.toString());
      params.append('offset', (currentPage * PAGE_SIZE).toString());

      if (params.toString()) {
        url += '?' + params.toString();
      }

      const res = await apiFetch(url);
      const data = await res.json();
      setPackages(data.data ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [reviewFilter, corpusGroupId, page]);

  const fetchPackageDetail = async (packageId: number) => {
    try {
      const res = await apiFetch(getApiUrl(`/admin/package-detail/${packageId}`));
      const data = await res.json();
      if (res.ok) {
        setSelectedPackage(data.data);
        setReviewComment(data.data.review_comment || '');
        setMarkedCorpusIds(new Set()); // 重置标记的语料ID
      }
    } catch {
      alert('加载包详情失败');
    }
  };

  const playRecording = async (recordingId: number) => {
    try {
      console.log('[试听] 开始下载: ', recordingId);
      const res = await apiFetch(getApiUrl(`/admin/download-recording/${recordingId}`));
      const data = await res.json();

      if (!res.ok) {
        console.error('[试听] 服务器错误:', data);
        alert('获取录音失败: ' + (data.detail || '未知错误'));
        return;
      }

      if (!audioRef.current) {
        console.error('[试听] 音频元素不存在');
        return;
      }

      const audio = audioRef.current;
      const url = data.data.url;

      console.log('[试听] URL:', url);

      // 重置���频
      audio.currentTime = 0;
      audio.src = url;

      // 设置事件处理器
      const handleCanPlay = () => {
        console.log('[试听] 音频可以播放，开始播放...');
        audio.removeEventListener('canplay', handleCanPlay);

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[试听] 播放开始');
              setPlayingRecordingId(recordingId);
            })
            .catch(error => {
              console.error('[试听] 播放错误:', error.name, error.message);
              alert('播放失败: ' + error.message);
              setPlayingRecordingId(null);
            });
        }
      };

      const handleError = () => {
        const errorCode = audio.error?.code;
        const errorMessage = audio.error?.message || '未知错误';
        const errorCodeNames: Record<number, string> = {
          1: 'MEDIA_ERR_ABORTED (加载被中止)',
          2: 'MEDIA_ERR_NETWORK (网络错误)',
          3: 'MEDIA_ERR_DECODE (解码错误)',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED (源不支持)',
        };

        const errorMsg = errorCodeNames[errorCode || 0] || `错误代码${errorCode}`;
        console.error('[试听] 加载错误:', errorMsg, errorMessage);
        console.error('[试听] 源URL:', url);
        alert(`无法加载音频文件\n\n原因: ${errorMsg}\n\n请检查MinIO服务是否运行，或查看后端日志`);
        audio.removeEventListener('error', handleError);
        setPlayingRecordingId(null);
      };

      const handleEnded = () => {
        console.log('[试听] 播放结束');
        setPlayingRecordingId(null);
        setListenedIds(prev => new Set(prev).add(recordingId));
      };

      // 移除旧的事件处理器
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);

      // 添加新的事件处理器
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      audio.addEventListener('ended', handleEnded);

      // 开始加载
      audio.load();
      console.log('[试听] 已调用load()，等待音频可播放...');
    } catch (e) {
      console.error('[试听] 异常:', e);
      alert('获取录音失败: ' + (e instanceof Error ? e.message : String(e)));
      setPlayingRecordingId(null);
    }
  };

  const submitReview = async (status: string) => {
    if (!selectedPackage) return;
    if (!window.confirm(`确认${status}该包吗？`)) return;

    setSubmittingReview(true);
    try {
      const res = await apiFetch(getApiUrl(`/admin/review-package`), {
        method: 'POST',
        body: JSON.stringify({
          package_id: selectedPackage.id,
          reviewer_id: userId,
          review_status: status,
          review_comment: reviewComment,
          ...(status === '已打回' ? {
            reject_to: rejectTo,
            rejected_corpus_ids: [...markedCorpusIds],
            corpus_notes: corpusNotes,
          } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.msg);
        setSelectedPackage(null);
        setPage(0);
        fetchPackages(0);
      } else {
        alert(data.detail || '审核失败');
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleBatchApprove = async () => {
    const pendingPackages = packages.filter(p => p.review_status === '待审核');
    if (pendingPackages.length === 0) {
      alert('当前页没有待审核的包');
      return;
    }
    if (!window.confirm(`确认将当前页 ${pendingPackages.length} 个待审核的包全部标记为已合格？`)) return;

    setBatchApproving(true);
    try {
      const res = await apiFetch(getApiUrl('/admin/batch-review-packages'), {
        method: 'POST',
        body: JSON.stringify({
          package_ids: pendingPackages.map(p => p.id),
          reviewer_id: userId,
          review_status: '已合格',
          review_comment: '整组通过',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.msg);
        setPage(0);
        fetchPackages(0);
      } else {
        alert(data.detail || '批量审核失败');
      }
    } catch {
      alert('网络异常');
    } finally {
      setBatchApproving(false);
    }
  };

  if (selectedPackage) {
    const recorded = selectedPackage.corpus_list.filter(c => c.recording_id).length;
    const total = selectedPackage.corpus_list.length;
    const isFullyRecorded = recorded === total;

    return (
      <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <header className="flex items-center gap-3 py-4 mb-4">
            <button onClick={() => setSelectedPackage(null)} className="p-2 hover:bg-white rounded-full">
              <ChevronLeft className="w-6 h-6 text-slate-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-800">{selectedPackage.name}</h1>
              <p className="text-xs text-slate-500">
                采集员: {selectedPackage.collector_name} | {selectedPackage.corpus_group_name}
              </p>
            </div>
          </header>

          {/* 录音列表 */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-700">语料录音 ({recorded}/{total})</h2>
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${isFullyRecorded ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
                }`}>
                {isFullyRecorded ? '已完成' : '未完成'}
              </span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {selectedPackage.corpus_list.map((corpus) => (
                <div key={corpus.id} className={`rounded-xl p-3 border ${corpus.was_rejected
                    ? 'bg-yellow-50 border-yellow-200'
                    : listenedIds.has(corpus.recording_id ?? -1)
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-slate-50 border-slate-100'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-mono text-slate-500">{corpus.text_id}</p>
                        {corpus.was_rejected && (
                          <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-semibold">
                            ⟳ 重新提交
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700">{corpus.content}</p>
                      {corpus.is_valid === 0 && (
                        <p className="text-xs text-red-600 font-semibold mt-1">⚠ 标记为无效</p>
                      )}
                      {corpus.recorded_at && (
                        <p className="text-xs text-slate-400 mt-1">录制于: {corpus.recorded_at}</p>
                      )}
                      {corpus.was_rejected && corpus.rejection_note && (
                        <div className="mt-2 p-2 bg-white rounded border border-yellow-200">
                          <p className="text-xs text-yellow-800"><strong>之前的备注:</strong> {corpus.rejection_note}</p>
                        </div>
                      )}
                      {markedCorpusIds.has(corpus.id) && (
                        <input
                          type="text"
                          value={corpusNotes[corpus.id] || ''}
                          onChange={(e) => setCorpusNotes({ ...corpusNotes, [corpus.id]: e.target.value })}
                          placeholder="说明问题所在..."
                          className="mt-2 w-full px-2 py-1 text-xs bg-white rounded border border-red-200 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-300"
                        />
                      )}
                    </div>
                    {corpus.recording_file ? (
                      <div className="shrink-0 flex gap-2">
                        <button
                          onClick={() => playRecording(corpus.recording_id!)}
                          disabled={playingRecordingId === corpus.recording_id}
                          className={`px-3 py-2 rounded-lg font-medium text-xs transition-colors ${playingRecordingId === corpus.recording_id
                              ? 'bg-blue-500 text-white'
                              : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            }`}
                        >
                          <Play className="w-4 h-4 inline mr-1" />
                          {playingRecordingId === corpus.recording_id ? '播放中' : '试听'}
                        </button>
                        <button
                          onClick={() => {
                            const newMarked = new Set(markedCorpusIds);
                            if (newMarked.has(corpus.id)) {
                              newMarked.delete(corpus.id);
                            } else {
                              newMarked.add(corpus.id);
                            }
                            setMarkedCorpusIds(newMarked);
                          }}
                          className={`px-3 py-2 rounded-lg font-medium text-xs transition-colors ${markedCorpusIds.has(corpus.id)
                              ? 'bg-red-100 text-red-600 hover:bg-red-200'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                          {markedCorpusIds.has(corpus.id) ? '❌ 有问题' : '标记'}
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-300">未录音</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 音频播放器（隐藏） */}
            <audio ref={audioRef} className="hidden" />
          </div>

          {/* 审核信息 */}
          {selectedPackage.review_status !== '待审核' && (
            <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-200">
              <p className="text-sm font-semibold text-slate-700 mb-2">审核历史</p>
              <p className="text-sm text-slate-600">审核结果: <span className="font-bold">{selectedPackage.review_status}</span></p>
              <p className="text-sm text-slate-600">审核员: {selectedPackage.reviewed_by || '-'}</p>
              <p className="text-sm text-slate-600">审核时间: {selectedPackage.reviewed_at || '-'}</p>
              {selectedPackage.review_comment && (
                <p className="text-sm text-slate-600 mt-2">备注: {selectedPackage.review_comment}</p>
              )}
            </div>
          )}

          {/* 审核表单 */}
          {selectedPackage.review_status === '待审核' && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">审核意见</h3>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="可选：输入审核意见"
                className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all"
                rows={3}
              />

              {/* 打回目的地选择器 */}
              <div className="mt-3">
                <p className="text-xs text-slate-500 mb-2">打回目的地</p>
                <div className="flex gap-3">
                  {(['原采集员', '任务大厅'] as const).map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="rejectTo"
                        value={opt}
                        checked={rejectTo === opt}
                        onChange={() => setRejectTo(opt)}
                        className="accent-red-500"
                      />
                      <span className="text-sm text-slate-700">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => submitReview('已打回')}
                  disabled={submittingReview || !isFullyRecorded}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-bold transition-all"
                >
                  <X className="w-5 h-5" />
                  {submittingReview ? '处理中...' : markedCorpusIds.size > 0 ? `打回 (${markedCorpusIds.size}条问题)` : '整包打回 (全部重录)'}
                </button>
                <button
                  onClick={() => submitReview('已合格')}
                  disabled={submittingReview || !isFullyRecorded}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-xl font-bold transition-all"
                >
                  <Check className="w-5 h-5" />
                  {submittingReview ? '处理中...' : '确定合格'}
                </button>
              </div>
              {!isFullyRecorded && (
                <p className="text-xs text-slate-400 mt-2 text-center">必须录完所有语料才能审核</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">
      <div className="w-full max-w-md">
        <header className="flex items-center justify-between py-4 mb-4">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors text-slate-600">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-800">采集包审核</h1>
          <div className="w-10" />
        </header>

        {/* 筛选 */}
        <div className="flex gap-2 mb-4">
          {['待审核', '已合格', '已打回'].map(status => (
            <button
              key={status}
              onClick={() => setReviewFilter(status)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${reviewFilter === status
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* 整组通过按钮 */}
        {reviewFilter === '待审核' && (
          <div className="mb-4">
            <button
              onClick={handleBatchApprove}
              disabled={batchApproving}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {batchApproving ? (
                <><Loader2 className="w-4 h-4 animate-spin" />处理中...</>
              ) : (
                <><CheckCircle className="w-4 h-4" />整组通过（当前页所有待审核）</>
              )}
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
                className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">结束日期</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs text-slate-500 mb-1">采集员筛选</label>
              <button
                type="button"
                onClick={() => setShowCollectorDropdown(!showCollectorDropdown)}
                className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 text-left min-w-[140px] flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {selectedCollectors.size === 0 ? '全部采集员' : `已选 ${selectedCollectors.size} 人`}
                </span>
                <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${showCollectorDropdown ? 'rotate-90' : '-rotate-90'}`} />
              </button>
              {showCollectorDropdown && (
                <div className="absolute z-20 mt-1 left-0 w-56 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">
                  {allCollectors.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400">暂无采集员数据</p>
                  ) : (
                    allCollectors.map(c => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCollectors.has(c.id)}
                          onChange={() => {
                            const next = new Set(selectedCollectors);
                            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                            setSelectedCollectors(next);
                          }}
                          className="accent-violet-600"
                        />
                        <span className="text-sm text-slate-700 truncate">{c.username}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs text-slate-500 mb-1">搜索</label>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="搜索包名..."
                className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            {(dateFrom || dateTo || searchText || selectedCollectors.size > 0) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setSearchText(''); setSelectedCollectors(new Set()); }}
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
              <Loader2 className="animate-spin w-6 h-6 text-violet-400" />
            </div>
          ) : (() => {
            let filtered = packages;
            if (dateFrom) {
              filtered = filtered.filter(pkg => pkg.completed_at >= dateFrom);
            }
            if (dateTo) {
              filtered = filtered.filter(pkg => pkg.completed_at <= dateTo + ' 23:59');
            }
            if (searchText) {
              const search = searchText.toLowerCase();
              filtered = filtered.filter(pkg =>
                pkg.name.toLowerCase().includes(search)
              );
            }
            if (selectedCollectors.size > 0) {
              filtered = filtered.filter(pkg => selectedCollectors.has(pkg.collector_id));
            }
            return filtered.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-6">
                {packages.length === 0 ? '暂无包' : '无符合条件的包'}
              </p>
            ) : (
              <ul className="space-y-3">
                {filtered.map(pkg => (
                  <li key={pkg.id}>
                    <button
                      onClick={() => fetchPackageDetail(pkg.id)}
                      className="w-full text-left p-4 bg-slate-50 hover:bg-violet-50 rounded-xl border border-slate-100 hover:border-violet-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-bold text-slate-800">{pkg.name}</p>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${pkg.review_status === '已合格' ? 'bg-green-100 text-green-600' :
                            pkg.review_status === '已打回' ? 'bg-red-100 text-red-600' :
                              'bg-amber-100 text-amber-600'
                          }`}>
                          {pkg.review_status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">采集员: {pkg.collector_name}</p>
                      <p className="text-xs text-slate-500">
                        进度: {pkg.recorded_count} / {pkg.total_count}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={(p) => { setPage(p); fetchPackages(p); }} />
        </div>
      </div>
    </div>
  );
};

export default PackageReview;
