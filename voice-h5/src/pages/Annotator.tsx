import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, LogOut } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import AnnotationWork from './AnnotationWork';
import AnnotatorPlaceholder from './AnnotatorPlaceholder';

interface AnnotatorStats {
  packages: number;
  completed_packages: number;
  corpus_count: number;
  total_duration_seconds: number;
  approved_packages: number;
  approved_duration_seconds: number;
  invalid_count: number;
}

interface PackageItem {
  id: number;
  name: string;
  size: number;
  annotation_status: string;
  quality_status?: string;
  corpus_group_name: string;
  collector_name: string;
  created_at?: string;
  claimed_at?: string;
}

const Annotator: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');

  React.useEffect(() => {
    if (!user.id) {
      navigate('/');
    }
  }, [user.id, navigate]);

  const [view, setView] = useState<'hall' | 'pending' | 'progress'>('hall');
  const [stats, setStats] = useState<AnnotatorStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<PackageItem[]>([]);
  const [myPackages, setMyPackages] = useState<PackageItem[]>([]);

  // 计算被打回的包
  const rejectedPackages = myPackages.filter(p => p.quality_status === '已打回');
  const pendingPackages = myPackages.filter(p => p.annotation_status === '待标注');

  // Determine initial view based on rejected packages
  React.useEffect(() => {
    const initialView = rejectedPackages.length > 0 ? 'pending' : 'hall';
    setView(initialView);
  }, [rejectedPackages.length]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [workingPackage, setWorkingPackage] = useState<PackageItem | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAvailablePackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/annotator/available-packages?user_id=${user.id}`));
      const json = await res.json();
      if (json.code === 200) setAvailablePackages(json.data || []);
    } catch { /* ignore */ }
    finally { setPackagesLoading(false); }
  };

  const fetchMyPackages = async () => {
    setPackagesLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/annotator/my-packages?user_id=${user.id}`));
      const json = await res.json();
      if (json.code === 200) setMyPackages(json.data || []);
    } catch { /* ignore */ }
    finally { setPackagesLoading(false); }
  };

  React.useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await apiFetch(getApiUrl(`/annotator/statistics?user_id=${user.id}`));
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

  // 如果启用了占位符模式，显示占位符界面
  if (user.role_feature_flag === 1) {
    return <AnnotatorPlaceholder />;
  }

  const claimPackage = async (packageId: number) => {
    try {
      const res = await apiFetch(getApiUrl(`/annotator/packages/${packageId}/claim`), {
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
      <AnnotationWork
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
    { viewKey: 'pending' as const, label: '待标注任务' },
    { viewKey: 'progress' as const, label: '个人进度' },
  ];

  const filterPackages = (packages: PackageItem[], dateField: 'created_at' | 'claimed_at' = 'created_at') => {
    let filtered = packages;
    if (dateFrom) {
      filtered = filtered.filter(pkg => (pkg[dateField] || '') >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(pkg => (pkg[dateField] || '') <= dateTo + ' 23:59');
    }
    if (searchText) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.name.toLowerCase().includes(search) ||
        (pkg.collector_name || '').toLowerCase().includes(search)
      );
    }
    return filtered;
  };

  const renderContent = () => {
    return (
      <div className="w-full flex flex-col items-center p-8">
        {/* 被打回警告横幅 */}
        {rejectedPackages.length > 0 && (
          <div className="w-full max-w-4xl mb-6 px-6 py-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
            <p className="text-red-900 font-bold text-lg">⚠️ 您有 {rejectedPackages.length} 个包被打回，请重新标注</p>
            <p className="text-red-700 text-sm mt-1">点击下方的"重新标注"按钮开始处理</p>
          </div>
        )}

        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-bold text-slate-800 mb-6">
            {view === 'hall' ? '任务大厅' : view === 'pending' ? '待标注任务' : '个人进度'}
          </h1>

          {view === 'progress' ? (
            // 个人进度视图
            <>
              {statsLoading ? (
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm text-center text-slate-500">加载统计中...</div>
              ) : stats ? (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    { label: '结算包数', count: String(stats.packages), color: 'green' },
                    { label: '结算标注数', count: String(stats.corpus_count), color: 'blue' },
                    { label: '剔除录音数', count: String(stats.invalid_count ?? 0), color: 'red' },
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
                    <p className="text-sm text-green-600 mb-2">质检通过包数</p>
                    <p className="text-3xl font-bold text-green-700">{stats.approved_packages}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-6 border border-green-200 shadow-sm">
                    <p className="text-sm text-green-600 mb-2">质检通过时长</p>
                    <p className="text-3xl font-bold text-green-700">{(() => { const t = stats.approved_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })()}</p>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg p-8 border border-slate-200 shadow-sm text-center text-slate-500">
                <p>统计完成情况已在上方卡片中展示</p>
              </div>
            </>
          ) : (
            // 任务大厅和待标注任务视图
            <>
              {/* 统计卡 */}
              {statsLoading ? (
                <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm text-center text-slate-500 mb-6">加载统计中...</div>
              ) : stats ? (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    { label: '待标注包数', count: String(stats.packages) },
                    { label: '结算标注数', count: String(stats.corpus_count) },
                    { label: '剔除录音数', count: String(stats.invalid_count ?? 0) },
                    { label: '工作时长', count: (() => { const t = stats.total_duration_seconds; const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const s = Math.floor(t % 60); return `${h}h ${m}m ${s}s`; })() },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
                      <p className="text-sm text-slate-600 mb-2">{stat.label}</p>
                      <p className="text-3xl font-bold text-slate-800">{stat.count}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* 筛选区域 */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-300"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-slate-500 mb-1">搜索采集员</label>
                    <input
                      type="text"
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      placeholder="输入采集员名称..."
                      className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-300"
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
                    const filtered = filterPackages(availablePackages, 'created_at');
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
                                {pkg.collector_name && ` • 采集员: ${pkg.collector_name}`}
                              </p>
                            </div>
                            <button
                              onClick={() => claimPackage(pkg.id)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-colors active:scale-95"
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
                    const filtered = filterPackages(pendingPackages, 'claimed_at');
                    return filtered.length === 0 ? (
                      <div className="p-8 text-center text-slate-400">
                        {pendingPackages.length === 0 ? '暂无待标注任务' : '无符合条件的任务'}
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {filtered.map((pkg) => (
                          <div key={pkg.id} className={`p-4 flex items-center justify-between transition-colors ${pkg.quality_status === '已打回' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-slate-50'}`}>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-800">{pkg.name}</p>
                                {pkg.quality_status === '已打回' && (
                                  <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">已打回</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-500">
                                {pkg.corpus_group_name} • {pkg.size} 条语料
                                {pkg.collector_name && ` • 采集员: ${pkg.collector_name}`}
                              </p>
                              {pkg.quality_status === '已打回' && (
                                <p className="text-sm text-red-700 font-medium mt-1">质检员认为需要调整，请重新检查</p>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                const pkg_obj = { ...pkg, id: pkg.id } as PackageItem;
                                setWorkingPackage(pkg_obj);
                              }}
                              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors active:scale-95 shrink-0 ${pkg.quality_status === '已打回'
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                            >
                              {pkg.quality_status === '已打回' ? '重新标注' : '开始标注'}
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
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <Tag className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-800 text-sm">语音标注系统</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">标注员</span>
          <span className="text-sm text-slate-600">{user.username ?? 'annotator'}</span>
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
                  ? 'bg-green-50 text-green-700 border-green-600 font-semibold'
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

export default Annotator;
