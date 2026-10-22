import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, LogOut, BarChart2 } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import ReviewWork from './ReviewWork';

interface ReviewerStats {
  total_packages: number;
  passed_packages: number;
  rejected_packages: number;
}

interface CorpusGroup {
  id: number;
  name: string;
}

type Tab = 'hall' | 'progress';

const Reviewer: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');

  React.useEffect(() => {
    if (!user.id) {
      navigate('/');
    } else {
      window.history.pushState({ page: 'reviewer' }, '', window.location.href);
    }
  }, [user.id, navigate]);

  const [tab, setTab] = useState<Tab>('hall');
  const [stats, setStats] = useState<ReviewerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [corpusGroups, setCorpusGroups] = useState<CorpusGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CorpusGroup | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        // 统计信息可选实现，这里不使用
        setStats({
          total_packages: 0,
          passed_packages: 0,
          rejected_packages: 0,
        });
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [user.id]);

  const fetchCorpusGroups = async () => {
    setGroupsLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/reviewer/corpus-groups?user_id=${user.id}`));
      const json = await res.json();
      console.log('[Reviewer] corpus-groups response:', json);
      if (json.code === 200) {
        setCorpusGroups(json.data || []);
      } else {
        console.error('[Reviewer] Failed to fetch corpus groups:', json.detail || 'Unknown error');
      }
    } catch (error) {
      console.error('[Reviewer] Error fetching corpus groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'hall') {
      fetchCorpusGroups();
    }
  }, [tab]);

  const handleLogout = () => {
    sessionStorage.clear();
    navigate('/');
  };

  if (selectedGroup) {
    return (
      <ReviewWork
        corpusGroupId={selectedGroup.id}
        corpusGroupName={selectedGroup.name}
        userId={user.id}
        onBack={() => setSelectedGroup(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">采集审核系统</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
            采集审核员
          </span>
          <span className="text-sm text-slate-600">{user.username}</span>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 bg-white border-r border-slate-200 flex flex-col">
          {[
            { key: 'hall' as Tab, icon: ShieldCheck, label: '审核大厅' },
            { key: 'progress' as Tab, icon: BarChart2, label: '审核进度' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all border-r-2 ${tab === item.key
                  ? 'bg-orange-50 text-orange-700 border-orange-600'
                  : 'text-slate-600 border-transparent hover:bg-slate-50'
                }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {tab === 'hall' && (
            <div className="w-full flex flex-col items-center p-8">
              <div className="w-full max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">审核大厅</h2>

                {groupsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-orange-200 border-t-orange-600 rounded-full" />
                  </div>
                ) : corpusGroups.length === 0 ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                    <p className="text-slate-400">暂无可审核的语料组</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {corpusGroups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => setSelectedGroup(group)}
                        className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md hover:border-orange-300 transition-all text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">{group.name}</h3>
                            {(group as any).pending_review_count > 0 ? (
                              <p className="text-sm text-orange-500 mt-1">{(group as any).pending_review_count} 个包待审核</p>
                            ) : (
                              <p className="text-sm text-slate-400 mt-1">暂无待审核</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {(group as any).pending_review_count > 0 && (
                              <span className="px-2.5 py-1 bg-orange-100 text-orange-600 text-sm font-bold rounded-full">
                                {(group as any).pending_review_count}
                              </span>
                            )}
                            <ShieldCheck className="w-6 h-6 text-orange-600" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'progress' && (
            <div className="w-full flex flex-col items-center p-8">
              <div className="w-full max-w-4xl">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">审核进度</h2>

                {statsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin h-8 w-8 border-4 border-orange-200 border-t-orange-600 rounded-full" />
                  </div>
                ) : stats ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <p className="text-slate-500 text-sm font-medium mb-2">总审核包数</p>
                      <p className="text-3xl font-bold text-slate-800">{stats.total_packages}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <p className="text-slate-500 text-sm font-medium mb-2">已合格</p>
                      <p className="text-3xl font-bold text-green-600">{stats.passed_packages}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <p className="text-slate-500 text-sm font-medium mb-2">已打回</p>
                      <p className="text-3xl font-bold text-red-600">{stats.rejected_packages}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Reviewer;
