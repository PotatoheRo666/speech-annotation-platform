import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileText, CheckCircle, Loader2, LogOut, ShieldCheck, Calendar, BarChart2 } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import { DailyWorkView, StatsDetailPage, DialectStatsView } from './Manager';

interface UserStat {
  id: number;
  username: string;
  packages: number;
  corpus_count: number;
  total_duration_seconds: number;
  approved_duration_seconds: number;
  group_names: string[];
  invalid_count: number;
  valid_count: number;
}

interface Stats {
  collectors: UserStat[];
  annotators: UserStat[];
  inspectors: UserStat[];
}

type MainView = 'dashboard' | 'daily-work' | 'collector-stats' | 'annotator-stats' | 'inspector-stats' | 'dialect-stats';

interface StatCardProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  stats: UserStat[];
  labels: string[];
  values: number[];
  onClick: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ title, icon, color, labels, values, onClick }) => {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    green: 'bg-green-50 border-green-200 hover:bg-green-100',
    amber: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
  };

  return (
    <div
      className={`p-6 rounded-xl border cursor-pointer transition-colors ${colorClasses[color] || colorClasses.blue}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
        {icon}
      </div>
      <div className="space-y-2">
        {labels.map((label, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-700">{values[i].toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const SubManager: React.FC = () => {
  const navigate = useNavigate();
  const stored = sessionStorage.getItem('user');
  const user = stored ? JSON.parse(stored) : {};
  const [view, setView] = useState<MainView>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'collector' | 'annotator' | 'inspector' | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await apiFetch(getApiUrl(`/admin/statistics?user_id=${user.id}`));
        const json = await res.json();
        if (json.code === 200) setStats(json.data);
      } catch { /* ignore */ }
      finally { setStatsLoading(false); }
    };
    fetchStats();
  }, [user.id]);

  const handleLogout = () => { sessionStorage.removeItem('user'); navigate('/'); };

  const navItems = [
    { view: 'dashboard' as MainView, icon: BarChart2, label: '仪表盘' },
    { view: 'daily-work' as MainView, icon: Calendar, label: '每日作业监控' },
    { view: 'dialect-stats' as MainView, icon: BarChart2, label: '方言统计' },
  ];

  const renderContent = () => {
    if (view === 'daily-work') return <DailyWorkView onBack={() => setView('dashboard')} userId={user.id} />;
    if (view === 'dialect-stats') return <DialectStatsView onBack={() => setView('dashboard')} userId={user.id} />;
    if (selectedRole && stats) {
      const roleData = selectedRole === 'collector' ? stats.collectors
        : selectedRole === 'annotator' ? stats.annotators
          : stats.inspectors;
      return (
        <StatsDetailPage
          role={selectedRole}
          data={roleData}
          onBack={() => setSelectedRole(null)}
          userId={user.id}
        />
      );
    }
    return (
      <div className="w-full flex flex-col items-center px-8 py-6">
        <div className="w-full max-w-6xl">
          <h1 className="text-3xl font-bold text-slate-800 mb-6">数据概览</h1>

          {statsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-teal-400" /></div>
          ) : stats ? (
            <div className="grid grid-cols-3 gap-6 mb-8">
              <StatCard
                title="采集员" icon={<Users className="w-6 h-6 text-blue-600" />}
                color="blue" stats={stats.collectors}
                labels={['总人数', '总包数', '总录音条数']}
                values={[stats.collectors.length, stats.collectors.reduce((s, c) => s + c.packages, 0), stats.collectors.reduce((s, c) => s + c.corpus_count, 0)]}
                onClick={() => setSelectedRole('collector')}
              />
              <StatCard
                title="标注员" icon={<FileText className="w-6 h-6 text-green-600" />}
                color="green" stats={stats.annotators}
                labels={['总人数', '已标注包数', '已标注条数']}
                values={[stats.annotators.length, stats.annotators.reduce((s, a) => s + a.packages, 0), stats.annotators.reduce((s, a) => s + a.corpus_count, 0)]}
                onClick={() => setSelectedRole('annotator')}
              />
              <StatCard
                title="质检员" icon={<CheckCircle className="w-6 h-6 text-amber-600" />}
                color="amber" stats={stats.inspectors}
                labels={['总人数', '已质检包数', '已质检条数']}
                values={[stats.inspectors.length, stats.inspectors.reduce((s, i) => s + i.packages, 0), stats.inspectors.reduce((s, i) => s + i.corpus_count, 0)]}
                onClick={() => setSelectedRole('inspector')}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-800 text-sm">语音采集管理系统</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 rounded-full font-medium">二级管理员</span>
          <span className="text-sm text-slate-600">{user.username ?? ''}</span>
          <button onClick={handleLogout} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-56 bg-white border-r border-slate-200 flex flex-col py-3 shrink-0 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.view;
            return (
              <button key={item.view} onClick={() => { setView(item.view); setSelectedRole(null); }}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-r-2 ${isActive
                    ? 'bg-teal-50 text-teal-700 border-teal-600 font-semibold'
                    : 'text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-700'
                  }`}>
                <Icon className="w-5 h-5" />
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

export default SubManager;
