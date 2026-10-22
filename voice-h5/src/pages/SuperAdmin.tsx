import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getApiUrl, apiFetch } from "../config/api";
import {
  Key, Plus, Trash2, Power, PowerOff, Copy, Check,
  LogOut, RefreshCw, Calendar, Building2, Shield, AlertTriangle
} from "lucide-react";

interface LicenseKey {
  id: number;
  key_code: string;
  company_name: string;
  expire_at: string | null;
  is_active: boolean;
  is_expired: boolean;
  note: string | null;
  created_at: string;
}

const SuperAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [form, setForm] = useState({ company_name: "", expire_at: "", note: "" });
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ company_name: "", expire_at: "", note: "" });

  const token = sessionStorage.getItem("token");

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(getApiUrl("/license-keys"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setKeys(json.data);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem("user") || "{}");
    if (user.role !== "superadmin") { navigate("/"); return; }
    fetchKeys();
  }, [fetchKeys, navigate]);

  const handleCopy = (key: LicenseKey) => {
    navigator.clipboard.writeText(key.key_code);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, string> = { company_name: form.company_name };
      if (form.expire_at) body.expire_at = new Date(form.expire_at).toISOString();
      if (form.note) body.note = form.note;
      const res = await apiFetch(getApiUrl("/license-keys"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setForm({ company_name: "", expire_at: "", note: "" });
        setShowCreate(false);
        fetchKeys();
      }
    } finally { setCreating(false); }
  };

  const handleToggle = async (key: LicenseKey) => {
    await apiFetch(getApiUrl(`/license-keys/${key.id}`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !key.is_active }),
    });
    fetchKeys();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确认删除该卡密？删除后无法恢复，使用该卡密的企业将无法登录。")) return;
    await apiFetch(getApiUrl(`/license-keys/${id}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchKeys();
  };

  const handleEdit = (key: LicenseKey) => {
    setEditId(key.id);
    setEditForm({
      company_name: key.company_name,
      expire_at: key.expire_at ? key.expire_at.slice(0, 10) : "",
      note: key.note || "",
    });
  };

  const handleEditSave = async () => {
    if (editId == null) return;
    const body: Record<string, string | null> = { company_name: editForm.company_name };
    body.expire_at = editForm.expire_at ? new Date(editForm.expire_at).toISOString() : "never";
    body.note = editForm.note || null;
    await apiFetch(getApiUrl(`/license-keys/${editId}`), {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setEditId(null);
    fetchKeys();
  };

  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/");
  };

  const stats = {
    total: keys.length,
    active: keys.filter(k => k.is_active && !k.is_expired).length,
    expired: keys.filter(k => k.is_expired).length,
    disabled: keys.filter(k => !k.is_active).length,
  };

  const getStatusBadge = (key: LicenseKey) => {
    if (key.is_expired) return <span style={{background:"rgba(239,68,68,0.15)",color:"#ef4444",padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>已过期</span>;
    if (!key.is_active) return <span style={{background:"rgba(100,116,139,0.15)",color:"#94a3b8",padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>已禁用</span>;
    return <span style={{background:"rgba(34,197,94,0.15)",color:"#22c55e",padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>有效</span>;
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#e2e8f0",fontFamily:"'Inter','PingFang SC',system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.08)",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Shield size={18} color="white" />
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:16,color:"#f1f5f9"}}>超级管理员控制台</div>
            <div style={{fontSize:12,color:"#64748b"}}>卡密管理系统</div>
          </div>
        </div>
        <div style={{display:"flex",gap:12}}>
          <button onClick={fetchKeys} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",padding:"8px 16px",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14}}>
            <RefreshCw size={14} />刷新
          </button>
          <button onClick={handleLogout} style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444",padding:"8px 16px",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:14}}>
            <LogOut size={14} />退出登录
          </button>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:32}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:32}}>
          {[
            {label:"全部卡密",value:stats.total,color:"#6366f1",icon:<Key size={20}/>},
            {label:"有效卡密",value:stats.active,color:"#22c55e",icon:<Power size={20}/>},
            {label:"已过期",value:stats.expired,color:"#ef4444",icon:<AlertTriangle size={20}/>},
            {label:"已禁用",value:stats.disabled,color:"#94a3b8",icon:<PowerOff size={20}/>},
          ].map((s,i) => (
            <div key={i} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:13,color:"#64748b"}}>{s.label}</span>
                <div style={{color:s.color,opacity:0.8}}>{s.icon}</div>
              </div>
              <div style={{fontSize:32,fontWeight:700,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Main card */}
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:20,overflow:"hidden"}}>
          <div style={{padding:"20px 24px",borderBottom:"1px solid rgba(255,255,255,0.07)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontWeight:600,fontSize:16,color:"#f1f5f9"}}>卡密列表</div>
            <button onClick={() => setShowCreate(true)}
              style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"white",border:"none",padding:"10px 20px",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontWeight:600,fontSize:14}}>
              <Plus size={16} />创建卡密
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{textAlign:"center",padding:60,color:"#64748b"}}>加载中...</div>
          ) : keys.length === 0 ? (
            <div style={{textAlign:"center",padding:60,color:"#64748b"}}>
              <Key size={40} style={{margin:"0 auto 12px",opacity:0.3,display:"block"}} />暂无卡密，点击上方按钮创建
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"rgba(255,255,255,0.02)"}}>
                    {["企业名称","卡密码","状态","到期时间","备注","操作"].map(h => (
                      <th key={h} style={{padding:"12px 20px",textAlign:"left",fontSize:12,color:"#64748b",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map(key => (
                    <tr key={key.id} style={{borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                      <td style={{padding:"16px 20px"}}>
                        {editId === key.id ? (
                          <input value={editForm.company_name} onChange={e => setEditForm(f=>({...f,company_name:e.target.value}))}
                            style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"6px 10px",color:"#f1f5f9",width:140,fontSize:13}} />
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <Building2 size={14} color="#64748b" />
                            <span style={{fontWeight:500,color:"#f1f5f9"}}>{key.company_name}</span>
                          </div>
                        )}
                      </td>
                      <td style={{padding:"16px 20px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <code style={{background:"rgba(99,102,241,0.1)",color:"#a5b4fc",padding:"4px 10px",borderRadius:8,fontSize:13,letterSpacing:"0.1em",fontFamily:"monospace"}}>{key.key_code}</code>
                          <button onClick={() => handleCopy(key)} style={{background:"none",border:"none",cursor:"pointer",color:copiedId===key.id?"#22c55e":"#64748b",padding:4,display:"flex",alignItems:"center"}}>
                            {copiedId===key.id ? <Check size={14}/> : <Copy size={14}/>}
                          </button>
                        </div>
                      </td>
                      <td style={{padding:"16px 20px"}}>{getStatusBadge(key)}</td>
                      <td style={{padding:"16px 20px"}}>
                        {editId === key.id ? (
                          <input type="date" value={editForm.expire_at} onChange={e => setEditForm(f=>({...f,expire_at:e.target.value}))}
                            style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"6px 10px",color:"#f1f5f9",fontSize:13}} />
                        ) : (
                          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:key.is_expired?"#ef4444":"#94a3b8"}}>
                            <Calendar size={13}/>
                            {key.expire_at ? new Date(key.expire_at).toLocaleDateString("zh-CN") : "永久有效"}
                          </div>
                        )}
                      </td>
                      <td style={{padding:"16px 20px"}}>
                        {editId === key.id ? (
                          <input value={editForm.note} onChange={e => setEditForm(f=>({...f,note:e.target.value}))}
                            style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"6px 10px",color:"#f1f5f9",width:120,fontSize:13}} />
                        ) : (
                          <span style={{fontSize:13,color:"#64748b"}}>{key.note || "-"}</span>
                        )}
                      </td>
                      <td style={{padding:"16px 20px"}}>
                        <div style={{display:"flex",gap:8}}>
                          {editId === key.id ? (
                            <>
                              <button onClick={handleEditSave} style={{background:"rgba(34,197,94,0.15)",border:"none",color:"#22c55e",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}>保存</button>
                              <button onClick={() => setEditId(null)} style={{background:"rgba(100,116,139,0.15)",border:"none",color:"#94a3b8",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}>取消</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => handleEdit(key)} style={{background:"rgba(99,102,241,0.12)",border:"none",color:"#a5b4fc",padding:"6px 12px",borderRadius:8,cursor:"pointer",fontSize:13}}>编辑</button>
                              <button onClick={() => handleToggle(key)} title={key.is_active?"禁用":"启用"}
                                style={{background:key.is_active?"rgba(251,191,36,0.12)":"rgba(34,197,94,0.12)",border:"none",color:key.is_active?"#fbbf24":"#22c55e",padding:6,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center"}}>
                                {key.is_active ? <PowerOff size={15}/> : <Power size={15}/>}
                              </button>
                              <button onClick={() => handleDelete(key.id)}
                                style={{background:"rgba(239,68,68,0.12)",border:"none",color:"#ef4444",padding:6,borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center"}}>
                                <Trash2 size={15}/>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{background:"#1e293b",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:32,width:420,maxWidth:"90vw"}}>
            <h2 style={{margin:"0 0 24px",fontWeight:700,fontSize:18,color:"#f1f5f9"}}>创建新卡密</h2>
            <form onSubmit={handleCreate} style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <label style={{display:"block",fontSize:13,color:"#94a3b8",marginBottom:6}}>企业名称 *</label>
                <input required value={form.company_name} onChange={e => setForm(f=>({...f,company_name:e.target.value}))}
                  placeholder="输入企业名称"
                  style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 14px",color:"#f1f5f9",fontSize:14,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{display:"block",fontSize:13,color:"#94a3b8",marginBottom:6}}>到期日期（留空=永久有效）</label>
                <input type="date" value={form.expire_at} onChange={e => setForm(f=>({...f,expire_at:e.target.value}))}
                  style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 14px",color:"#f1f5f9",fontSize:14,boxSizing:"border-box"}} />
              </div>
              <div>
                <label style={{display:"block",fontSize:13,color:"#94a3b8",marginBottom:6}}>备注（选填）</label>
                <input value={form.note} onChange={e => setForm(f=>({...f,note:e.target.value}))}
                  placeholder="备注信息"
                  style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,padding:"10px 14px",color:"#f1f5f9",fontSize:14,boxSizing:"border-box"}} />
              </div>
              <div style={{display:"flex",gap:12,marginTop:8}}>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{flex:1,background:"rgba(100,116,139,0.15)",border:"1px solid rgba(255,255,255,0.1)",color:"#94a3b8",padding:"12px",borderRadius:10,cursor:"pointer",fontSize:14}}>
                  取消
                </button>
                <button type="submit" disabled={creating}
                  style={{flex:2,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",border:"none",color:"white",padding:"12px",borderRadius:10,cursor:"pointer",fontWeight:600,fontSize:14}}>
                  {creating ? "创建中..." : "创建卡密"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
