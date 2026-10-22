import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, LogOut } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import InspectionWork from './InspectionWork';
import InspectorPlaceholder from './InspectorPlaceholder';

interface InspectorStats {
  packages: number;
  corpus_count: number;
  total_duration_seconds: number;
  approved_packages: number;
  approved_duration_seconds: number;
}

interface PackageItem {
  id: number;
  name: string;
  size: number;
  quality_status: string;
  corpus_group_name: string;
  annotator_name: string;
  created_at: string;
}

const Inspector: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');

  React.useEffect(() => {
    if (!user.id) {
      navigate('/');
    }
  }, [user.id, navigate]);

  // 如果启用了占位符模式，显示占位符界面
  if (user.role_feature_flag === 1) {
    return <InspectorPlaceholder />;
  }

  const [view, setView] = useState<'hall' | 'pending' | 'progress'>('hall');
  const [stats, setStats] = useState<InspectorStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<PackageItem[]>([]);
  const [myPackages, setMyPackages] = useState<PackageItem[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [workingPackage, setWorkingPackage] = useState<PackageItem | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  React.useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await apiFetch(getApiUrl(`/inspector/statistics?user_id=${user.id}`));
        const json = await res.json();
        if (json.code === 200) setStats(json.data);
      } catch { /* ignore */ }
      finally { setStatsLoading(false); }
    };
    fetchStats();
  }, [user.id]);

  React.useEffect(() => {
    if (view === 'hall') {
      fetchAvailablePackages();
    } else if (view === 'pending') {
      fetchMyPackages();
    }
  }, [view]);

  const fetchAvailablePackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/inspector/available-packages?user_id=${user.id}`));
      const json = await res.json();
      if (json.code === 200) setAvailablePackages(json.data || []);
    } catch { /* ignore */ }
    finally { setPackagesLoading(false); }
  };

  const fetchMyPackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/inspector/my-packages?user_id=${user.id}`));
      const json = await res.json();
      if (json.code === 200) setMyPackages(json.data || []);
    } catch { /* ignore */ }
    finally { setPackagesLoading(false); }
  };

  const claimPackage = async (packageId: number) => {
    try {
      const res = await apiFetch(getApiUrl(`/inspector/packages/${packageId}/claim`), {
        method: 'POST',
        body: JSON.stringify({ user_id: user.id }),
      });
      if (res.ok) {
        const pkg = availablePackages.find(p => p.id === packageId);
        if (pkg) {
          setWorkingPackage(pkg);
        }
      }
    } catch { /* ignore */ }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('user');
    navigate('/');
  };

  if (workingPackage) {
    return (
      <InspectionWork
        package={workingPackage}
        userId={user.id}
        onBack={() => setWorkingPackage(null)}
        onComplete={() => {
          setWorkingPackage(null);
          fetchAvailablePackages();
          fetchMyPackages();
        }}
      />
    );
  }

  const navItems = [
    { viewKey: 'hall' as const, label: '任务大厅' },
    { viewKey: 'pending' as const, label: '待质检任务' },
    { viewKey: 'progress' as const, label: '个人进度' },
  ];

  const filterPackages = (packages: PackageItem[]) => {
    let filtered = packages;
    if (dateFrom) {
      filtered = filtered.filter(pkg => pkg.created_at >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(pkg => pkg.created_at <= dateTo + ' 23:59');
    }
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.name.toLowerCase().includes(search) ||
        pkg.annotator_name.toLowerCase().includes(search)
      );
    }
    return filtered;
  };

  const renderContent = () => {
    return (
      <div className="w-full flex flex-col items-center p-8">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-bold text-slate-800 mb-6">
            {view === 'hall' ? '任务大厅' : view === 'pending' ? '待质检任务' : '个人进度'}
          </h1>

          {view === 'progress' ? (
            // 个人进度视图
            <>
              {statsLoading ? (
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm text-center text-slate-500">加载统计中...</div>
              ) : stats ? (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: '已完成包数', count: String(stats.packages), color: 'blue' },
                    { label: '质检语料数', count: String(stats.corpus_count), color: 'green' },
                    { label: '总工作时长', count: (() => { const t = stats.total_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })(), color: 'purple' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                      <p className="text-sm text-slate-600 mb-2">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-800">{stat.count}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {stats && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                    <p className="text-sm text-green-600 mb-2">质检审核通过包数</p>
                    <p className="text-3xl font-bold text-green-700">{stats.approved_packages}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                    <p className="text-sm text-green-600 mb-2">质检审核通过时长</p>
                    <p className="text-3xl font-bold text-green-700">{(() => { const t = stats.approved_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })()}</p>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg p-8 border border-slate-200 shadow-sm text-center text-slate-500">
                <p>统计完成情况已在上方卡片中展示</p>
              </div>
            </>
          ) : (
            // 任务大厅和待质检任务视图
            <>
              {/* 统计卡 */}
              {statsLoading ? (
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm text-center text-slate-500 mb-6">加载统计中...</div>
              ) : stats ? (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {[
                    { label: '待质检包数', count: String(stats.packages) },
                    { label: '质检语料数', count: String(stats.corpus_count) },
                    { label: '工作时长', count: (() => { const t = stats.total_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })() },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                      <p className="text-sm text-slate-600 mb-2">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-800">{stat.count}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {stats && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                    <p className="text-sm text-green-600 mb-2">质检审核通过包数</p>
                    <p className="text-3xl font-bold text-green-700">{stats.approved_packages}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                    <p className="text-sm text-green-600 mb-2">质检审核通过时长</p>
                    <p className="text-3xl font-bold text-green-700">{(() => { const t = stats.approved_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })()}</p>
                  </div>
                </div>
              )}

              {/* 筛选区域 */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-slate-500 mb-1">搜索标注员</label>
                    <input
                      type="text"
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="输入标注员名称..."
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </div>
                  {(dateFrom || dateTo || searchText) && (
                    <button
                      onClick={() => { setDateFrom(''); setDateTo(''); setSearchText(''); }}
                      className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 underline"
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              </div>

              {/* 包列表 */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {packagesLoading ? (
                  <div className="p-8 text-center text-slate-400">加载中...</div>
                ) : view === 'hall' ? (
                  (() => {
                    const filtered = filterPackages(availablePackages);
                    return filtered.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        {availablePackages.length === 0 ? '暂无待领任务' : '无符合条件的任务'}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {filtered.map((pkg) => (
                          <div key={pkg.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div>
                              <p className="font-bold text-slate-800">{pkg.name}</p>
                              <p className="text-sm text-slate-500">
                                {pkg.corpus_group_name} • {pkg.size} 条语料
                                {pkg.annotator_name && ` • 标注员: ${pkg.annotator_name}`}
                              </p>
                            </div>
                            <button
                              onClick={() => claimPackage(pkg.id)}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-sm transition-colors active:scale-95"
                            >
                              领取
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const filtered = filterPackages(myPackages);
                    return filtered.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        {myPackages.length === 0 ? '暂无进行中的任务' : '无符合条件的任务'}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {filtered.map((pkg) => (
                          <div key={pkg.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div>
                              <p className="font-bold text-slate-800">{pkg.name}</p>
                              <p className="text-sm text-slate-500">
                                {pkg.corpus_group_name} • {pkg.size} 条语料
                                {pkg.annotator_name && ` • 标注员: ${pkg.annotator_name}`}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                const pkg_obj = { ...pkg, id: pkg.id } as PackageItem;
                                setWorkingPackage(pkg_obj);
                              }}
                              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-sm transition-colors active:scale-95"
                            >
                              继续质检
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Top Bar */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-800 text-sm">语音质检系统</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">质检员</span>
          <span className="text-sm text-slate-600">{user.username ?? 'inspector'}</span>
          <button onClick={handleLogout} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 bg-white border-r border-slate-200 flex flex-col py-3 shrink-0">
          {navItems.map((item) => {
            const isActive = view === item.viewKey;
            return (
              <button key={item.viewKey} onClick={() => setView(item.viewKey)}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-r-2 ${isActive
                    ? 'bg-amber-50 text-amber-700 border-amber-600 font-semibold'
                    : 'text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-700'
                  }`}>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Inspector;
