import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User, Mic, Loader2, Key } from "lucide-react";
import { getApiUrl, apiFetch } from "../config/api";

const ROLE_ROUTES: Record<string, string> = {
  manager: "/manager",
  sub_manager: "/sub-manager",
  collector: "/collector",
  annotator: "/annotator",
  reviewer: "/reviewer",
  inspector: "/inspector",
  quality_reviewer: "/quality-reviewer",
  superadmin: "/super-admin",
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isSuperAdmin = account.trim() === "potatoadmin";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!account || !password) { setError("请输入账号和密码"); return; }
    if (!isSuperAdmin && !licenseKey.trim()) { setError("请输入企业卡密"); return; }
    setIsLoading(true);
    try {
      const body: Record<string, string> = { username: account, password };
      if (!isSuperAdmin) body.license_key = licenseKey.trim();
      const res = await apiFetch(getApiUrl("/login"), { method: "POST", body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { setError(json.detail ?? "账号或密码错误"); return; }
      sessionStorage.setItem("token", json.data.token);
      sessionStorage.setItem("user", JSON.stringify(json.data));
      navigate(ROLE_ROUTES[json.data.role] ?? "/");
    } catch { setError("网络异常，请检查后端服务是否启动"); }
    finally { setIsLoading(false); }
  };

  return (
    <div className="w-full min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="p-8">
          <div className="flex flex-col items-center mb-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 mb-4">
              <Mic className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">语音语料采集工作台</h1>
            <p className="text-slate-500 mt-2">欢迎回来，请登录您的账号</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">账号</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input type="text" value={account} onChange={(e) => setAccount(e.target.value)}
                  className="block w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-lg"
                  placeholder="请输入账号" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">密码</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-12 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-lg"
                  placeholder="请输入密码" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {!isSuperAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 ml-1">企业卡密</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)}
                    className="block w-full pl-11 pr-4 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all text-lg tracking-widest"
                    placeholder="XXXX-XXXX-XXXX-XXXX" />
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-1">请联系您的企业管理员获取卡密</p>
              </div>
            )}
            {error && (<div className="bg-red-50 text-red-500 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>)}
            <button type="submit" disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 hover:shadow-blue-300 active:scale-[0.98] transition-all flex items-center justify-center text-lg">
              {isLoading ? (<><Loader2 className="animate-spin mr-2 h-5 w-5" />登录中...</>) : "立即登录"}
            </button>
          </form>
          <div className="mt-8 text-center">
            <p className="text-slate-400 text-xs mb-3">登录即表示您同意</p>
            <div className="flex items-center justify-center gap-1 flex-wrap">
              <button onClick={() => window.open("/terms/user-agreement", "_blank")} className="text-blue-600 hover:text-blue-700 text-xs underline">用户协议</button>
              <span className="text-slate-300 text-xs">和</span>
              <button onClick={() => window.open("/terms/privacy-policy", "_blank")} className="text-blue-600 hover:text-blue-700 text-xs underline">隐私政策</button>
            </div>
            <p className="text-slate-400 text-xs mt-4">2026 语音语料采集系统</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
