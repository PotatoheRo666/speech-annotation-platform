import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, LogOut, ChevronLeft } from 'lucide-react';

const Record: React.FC = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/');
  };

  return (
    <div className="w-full min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl flex flex-col min-h-[600px] overflow-hidden">
        <div className="p-6 flex flex-col h-full flex-1">
          {/* Header */}
          <header className="flex items-center justify-between py-6 mb-8">
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white rounded-full transition-colors text-slate-600"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">采集工作台</h1>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 rounded-full transition-colors text-red-500"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </header>

          {/* Content Placeholder */}
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm p-8 border border-slate-100">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
              <Mic className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">准备就绪</h2>
            <p className="text-slate-500 text-center">
              您已成功登录。这里是语音语料采集页面，功能正在开发中...
            </p>

            <button className="mt-10 w-full bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all">
              开始录音
            </button>
          </div>

          <footer className="mt-auto py-8 text-center text-slate-400 text-sm">
            当前账号: admin
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Record;
