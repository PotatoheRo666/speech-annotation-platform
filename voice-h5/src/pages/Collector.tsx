import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, LogOut, ListTodo, RefreshCw, User, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import RecordingWork from './RecordingWork';

interface PkgItem {
  id: number;
  name: string;
  size: number;
  status: string;
  corpus_group_name: string;
  created_at?: string;
  claimed_at?: string;
  review_status?: string;
  review_comment?: string;
}

type Tab = 'home' | 'mine' | 'work' | 'profile';

interface CollectorStats {
  packages: number;
  completed_packages: number;
  corpus_count: number;
  total_duration_seconds: number;
  approved_packages: number;
  approved_duration_seconds: number;
}

const Collector: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');

  // 如果没有登录，重定向到登录页
  React.useEffect(() => {
    if (!user.id) {
      navigate('/');
    } else {
      // 登录后立即推送一个新的历史记录，防止返回按钮回到登录页
      window.history.pushState({ page: 'collector' }, '', window.location.href);
    }
  }, [user.id, navigate]);


  const [tab, setTab] = useState<Tab>('home');
  const [myPkgs, setMyPkgs] = useState<PkgItem[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState('');
  const [workingPackage, setWorkingPackage] = useState<PkgItem | null>(null);
  const [profile, setProfile] = useState({ real_name: '', gender: '', age: '', hometown: '', city: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [rejectedPackages, setRejectedPackages] = useState<any[]>([]);
  const [mineSearch, setMineSearch] = useState('');
  const [stats, setStats] = useState<CollectorStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [agreementModal, setAgreementModal] = useState<{ pkgId: number; agreementId: number; content: string } | null>(null);
  const [signingAgreement, setSigningAgreement] = useState(false);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [signature, setSignature] = useState<{ id: number; signed_at: string; signature_url: string | null } | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  // 任务大厅：可领取的包，按语料组分组
  const [availablePkgs, setAvailablePkgs] = useState<PkgItem[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [claimingPkgId, setClaimingPkgId] = useState<number | null>(null);

  const fetchSignature = useCallback(async () => {
    setSigLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/agreement-signature?user_id=${user.id}`));
      const data = await res.json();
      if (res.ok && data.data) {
        setSignature(data.data);
      } else {
        setSignature(null);
      }
    } catch {
      setSignature(null);
    } finally {
      setSigLoading(false);
    }
  }, [user.id]);

  const handleDeleteSignature = async () => {
    if (!window.confirm('您确定要删除当前协议签名吗？删除后在领取下一个包时需要重新签署协议。')) {
      return;
    }
    try {
      const res = await apiFetch(getApiUrl(`/collector/agreement-signature?user_id=${user.id}`), {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.msg || '删除成功');
        fetchSignature();
      } else {
        alert(data.detail || '删除失败');
      }
    } catch {
      alert('网络错误，删除失败');
    }
  };

  const handleManualSign = async () => {
    try {
      const res = await apiFetch(getApiUrl('/login-terms'));
      if (res.ok) {
        const data = await res.json();
        setAgreementModal({
          pkgId: 0,
          agreementId: -1,
          content: data.data.user_agreement || "暂无用户协议"
        });
      } else {
        alert('获取系统协议失败');
      }
    } catch {
      alert('网络错误，获取系统协议失败');
    }
  };

  const fetchMyPkgs = useCallback(async () => {
    setMineLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/my-packages?user_id=${user.id}`));
      const data = await res.json();
      const allPkgs = data.data ?? [];
      setMyPkgs(allPkgs);
      const rejected = allPkgs.filter((p: any) => p.review_status === '已打回');
      setRejectedPackages(rejected);
      return allPkgs;
    } finally {
      setMineLoading(false);
    }
  }, [user.id]);

  const fetchAvailablePkgs = useCallback(async () => {
    setAvailableLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/available-packages?user_id=${user.id}`));
      const data = await res.json();
      setAvailablePkgs(data.data ?? []);
      // 默认展开所有语料组
      const groups = new Set<string>((data.data ?? []).map((p: PkgItem) => p.corpus_group_name));
      setExpandedGroups(groups);
    } catch { }
    finally { setAvailableLoading(false); }
  }, [user.id]);

  const handleClaimSpecific = async (pkg: PkgItem) => {
    setClaimingPkgId(pkg.id);
    setClaimMsg('');
    try {
      const res = await apiFetch(getApiUrl(`/collector/packages/${pkg.id}/claim`), {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.requires_agreement) {
        setClaimingPkgId(null);
        setAgreementModal({
          pkgId: pkg.id,
          agreementId: data.agreement_id,
          content: data.agreement_content,
        });
        return;
      }
      if (res.ok) {
        // 领取成功，直接进入作业
        setWorkingPackage({ ...pkg, status: '已领取' });
        setTab('work');
        fetchAvailablePkgs();
      } else {
        setClaimMsg(data.detail ?? '领取失败');
      }
    } catch {
      setClaimMsg('网络异常，请重试');
    } finally {
      setClaimingPkgId(null);
    }
  };

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiFetch(getApiUrl(`/collector/profile?user_id=${user.id}`));
      const data = await res.json();
      if (res.ok && data.data) {
        setProfile({
          real_name: data.data.real_name ?? '',
          gender: data.data.gender ?? '',
          age: data.data.age != null ? String(data.data.age) : '',
          hometown: data.data.hometown ?? '',
          city: data.data.city ?? '',
        });
        // 检查个人信息是否完整
        const isComplete = data.data.real_name && data.data.gender && data.data.age && data.data.hometown && data.data.city;
        setProfileIncomplete(!isComplete);
      }
    } catch { }
  }, [user.id]);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const res = await apiFetch(getApiUrl('/collector/profile'), {
        method: 'PATCH',
        body: JSON.stringify({
          user_id: user.id,
          real_name: profile.real_name || null,
          gender: profile.gender || null,
          age: profile.age ? parseInt(profile.age) : null,
          hometown: profile.hometown || null,
          city: profile.city || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfileMsg('保存成功');
        // 检查保存后的个人信息是否完整
        const isComplete = profile.real_name && profile.gender && profile.age && profile.hometown && profile.city;
        setProfileIncomplete(!isComplete);
      } else {
        setProfileMsg(data.detail ?? '保存失败');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/collector/statistics?user_id=${user.id}`));
      const data = await res.json();
      if (data.code === 200) setStats(data.data);
    } catch { }
    finally { setStatsLoading(false); }
  }, [user.id]);
  // Load my packages on mount
  useEffect(() => {
    fetchMyPkgs();
    fetchProfile();
    fetchStats();
    fetchSignature();
    fetchAvailablePkgs();
  }, [fetchMyPkgs, fetchProfile, fetchStats, fetchSignature, fetchAvailablePkgs]);

  useEffect(() => {
    if (tab === 'mine') fetchMyPkgs();
    if (tab === 'profile') {
      fetchProfile();
      fetchSignature();
    }
    if (tab === 'home') {
      fetchStats();
      fetchAvailablePkgs();
    }
  }, [tab, fetchStats, fetchMyPkgs, fetchProfile, fetchSignature, fetchAvailablePkgs]);
  // 拦截浏览器返回键，返回到首页而不是登录页
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // 如果尝试返回登录页，阻止并保留在当前页面
      if (e.state?.page !== 'collector') {
        window.history.pushState({ page: 'collector' }, '', window.location.href);
      }
      setTab('home');
      setWorkingPackage(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 个人信息不完整时强制跳转到个人信息页面
  useEffect(() => {
    if (profileIncomplete) {
      setTab('profile');
    }
  }, [profileIncomplete]);

  const handleStartWork = async () => {
    setClaiming(true);
    setClaimMsg('');
    try {
      // 先刷新包列表，确保数���最新
      const pkgs = await fetchMyPkgs();

      // 检查是否有已领取的包
      const claimedPkg = pkgs?.find((p: any) => p.status === '已领取');
      if (claimedPkg) {
        // 有已领取的包，直接进入作业
        setWorkingPackage(claimedPkg);
        setTab('work');
        setClaiming(false);
        return;
      }

      // 没有已领取的包，去领新包
      const res = await apiFetch(getApiUrl('/collector/claim-next'), {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.requires_agreement) {
        setClaiming(false);
        setAgreementModal({
          pkgId: data.agreement_id,
          agreementId: data.agreement_id,
          content: data.agreement_content
        });
      } else if (res.ok) {
        setClaimMsg('✓ 领取成功，准备开始作业');
        // 优先使用 claim-next 返回的数据直接跳转，避免二次请求的竞态问题
        if (data.package_id) {
          setWorkingPackage({
            id: data.package_id,
            name: data.package_name || '',
            size: data.package_size || 0,
            corpus_group_name: data.corpus_group_name || '',
            status: '已领取',
            review_status: '',
            claimed_at: '',
          });
          setTab('work');
        } else {
          // fallback
          const newPkgs = await fetchMyPkgs();
          const pkg = newPkgs?.find((p: any) => p.status === '已领取');
          if (pkg) {
            setWorkingPackage(pkg);
            setTab('work');
          } else {
            setClaimMsg('领取成功但加载失败，请刷新页面');
          }
        }
      } else {
        setClaimMsg(data.detail ?? '领取失败');
      }
    } catch (err) {
      setClaimMsg('网络异常，请重试');
    } finally {
      setClaiming(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('user');
    navigate('/');
  };

  // 工作页面
  if (tab === 'work' && workingPackage) {
    return (
      <RecordingWork
        package={workingPackage}
        userId={user.id}
        onBack={() => { setTab('mine'); setWorkingPackage(null); }}
        onComplete={() => { setTab('mine'); setWorkingPackage(null); fetchMyPkgs(); }}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl flex flex-col" style={{ minHeight: '640px' }}>

        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400 leading-none">当前角色</p>
              <p className="text-sm font-bold text-slate-800">采集员 · {user.username ?? 'collector'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-red-50 rounded-full transition-colors text-red-400"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 px-6 py-4 overflow-y-auto">

          {/* ── 主页 ── */}
          {tab === 'home' && (
            <>
              {/* 统计信息 */}
              {statsLoading ? (
                <div className="bg-slate-50 rounded-2xl p-4 text-center text-slate-500">加载统计中...</div>
              ) : stats ? (
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-4 mb-4 border border-blue-200">
                  <p className="text-sm font-bold text-blue-700 mb-3">采集进度统计</p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.corpus_count}</p>
                      <p className="text-xs text-slate-500 mt-1">已录音条数</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{(() => { const t = stats.total_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })()}</p>
                      <p className="text-xs text-slate-500 mt-1">总录音时长</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.completed_packages}</p>
                      <p className="text-xs text-slate-500 mt-1">已完成包数</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{stats.approved_packages}</p>
                      <p className="text-xs text-green-600 mt-1">审核通过包数</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                      <p className="text-2xl font-bold text-green-600">{(() => { const t = stats.approved_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })()}</p>
                      <p className="text-xs text-green-600 mt-1">审核通过时长</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* 被打回包提醒 */}
              {rejectedPackages.length > 0 && (
                <div className="bg-orange-50 rounded-2xl p-4 mb-5 border-2 border-orange-300">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">⚠️</div>
                    <div className="flex-1">
                      <p className="font-bold text-orange-700 mb-2">
                        {rejectedPackages.length} 个包已被打回，请修改后重新提交
                      </p>
                      <div className="space-y-1 mb-3">
                        {rejectedPackages.map((pkg) => (
                          <div key={pkg.id} className="text-sm text-orange-600">
                            <p className="font-medium">{pkg.name}</p>
                            {pkg.review_comment && (
                              <p className="text-xs text-orange-500 mt-0.5">备注：{pkg.review_comment}</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setTab('mine')}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-bold transition-colors"
                      >
                        去任务列表
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {claimMsg && (
                <div className={`mb-3 px-4 py-3 rounded-2xl text-sm text-center font-medium ${claimMsg.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {claimMsg}
                </div>
              )}

              {/* ── 任务大厅 ── */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-bold text-slate-700">任务大厅</p>
                    <span className="text-xs text-slate-400">({availablePkgs.length} 个可领包)</span>
                  </div>
                  <button onClick={fetchAvailablePkgs} className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors rounded-lg">
                    <RefreshCw className={`w-3.5 h-3.5 ${availableLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {availableLoading && availablePkgs.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-4 text-center text-sm text-slate-400">加载中...</div>
                ) : availablePkgs.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-4 text-center text-sm text-slate-400">
                    暂无可领取的语料包
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* 按语料组分组展示 */}
                    {Array.from(new Set(availablePkgs.map(p => p.corpus_group_name))).map(groupName => {
                      const pkgsInGroup = availablePkgs.filter(p => p.corpus_group_name === groupName);
                      const isExpanded = expandedGroups.has(groupName);
                      return (
                        <div key={groupName} className="bg-blue-50 rounded-2xl border border-blue-100 overflow-hidden">
                          {/* 分组标题 */}
                          <button
                            onClick={() => {
                              const next = new Set(expandedGroups);
                              if (isExpanded) next.delete(groupName); else next.add(groupName);
                              setExpandedGroups(next);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-blue-500" />}
                              <span className="text-sm font-bold text-blue-700">{groupName || '未分组'}</span>
                              <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-medium">{pkgsInGroup.length} 个包</span>
                            </div>
                          </button>
                          {/* 包列表 */}
                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-2">
                              {pkgsInGroup.map(pkg => (
                                <div key={pkg.id} className="bg-white rounded-xl p-3 border border-blue-100 flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{pkg.name}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{pkg.size} 条语料</p>
                                  </div>
                                  <button
                                    onClick={() => handleClaimSpecific(pkg)}
                                    disabled={claimingPkgId === pkg.id}
                                    className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    {claimingPkgId === pkg.id ? (
                                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />领取中</>
                                    ) : '领取'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 如果有正在进行中的任务，显示继续作业按钮 */}
              {myPkgs.some(p => p.status === '已领取' || p.review_status === '已打回') && (
                <button
                  onClick={handleStartWork}
                  disabled={claiming}
                  className="w-full bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white py-3 rounded-2xl font-bold active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {claiming ? (
                    <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />加载中...</>
                  ) : (
                    <><Mic className="w-4 h-4" />继续进行中的任务</>
                  )}
                </button>
              )}
            </>
          )}

          {/* ── 我的任务 ── */}
          {tab === 'mine' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">我的任务</h2>
                <button onClick={fetchMyPkgs} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <input
                value={mineSearch}
                onChange={e => setMineSearch(e.target.value)}
                placeholder="搜索包名..."
                className="w-full px-3 py-2 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />

              {mineLoading ? (
                <div className="flex justify-center py-16 text-slate-400 text-sm">加载中...</div>
              ) : myPkgs.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-slate-400">
                  <ListTodo className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">还没有领取任何语料包</p>
                  <button
                    onClick={() => setTab('home')}
                    className="mt-4 text-blue-500 text-sm underline"
                  >
                    去任务大厅领取
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myPkgs.filter(pkg => pkg.name.toLowerCase().includes(mineSearch.toLowerCase())).map((pkg) => {
                    // 判断包是否可编辑：status为"已领取"或review_status为"已打回"时才能进入
                    const isEditable = pkg.status === '已领取' || pkg.review_status === '已打回';
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => { if (isEditable) { setWorkingPackage(pkg); setTab('work'); } }}
                        disabled={!isEditable}
                        className={`w-full rounded-2xl p-4 border transition-all text-left ${pkg.review_status === '已打回'
                          ? 'bg-red-50 border-2 border-red-300 hover:bg-red-100 hover:border-red-400 disabled:opacity-50 disabled:cursor-not-allowed'
                          : pkg.review_status === '已合格'
                            ? 'bg-green-50 border border-green-200 opacity-50 cursor-not-allowed'
                            : 'bg-slate-50 border border-slate-100 hover:border-blue-300 hover:bg-blue-50'
                          }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-slate-800 truncate">{pkg.name}</p>
                              {pkg.review_status === '已打回' && (
                                <span className="shrink-0 inline-block px-2 py-0.5 bg-red-500 text-white text-xs rounded font-bold">
                                  已打回
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{pkg.corpus_group_name} · {pkg.size} 条语料</p>
                            <p className="text-xs text-slate-300 mt-0.5">领取于 {pkg.claimed_at}</p>
                            {pkg.review_status === '已打回' && pkg.review_comment && (
                              <p className="text-xs text-red-600 mt-1 font-medium">审核备注：{pkg.review_comment}</p>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs px-3 py-1 rounded-full font-medium ${pkg.status === '已完成'
                            ? 'bg-green-100 text-green-600'
                            : pkg.review_status === '已打回'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-amber-100 text-amber-600'
                            }`}>
                            {pkg.review_status === '已打回' ? '已打回' : pkg.status}
                          </span>
                        </div>
                        {!isEditable && (
                          <p className="text-xs text-slate-400 mt-2">
                            {pkg.status === '已完成' ? '✓ 已完成提交，无法修改' : pkg.review_status === '已合格' ? '✓ 已通过审核，无法编辑' : '⏳ 等待审核中，无法编辑'}
                          </p>
                        )}
                      </button>
                    );
                  })}
                  {myPkgs.filter(pkg => pkg.name.toLowerCase().includes(mineSearch.toLowerCase())).length === 0 && myPkgs.length > 0 && (
                    <div className="flex flex-col items-center py-8 text-slate-400">
                      <p className="text-sm">无任务可做</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── 个人信息 ── */}
          {tab === 'profile' && (
            <>
              <h2 className="text-lg font-bold text-slate-800 mb-4">个人信息</h2>

              {profileIncomplete && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-700 font-medium">
                  ⚠️ 请完整填写个人信息后方可开始工作
                </div>
              )}

              {profileMsg && (
                <div className={`mb-3 px-4 py-2 rounded-xl text-sm text-center ${profileMsg === '保存成功' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                  }`}>
                  {profileMsg}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">姓名</label>
                  <input
                    value={profile.real_name}
                    onChange={e => setProfile(p => ({ ...p, real_name: e.target.value }))}
                    placeholder="请输入真实姓名"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">性别</label>
                  <div className="flex gap-4 px-1 py-2">
                    {['男', '女'].map(g => (
                      <label key={g} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="gender"
                          value={g}
                          checked={profile.gender === g}
                          onChange={() => setProfile(p => ({ ...p, gender: g }))}
                          className="accent-blue-600"
                        />
                        <span className="text-sm text-slate-700">{g}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">年龄</label>
                  <input
                    type="number"
                    value={profile.age}
                    onChange={e => setProfile(p => ({ ...p, age: e.target.value }))}
                    placeholder="请输入年龄"
                    min={1}
                    max={120}
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">籍贯</label>
                  <input
                    value={profile.hometown}
                    onChange={e => setProfile(p => ({ ...p, hometown: e.target.value }))}
                    placeholder="如：四川省成都市"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">城市</label>
                  <input
                    value={profile.city}
                    onChange={e => setProfile(p => ({ ...p, city: e.target.value }))}
                    placeholder="如：成都市"
                    className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>

                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all"
                >
                  {profileSaving ? '保存中...' : '保存'}
                </button>

                {/* 用户协议与签名管理 */}
                <div className="mt-8 pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">📄 用户协议与签名管理</h3>
                  {sigLoading ? (
                    <p className="text-xs text-slate-400">正在查询签名状态...</p>
                  ) : signature ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>已签署系统用户协议</span>
                        <span>时间: {signature.signed_at}</span>
                      </div>
                      {signature.signature_url && (
                        <div className="border border-slate-200 rounded-lg p-2 bg-white flex justify-center">
                          <img 
                            src={signature.signature_url} 
                            alt="电子签名" 
                            className="max-h-16 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const p = document.createElement('p');
                              p.className = 'text-xs text-red-500 my-2';
                              p.innerText = '签名图片在云存储中不存在（加载失败）';
                              e.currentTarget.parentNode?.appendChild(p);
                            }}
                          />
                        </div>
                      )}
                      <button
                        onClick={handleDeleteSignature}
                        className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all"
                      >
                        删除签名并重签
                      </button>
                    </div>
                  ) : (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-orange-700 font-medium mb-2">您当前尚未签署用户协议</p>
                      <button
                        onClick={handleManualSign}
                        className="mt-2 w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        手动签署协议
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom Tab Bar */}
        <nav className="border-t border-slate-100 grid grid-cols-3 shrink-0">
          {([
            { id: 'home' as Tab, icon: <Mic className="w-5 h-5" />, label: '主页' },
            { id: 'mine' as Tab, icon: <ListTodo className="w-5 h-5" />, label: '我的任务' },
            { id: 'profile' as Tab, icon: <User className="w-5 h-5" />, label: '个人信息' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (profileIncomplete && t.id !== 'profile') {
                  alert('请先完成个人信息填写');
                  return;
                }
                setTab(t.id);
              }}
              disabled={profileIncomplete && t.id !== 'profile'}
              className={`flex flex-col items-center py-3 gap-1 transition-colors ${profileIncomplete && t.id !== 'profile' ? 'opacity-50 cursor-not-allowed' : ''
                } ${tab === t.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              {t.icon}
              <span className="text-xs">{t.label}</span>
            </button>
          ))}
        </nav>

        <footer className="text-center text-slate-300 text-xs py-2 shrink-0">
          © 2026 语音语料采集系统
        </footer>
      </div>

      {/* 协议签署弹窗 */}
      {agreementModal && (
        <AgreementModal
          agreement={agreementModal}
          onSign={async (signatureBlob) => {
            setSigningAgreement(true);
            try {
              const formData = new FormData();
              formData.append('file', signatureBlob, 'signature.png');
              const res = await apiFetch(
                getApiUrl(`/collector/agreement-sign?user_id=${user.id}&agreement_id=${agreementModal.agreementId}`),
                { method: 'POST', body: formData }
              );
              if (res.ok) {
                setAgreementModal(null);
                fetchSignature(); // 刷新签名状态
                if (agreementModal.pkgId > 0) {
                  // 签署成功后，重新领取包（协议已签，claim-next不会再弹协议）
                  const claimRes = await apiFetch(getApiUrl('/collector/claim-next'), {
                    method: 'POST',
                    body: JSON.stringify({ user_id: user.id }),
                  });
                  if (claimRes.ok) {
                    const claimData = await claimRes.json();
                    if (claimData.package_id) {
                      setWorkingPackage({
                        id: claimData.package_id,
                        name: claimData.package_name || '',
                        size: claimData.package_size || 0,
                        corpus_group_name: claimData.corpus_group_name || '',
                        status: '已领取',
                        review_status: '',
                        claimed_at: '',
                      });
                      setTab('work');
                    } else {
                      const newPkgs = await fetchMyPkgs();
                      const pkg = newPkgs?.find((p: any) => p.status === '已领取');
                      if (pkg) {
                        setWorkingPackage(pkg);
                        setTab('work');
                      } else {
                        alert('领取成功但加载失败，请刷新页面');
                      }
                    }
                  } else {
                    const claimErr = await claimRes.json();
                    alert(claimErr.detail || '领取作业包失败');
                  }
                } else {
                  alert('签署成功！您现在可以正常领取作业包了。');
                }
              } else {
                const err = await res.json().catch(() => ({}));
                alert(err.detail || '签署失败');
              }
            } catch {
              alert('网络异常');
            } finally {
              setSigningAgreement(false);
            }
          }}
          onCancel={() => setAgreementModal(null)}
          disabled={signingAgreement}
        />
      )}
    </div>
  );
};

// ── 协议签署弹窗组件 ────────────────────────────────────────────
const AgreementModal: React.FC<{
  agreement: { pkgId: number; agreementId: number; content: string };
  onSign: (signatureBlob: Blob) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
}> = ({ agreement, onSign, onCancel, disabled }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 响应式调整 Canvas 宽度以适应容器
    const adjustCanvasSize = () => {
      const width = container.offsetWidth;
      const height = 150;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    // 初始调整
    adjustCanvasSize();

    // 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(adjustCanvasSize);
    resizeObserver.observe(container);

    // 禁用 Canvas 的默认触屏行为
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), false);
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), false);
    canvas.addEventListener('touchend', (e) => e.preventDefault(), false);

    return () => {
      resizeObserver.disconnect();
      canvas.removeEventListener('touchstart', (e) => e.preventDefault());
      canvas.removeEventListener('touchmove', (e) => e.preventDefault());
      canvas.removeEventListener('touchend', (e) => e.preventDefault());
    };
  }, []);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;

    const coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSign = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (blob) onSign(blob);
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">📄 用户协议</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* 协议文本阅读区 */}
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 max-h-64 overflow-y-auto">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{agreement.content}</p>
          </div>

          {/* 签名区 */}
          <div ref={containerRef}>
            <p className="text-sm font-medium text-slate-700 mb-2">请在下方手写签名：</p>
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              style={{ width: '100%', height: '150px', display: 'block', touchAction: 'none' }}
              className="border-2 border-dashed border-slate-300 rounded-lg bg-white cursor-crosshair"
            />
          </div>

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              onClick={clearSignature}
              disabled={disabled}
              className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              清除签名
            </button>
            <button
              onClick={handleSign}
              disabled={disabled}
              className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {disabled ? '签署中...' : '确认签署'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Collector;
