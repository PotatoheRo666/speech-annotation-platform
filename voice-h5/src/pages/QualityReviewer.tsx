import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, LogOut, BarChart2 } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import QualityReviewWork from './QualityReviewWork';

interface CorpusGroup {
  id: number;
  name: string;
}

type Tab = 'hall' | 'progress';

const QualityReviewer: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');

  React.useEffect(() => {
    if (!user.id) {
      navigate('/');
    } else {
      window.history.pushState({ page: 'quality-reviewer' }, '', window.location.href);
    }
  }, [user.id, navigate]);

  const [tab, setTab] = useState<Tab>('hall');
  const [corpusGroups, setCorpusGroups] = useState<CorpusGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CorpusGroup | null>(null);

  const fetchCorpusGroups = async () => {
    setGroupsLoading(true);
    try {
      const res = await apiFetch(getApiUrl(`/quality-reviewer/corpus-groups?user_id=${user.id}`));
      const json = await res.json();
      if (json.code === 200) {
        setCorpusGroups(json.data || []);
      }
    } catch {
      /* ignore */
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
      <QualityReviewWork
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
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">质检审核系统</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-teal-100 text-teal-700">
            质检审核员
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
                  ? 'bg-teal-50 text-teal-700 border-teal-600'
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
                    <div className="animate-spin h-8 w-8 border-4 border-teal-200 border-t-teal-600 rounded-full" />
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
                        className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-md hover:border-teal-300 transition-all text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-800">{group.name}</h3>
                            <p className="text-sm text-slate-400 mt-1">语料组 ID: {group.id}</p>
                          </div>
                          <div className="text-teal-600">
                            <ShieldCheck className="w-6 h-6" />
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
                <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                  <p className="text-slate-400">统计功能开发中...</p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default QualityReviewer;
