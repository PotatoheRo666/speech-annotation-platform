import React, { useState, useEffect, useCallback, useRef } from 'react';

import { useNavigate } from 'react-router-dom';

import {

  ShieldCheck, LogOut, Users, BarChart2, ChevronLeft,

  Plus, Trash2, Loader2, CheckCircle, Upload, FileText,

  Package, FolderOpen, X, UserPlus, Layers, Download, Eye,

  ChevronDown, Search, Download as DownloadIcon, ClipboardCheck,

  Calendar, ListTodo, RefreshCw, FileSignature, XCircle,

} from 'lucide-react';

import { getApiUrl, apiFetch } from '../config/api';

import PackageReview from './PackageReview';

import Pagination from '../components/Pagination';



const ROLES = [

  { value: 'manager', label: '管理员' },

  { value: 'collector', label: '采集员' },

  { value: 'annotator', label: '标注员' },

  { value: 'inspector', label: '质检员' },

  { value: 'reviewer', label: '采集审核员' },

  { value: 'quality_reviewer', label: '质检审核员' },

  { value: 'sub_manager', label: '二级管理员' },

] as const;



type RoleValue = typeof ROLES[number]['value'];

type MainView = 'dashboard' | 'users' | 'corpus-groups' | 'collector-groups' | 'submissions' | 'corpus-groups-review' | 'collector-packages' | 'collector-stats' | 'annotator-stats' | 'inspector-stats' | 'system-settings' | 'personal-info-review' | 'daily-work' | 'job-query' | 'reviewer-management' | 'export-management' | 'quality-approved' | 'dialect-stats' | 'signature-list' | 'invalid-recordings' | 'rejected-packages';



interface UserItem { id: number; username: string; role: RoleValue }

interface CollectorGroupItem { id: number; name: string; role_type: string; member_count: number; members: UserItem[] }

interface CorpusGroupItem {

  id: number; name: string;

  folder_id: number | null;

  corpus_count: number; packaged_count: number; package_count: number;

  assigned_groups: { id: number; name: string }[];

  annotator_groups: { id: number; name: string }[];

  inspector_groups: { id: number; name: string }[];

  reviewer_groups: { id: number; name: string }[];

  quality_reviewer_groups: { id: number; name: string }[];

  pinyin_region?: string;

}

interface FolderItem {

  id: number; name: string;

  level: number;  // 1=方言, 2=地区

  parent_id: number | null;

  group_count: number;

}

interface CorpusItem { id: number; text_id: string; content: string; packaged: boolean }

interface PackageItem { id: number; name: string; size: number; status: string; annotation_status: string; quality_status: string; quality_review_status: string; claimed_by_name: string | null; created_at: string }



const ROLE_BADGE: Record<string, string> = {

  manager: 'bg-violet-100 text-violet-700',

  sub_manager: 'bg-teal-100   text-teal-700',

  collector: 'bg-blue-100   text-blue-700',

  annotator: 'bg-green-100  text-green-700',

  inspector: 'bg-amber-100  text-amber-700',

  reviewer: 'bg-orange-100 text-orange-700',

  quality_reviewer: 'bg-teal-100   text-teal-700',

};



const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label ?? r;



// ── 系统设置 ──────────────────────────────────────────────────────

const SystemSettingsView: React.FC<{ onBack: () => void; userId: number }> = ({ onBack, userId }) => {

  const [serviceTerms, setServiceTerms] = useState('');

  const [privacyPolicy, setPrivacyPolicy] = useState('');

  const [userAgreement, setUserAgreement] = useState('');

  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState('');



  useEffect(() => {

    const fetchSettings = async () => {

      setLoading(true);

      try {

        const res = await apiFetch(getApiUrl('/login-terms'));

        const data = await res.json();

        if (res.ok && data.data) {

          setServiceTerms(data.data.service_terms || '');

          setPrivacyPolicy(data.data.privacy_policy || '');

          setUserAgreement(data.data.user_agreement || '');

        }

      } catch {

        setMsg('获取设置失败');

      } finally {

        setLoading(false);

      }

    };

    fetchSettings();

  }, []);



  const handleSave = async () => {

    setSaving(true);

    setMsg('');

    try {

      const res = await apiFetch(getApiUrl('/system-settings'), {

        method: 'POST',

        body: JSON.stringify({

          user_id: userId,

          service_terms: serviceTerms,

          privacy_policy: privacyPolicy,

          user_agreement: userAgreement,

        }),

      });

      const data = await res.json();

      setMsg(res.ok ? '保存成功' : (data.detail || '保存失败'));

    } catch {

      setMsg('保存失败');

    } finally {

      setSaving(false);

    }

  };



  return (

    <div className="w-full flex flex-col items-center px-8 py-6">

      <div className="w-full max-w-3xl">

        <SubHeader title="系统设置" onBack={onBack} />



        {msg && (

          <div className={`mb-4 px-4 py-3 rounded-lg text-sm text-center font-medium ${msg === '保存成功' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'

            }`}>

            {msg}

          </div>

        )}



        {loading ? (

          <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>

        ) : (

          <div className="space-y-6">

            {/* 用户协议 */}

            <div className="bg-white rounded-lg border border-slate-200 p-6">

              <label className="block text-sm font-bold text-slate-800 mb-2">用户协议</label>

              <p className="text-xs text-slate-500 mb-2">支持 Markdown 格式</p>

              <textarea

                value={serviceTerms}

                onChange={(e) => setServiceTerms(e.target.value)}

                placeholder="输入用户协议内容（支持 Markdown）..."

                className="w-full px-4 py-3 bg-slate-50 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-slate-200 min-h-64 font-mono text-sm"

              />

              <p className="text-xs text-slate-400 mt-2">{serviceTerms.length} 字符</p>

            </div>



            {/* 隐私政策 */}

            <div className="bg-white rounded-lg border border-slate-200 p-6">

              <label className="block text-sm font-bold text-slate-800 mb-2">隐私政策</label>

              <p className="text-xs text-slate-500 mb-2">支持 Markdown 格式</p>

              <textarea

                value={privacyPolicy}

                onChange={(e) => setPrivacyPolicy(e.target.value)}

                placeholder="输入隐私政策内容（支持 Markdown）..."

                className="w-full px-4 py-3 bg-slate-50 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-slate-200 min-h-64 font-mono text-sm"

              />

              <p className="text-xs text-slate-400 mt-2">{privacyPolicy.length} 字符</p>

            </div>



            {/* 用户协议 */}

            <div className="bg-white rounded-lg border border-slate-200 p-6">

              <label className="block text-sm font-bold text-slate-800 mb-2">用户协议</label>

              <p className="text-xs text-slate-500 mb-2">支持 Markdown 格式</p>

              <textarea

                value={userAgreement}

                onChange={(e) => setUserAgreement(e.target.value)}

                placeholder="输入用户协议内容（支持 Markdown）..."

                className="w-full px-4 py-3 bg-slate-50 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-slate-200 min-h-64 font-mono text-sm"

              />

              <p className="text-xs text-slate-400 mt-2">{userAgreement.length} 字符</p>

            </div>



            {/* 保存按钮 */}

            <button

              onClick={handleSave}

              disabled={saving}

              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg transition-all"

            >

              {saving ? '保存中...' : '保存修改'}

            </button>

          </div>

        )}

      </div>

    </div>

  );

};



// ── 个人信息审查 ──────────────────────────────────────────────

interface CollectorInfo {

  id: number;

  username: string;

  real_name: string;

  gender: string;

  age: number | null;

  hometown: string;

  city: string;

  info_rejected: number;

  has_info: boolean;

  group_names: string[];

  has_submitted: boolean;

  submitted_count: number;

}



const PersonalInfoReviewView: React.FC<{ onBack: () => void }> = ({ onBack }) => {

  const [collectors, setCollectors] = useState<CollectorInfo[]>([]);

  const [loading, setLoading] = useState(false);

  const [selectedMember, setSelectedMember] = useState<CollectorInfo | null>(null);

  const [searchText, setSearchText] = useState('');



  const fetchCollectors = async () => {

    setLoading(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/collectors-info'));

      const json = await res.json();

      if (json.code === 200) setCollectors(json.data || []);

    } catch { /* ignore */ }

    finally { setLoading(false); }

  };



  useEffect(() => { fetchCollectors(); }, []);



  const handleReject = async (member: CollectorInfo) => {

    if (!window.confirm(`确认驳回 ${member.username}（${member.real_name || '未填写'}）的个人信息？\n\n驳回后该用户将无法继续领取任务。`)) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/users/${member.id}/reject-info`), { method: 'POST' });

      const json = await res.json();

      if (res.ok) {

        alert(json.msg);

        fetchCollectors();

        if (selectedMember?.id === member.id) {

          setSelectedMember({ ...selectedMember, info_rejected: 1 });

        }

      } else {

        alert(json.detail || json.msg || `操作失败 (${res.status})`);

      }

    } catch (e: any) { alert(`网络异常: ${e.message || '请重试'}`); }

  };



  const handleApprove = async (member: CollectorInfo) => {

    try {

      const res = await apiFetch(getApiUrl(`/admin/users/${member.id}/approve-info`), { method: 'POST' });

      const json = await res.json();

      if (res.ok) {

        alert(json.msg);

        fetchCollectors();

        if (selectedMember?.id === member.id) {

          setSelectedMember({ ...selectedMember, info_rejected: 0 });

        }

      } else {

        alert(json.detail || json.msg || `操作失败 (${res.status})`);

      }

    } catch (e: any) { alert(`网络异常: ${e.message || '请重试'}`); }

  };



  const filtered = collectors.filter(c => {

    if (!searchText) return true;

    const q = searchText.toLowerCase();

    return c.username.toLowerCase().includes(q) || (c.real_name || '').toLowerCase().includes(q);

  });



  // 成员详情视图

  if (selectedMember) {

    const m = selectedMember;

    return (

      <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

        <div className="w-full max-w-md">

          <SubHeader title={m.username} onBack={() => setSelectedMember(null)} />

          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

            <div className="flex items-center gap-3 mb-4">

              <div className="w-12 h-12 bg-violet-100 rounded-full flex items-center justify-center">

                <span className="text-lg font-bold text-violet-600">{(m.real_name || m.username)[0]}</span>

              </div>

              <div>

                <p className="font-bold text-slate-800">{m.real_name || '未填写姓名'}</p>

                <p className="text-xs text-slate-500">@{m.username}</p>

              </div>

              {m.info_rejected === 1 && (

                <span className="ml-auto px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">已驳回</span>

              )}

            </div>

            <div className="space-y-3">

              {[

                { label: '姓名', value: m.real_name },

                { label: '账号', value: m.username },

                { label: '性别', value: m.gender },

                { label: '年龄', value: m.age != null ? String(m.age) : '' },

                { label: '籍贯', value: m.hometown },

                { label: '城市', value: m.city },

                { label: '所属分组', value: m.group_names.join('、') || '未分组' },

                { label: '提交包数', value: m.has_submitted ? `${m.submitted_count} 个` : '未提交' },

              ].map(item => (

                <div key={item.label} className="flex justify-between py-2 border-b border-slate-100 last:border-0">

                  <span className="text-sm text-slate-500">{item.label}</span>

                  <span className={`text-sm font-medium ${item.value ? 'text-slate-800' : 'text-red-400'}`}>

                    {item.value || '未填写'}

                  </span>

                </div>

              ))}

            </div>

          </div>

          <div className="flex gap-3">

            {m.info_rejected === 1 ? (

              <button onClick={() => handleApprove(m)}

                className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-bold transition-all">

                通过

              </button>

            ) : (

              <button onClick={() => handleReject(m)}

                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-bold transition-all">

                驳回

              </button>

            )}

          </div>

        </div>

      </div>

    );

  }



  // 主列表视图

  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">个人信息审查</h1>



        {/* 统计栏 */}

        <div className="flex flex-wrap gap-4 mb-6">

          <div className="bg-slate-50 rounded-xl px-5 py-3">

            <p className="text-xs text-slate-500">总采集员</p>

            <p className="text-2xl font-bold text-slate-800">{collectors.length}</p>

          </div>

          <div className="bg-green-50 rounded-xl px-5 py-3">

            <p className="text-xs text-green-600">已提交</p>

            <p className="text-2xl font-bold text-green-700">{collectors.filter(c => c.has_submitted).length}</p>

          </div>

          <div className="bg-amber-50 rounded-xl px-5 py-3">

            <p className="text-xs text-amber-600">未提交</p>

            <p className="text-2xl font-bold text-amber-700">{collectors.filter(c => !c.has_submitted).length}</p>

          </div>

          <div className="bg-red-50 rounded-xl px-5 py-3">

            <p className="text-xs text-red-600">已驳回</p>

            <p className="text-2xl font-bold text-red-700">{collectors.filter(c => c.info_rejected === 1).length}</p>

          </div>

        </div>



        {/* 搜索栏 */}

        <div className="mb-4">

          <div className="relative max-w-xs">

            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />

            <input

              type="text"

              placeholder="搜索姓名或账号..."

              value={searchText}

              onChange={e => setSearchText(e.target.value)}

              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

            />

          </div>

        </div>



        {/* 表格 */}

        {loading ? (

          <div className="flex items-center justify-center py-20">

            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />

          </div>

        ) : filtered.length === 0 ? (

          <div className="text-center py-20 text-slate-400">暂无采集员</div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full border-collapse">

              <thead>

                <tr className="bg-slate-50">

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">姓名</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">账号</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">性别</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">年龄</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">籍贯</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">所属分组</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">状态</th>

                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">操作</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {filtered.map(c => (

                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.has_submitted ? 'bg-amber-50/30' : ''}`}>

                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{c.real_name || '未填写'}</td>

                    <td className="px-4 py-3 text-sm text-slate-600">{c.username}</td>

                    <td className="px-4 py-3 text-sm text-slate-600">{c.gender || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-600">{c.age ?? '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-600">{c.hometown || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{c.group_names.join('、') || '未分组'}</td>

                    <td className="px-4 py-3">

                      <div className="flex flex-wrap gap-1">

                        {c.info_rejected === 1 ? (

                          <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">已驳回</span>

                        ) : !c.has_submitted ? (

                          <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-xs font-medium rounded-full">未提交</span>

                        ) : !c.has_info ? (

                          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs font-medium rounded-full">待完善</span>

                        ) : (

                          <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs font-medium rounded-full">已提交 {c.submitted_count}</span>

                        )}

                      </div>

                    </td>

                    <td className="px-4 py-3 text-center">

                      <button onClick={() => setSelectedMember(c)}

                        className="text-violet-600 hover:text-violet-800 text-xs font-medium">

                        详情

                      </button>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );

};



// ── 公共页头 ──────────────────────────────────────────────────────

const SubHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (

  <header className="flex items-center justify-between py-4 mb-4">

    <button onClick={onBack} className="p-2 hover:bg-white rounded-full transition-colors text-slate-600">

      <ChevronLeft className="w-6 h-6" />

    </button>

    <h1 className="text-lg font-bold text-slate-800">{title}</h1>

    <div className="w-10" />

  </header>

);



// ── 账号管理 ──────────────────────────────────────────────────────

interface BatchResult { username: string; password: string; role: string }



const exportCSV = (rows: BatchResult[], groupName: string) => {

  const header = '账号,密码,角色,分组';

  const lines = rows.map(r => `${r.username},${r.password},${roleLabel(r.role)},${groupName}`);

  const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = `账号列表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;

  a.click();

  URL.revokeObjectURL(url);

};



const UsersView: React.FC<{ onBack: () => void; onSelectCollector?: (collector: { id: number; username: string }) => void }> = ({ onBack, onSelectCollector }) => {

  const [mode, setMode] = useState<'single' | 'batch'>('single');



  // ── 分组列表 & 选中的组 ────────────────────────────────────────────

  const [groups, setGroups] = useState<CollectorGroupItem[]>([]);

  const [groupsLoading, setGroupsLoading] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<CollectorGroupItem | null>(null);



  // ── 勾选 ─────────────────────────────────────────────────────────

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [userSearch, setUserSearch] = useState('');



  // ── 批量操作 state ─────────────────────────────────────────────

  const [bulkAction, setBulkAction] = useState<'none' | 'change-group'>('none');

  const [bulkGroups, setBulkGroups] = useState<CollectorGroupItem[]>([]);

  const [bulkGroupId, setBulkGroupId] = useState('');

  const [bulkWorking, setBulkWorking] = useState(false);

  const [bulkMsg, setBulkMsg] = useState('');



  // ── 单个创建 state ─────────────────────────────────────────────

  const [form, setForm] = useState({ username: '', password: '', role: 'collector' as RoleValue });

  const [submitting, setSubmitting] = useState(false);

  const [formError, setFormError] = useState('');

  const [formSuccess, setFormSuccess] = useState('');



  // ── 批量创建 state ─────────────────────────────────────────────

  const [batchGroups, setBatchGroups] = useState<CollectorGroupItem[]>([]);

  const [batchForm, setBatchForm] = useState({ prefix: '', count: '10', role: 'collector' as RoleValue, group_id: '' });

  const [batchSubmitting, setBatchSubmitting] = useState(false);

  const [batchError, setBatchError] = useState('');

  const [batchResult, setBatchResult] = useState<BatchResult[] | null>(null);

  const [batchGroupName, setBatchGroupName] = useState('');

  const [adminUsers, setAdminUsers] = useState<UserItem[]>([]);



  // 文件夹相关状态

  const [corpFolders, setCorpFolders] = useState<FolderItem[]>([]);

  const [corpGroups, setCorpGroups] = useState<CorpusGroupItem[]>([]);

  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());



  const fetchAllGroups = useCallback(async (currentGroupId?: number, _p?: number) => {

    setGroupsLoading(true);

    try {

      // 使用新API一次加载所有角色的组

      const [allGroupsRes, usersRes, corpFoldersRes, corpGroupsRes] = await Promise.all([

        apiFetch(getApiUrl(`/admin/all-groups`)).then(r => r.json()),

        apiFetch(getApiUrl(`/users`)).then(r => r.json()),

        apiFetch(getApiUrl(`/admin/corpus-folders`)).then(r => r.json()),

        apiFetch(getApiUrl(`/admin/corpus-groups?limit=500`)).then(r => r.json()),

      ]);

      const groupsData = allGroupsRes.data ?? {};

      const all = [

        ...(groupsData.collector ?? []),

        ...(groupsData.annotator ?? []),

        ...(groupsData.inspector ?? []),

        ...(groupsData.reviewer ?? []),

        ...(groupsData.quality_reviewer ?? []),

      ];

      setGroups(all);

      const allUsers: UserItem[] = usersRes.data ?? [];

      setAdminUsers(allUsers.filter(u => u.role === 'manager' || u.role === 'sub_manager'));

      setCorpFolders(corpFoldersRes.data ?? []);

      setCorpGroups(corpGroupsRes.data ?? []);

      if (currentGroupId !== undefined) {

        setSelectedGroup(all.find(g => g.id === currentGroupId) ?? null);

      }

    } finally { setGroupsLoading(false); }

  }, []);



  // ── 组→文件夹映射（一对多）──────────────────────────────────────

  const groupFolderMap = React.useMemo(() => {

    const map = new Map<number, Set<number>>();

    for (const cg of corpGroups) {

      const folderId = cg.folder_id;

      if (folderId != null) {

        const addGroup = (gid: number) => {

          if (!map.has(gid)) map.set(gid, new Set());

          map.get(gid)!.add(folderId);

        };

        for (const ag of cg.assigned_groups) addGroup(ag.id);

        for (const ag of cg.annotator_groups) addGroup(ag.id);

        for (const ag of cg.inspector_groups) addGroup(ag.id);

        for (const ag of cg.reviewer_groups) addGroup(ag.id);

        for (const ag of cg.quality_reviewer_groups) addGroup(ag.id);

      }

    }

    return map;

  }, [corpGroups]);



  // 获取方言文件夹

  const corpDialectFolders = corpFolders.filter(f => f.level === 1);

  const getCorpRegionFolders = (dialectId: number) => corpFolders.filter(f => f.level === 2 && f.parent_id === dialectId);



  // 获取某个文件夹下的组

  const getGroupsInCorpFolder = (folderId: number) => groups.filter(g => groupFolderMap.get(g.id)?.has(folderId));

  // 获取不在任何文件夹中的组

  const unfolderedGroups = groups.filter(g => {

    const s = groupFolderMap.get(g.id);

    return !s || s.size === 0;

  });



  const toggleCorpFolder = (folderId: number) => {

    setExpandedFolders(prev => {

      const next = new Set(prev);

      if (next.has(folderId)) next.delete(folderId);

      else next.add(folderId);

      return next;

    });

  };



  const fetchBatchGroups = useCallback(async (roleType: string) => {

    const res = await apiFetch(getApiUrl(`/admin/groups?role_type=${roleType}&limit=500`));

    const json = await res.json();

    setBatchGroups(json.data ?? []);

  }, []);



  useEffect(() => { fetchAllGroups(); fetchBatchGroups(batchForm.role); }, []);



  // ── 勾选逻辑 ──────────────────────────────────────────────────

  const groupMembers = selectedGroup?.members ?? [];

  const selectableUsers = groupMembers.filter(u => u.role !== 'manager' || selectedGroup?.id === 0);

  const allSelected = selectableUsers.length > 0 && selectableUsers.every(u => selected.has(u.id));



  const toggleOne = (id: number) => {

    setSelected(prev => {

      const next = new Set(prev);

      next.has(id) ? next.delete(id) : next.add(id);

      return next;

    });

    setBulkAction('none'); setBulkMsg('');

  };



  const toggleAll = () => {

    setSelected(allSelected ? new Set() : new Set(selectableUsers.map(u => u.id)));

    setBulkAction('none'); setBulkMsg('');

  };



  // ── 批量删除 ──────────────────────────────────────────────────

  const handleBulkDelete = async () => {

    if (!window.confirm(`确认删除选中的 ${selected.size} 个账号？此操作不可恢复。`)) return;

    setBulkWorking(true); setBulkMsg('');

    try {

      const res = await apiFetch(getApiUrl(`/users/bulk-delete`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ ids: [...selected] }),

      });

      const json = await res.json();

      if (!res.ok) { setBulkMsg(json.detail ?? '删除失败'); return; }

      setSelected(new Set());

      setBulkAction('none');

      fetchAllGroups(selectedGroup?.id);

    } catch { setBulkMsg('网络异常'); }

    finally { setBulkWorking(false); }

  };



  // ── 换组：打开选择器，加载对应角色的组 ─────────────────────────

  const openChangeGroup = async () => {

    const role = selectedGroup?.role_type;

    if (!role) return;

    const res = await apiFetch(getApiUrl(`/admin/groups?role_type=${role}&limit=500`));

    const json = await res.json();

    setBulkGroups(json.data ?? []);

    setBulkGroupId('');

    setBulkAction('change-group');

    setBulkMsg('');

  };



  const handleBulkChangeGroup = async () => {

    if (!bulkGroupId) return;

    setBulkWorking(true); setBulkMsg('');

    try {

      const res = await apiFetch(getApiUrl(`/users/bulk-change-group`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ ids: [...selected], group_id: Number(bulkGroupId) }),

      });

      const json = await res.json();

      if (!res.ok) { setBulkMsg(json.detail ?? '换组失败'); return; }

      setBulkMsg(json.msg ?? '换组成功');

      setSelected(new Set());

      setBulkAction('none');

      fetchAllGroups(selectedGroup?.id);

    } catch { setBulkMsg('网络异常'); }

    finally { setBulkWorking(false); }

  };



  // ── 单个删除 ──────────────────────────────────────────────────

  const handleDelete = async (id: number, username: string) => {

    if (!window.confirm(`确认删除账号 "${username}"？`)) return;

    try {

      await apiFetch(getApiUrl(`/users/${id}`), { method: 'DELETE' });

      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });

      fetchAllGroups(selectedGroup?.id);

    } catch { /* ignore */ }

  };



  const handleAdd = async (e: React.FormEvent) => {

    e.preventDefault();

    setFormError(''); setFormSuccess('');

    if (!form.username.trim() || !form.password.trim()) { setFormError('请填写账号和密码'); return; }

    setSubmitting(true);

    try {

      const res = await apiFetch(getApiUrl(`/users`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(form),

      });

      const json = await res.json();

      if (!res.ok) { setFormError(json.detail ?? '创建失败'); return; }

      setFormSuccess(`账号 ${form.username} 创建成功`);

      setForm({ username: '', password: '', role: 'collector' });

      fetchAllGroups();

    } catch { setFormError('网络异常，请检查后端服务'); }

    finally { setSubmitting(false); }

  };



  const handleBatchCreate = async (e: React.FormEvent) => {

    e.preventDefault();

    setBatchError(''); setBatchResult(null);

    const count = parseInt(batchForm.count);

    if (!batchForm.prefix.trim()) { setBatchError('请填写账号前缀'); return; }

    if (isNaN(count) || count < 1) { setBatchError('创建数量须大于 0'); return; }

    if (!batchForm.group_id) { setBatchError('请选择分组'); return; }

    setBatchSubmitting(true);

    try {

      const res = await apiFetch(getApiUrl(`/users/batch`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ prefix: batchForm.prefix.trim(), count, role: batchForm.role, group_id: Number(batchForm.group_id) }),

      });

      const json = await res.json();

      if (!res.ok) { setBatchError(json.detail ?? '创建失败'); return; }

      setBatchResult(json.data);

      setBatchGroupName(batchGroups.find(g => g.id === Number(batchForm.group_id))?.name ?? '');

      fetchAllGroups();

    } catch { setBatchError('网络异常，请检查后端服务'); }

    finally { setBatchSubmitting(false); }

  };



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-md">

        {selectedGroup ? (

          /* ── 组内账号视图 ── */

          <>

            <div className="flex items-center gap-2 mb-4">

              <button

                onClick={() => { setSelectedGroup(null); setSelected(new Set()); setBulkAction('none'); setUserSearch(''); }}

                className="p-2 hover:bg-white rounded-xl transition-colors"

              >

                <ChevronLeft className="w-5 h-5 text-slate-600" />

              </button>

              <div className="flex items-center gap-2 flex-1 min-w-0">

                <h1 className="text-lg font-bold text-slate-800 truncate">{selectedGroup.name}</h1>

                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_BADGE[selectedGroup.role_type] ?? 'bg-slate-100 text-slate-600'}`}>

                  {roleLabel(selectedGroup.role_type)}

                </span>

              </div>

              <span className="text-sm text-slate-400 flex-shrink-0">{selectedGroup.member_count} 人</span>

            </div>



            <div className="bg-white rounded-2xl shadow-sm p-5">

              {selectedGroup.members.length > 0 && (

                <input

                  value={userSearch}

                  onChange={e => setUserSearch(e.target.value)}

                  placeholder="搜索账号..."

                  className="w-full px-3 py-2 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 mb-4"

                />

              )}



              {!groupsLoading && selectedGroup.members.length > 0 && (

                <div className="mb-3">

                  <div className="flex items-center justify-between">

                    <label className="flex items-center gap-2 cursor-pointer select-none">

                      <input type="checkbox" checked={allSelected} onChange={toggleAll}

                        className="w-4 h-4 rounded accent-violet-600 cursor-pointer" />

                      <span className="text-sm font-bold text-slate-700">

                        全部账号

                        {selected.size > 0 && <span className="ml-1 text-violet-600">（已选 {selected.size}）</span>}

                      </span>

                    </label>

                    {selected.size > 0 && (

                      <div className="flex items-center gap-1.5">

                        <button onClick={openChangeGroup} disabled={bulkWorking}

                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50">

                          换组

                        </button>

                        <button onClick={handleBulkDelete} disabled={bulkWorking}

                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg transition-colors disabled:opacity-50">

                          {bulkWorking ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : '删除'}

                        </button>

                      </div>

                    )}

                  </div>



                  {bulkAction === 'change-group' && (

                    <div className="mt-3 p-3 bg-blue-50 rounded-xl space-y-2">

                      <p className="text-xs text-blue-700 font-medium">选择目标分组</p>

                      {bulkGroups.length === 0 ? (

                        <p className="text-xs text-amber-600">该角色暂无可用分组</p>

                      ) : (

                        <select value={bulkGroupId} onChange={e => setBulkGroupId(e.target.value)}

                          className="block w-full px-3 py-2 bg-white rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">

                          <option value="">— 选择分组 —</option>

                          {bulkGroups.map(g => <option key={g.id} value={g.id}>{g.name}（{g.member_count} 人）</option>)}

                        </select>

                      )}

                      <div className="flex gap-2">

                        <button onClick={handleBulkChangeGroup} disabled={!bulkGroupId || bulkWorking}

                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-lg flex items-center justify-center transition-all">

                          {bulkWorking ? <Loader2 className="animate-spin w-4 h-4" /> : '确认换组'}

                        </button>

                        <button onClick={() => { setBulkAction('none'); setBulkMsg(''); }}

                          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg border border-slate-200 transition-colors">

                          取消

                        </button>

                      </div>

                    </div>

                  )}

                  {bulkMsg && (

                    <p className={`text-xs mt-2 pl-1 ${bulkMsg.includes('成功') ? 'text-green-600' : 'text-red-500'}`}>{bulkMsg}</p>

                  )}

                </div>

              )}



              {groupsLoading ? (

                <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

              ) : selectedGroup.members.length === 0 ? (

                <p className="text-center text-slate-400 text-sm py-6">该组暂无账号</p>

              ) : (

                <>

                  {selectedGroup.members.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase())).length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-6">没有搜索到匹配的账号</p>

                  ) : (

                    <ul className="divide-y divide-slate-50">

                      {selectedGroup.members.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase())).map(u => (

                        <li key={u.id} className="flex items-center gap-3 py-3">

                          {(u.role !== 'manager' || selectedGroup.id === 0) ? (

                            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)}

                              className="w-4 h-4 rounded accent-violet-600 cursor-pointer flex-shrink-0" />

                          ) : (

                            <div className="w-4 flex-shrink-0" />

                          )}

                          <button

                            onClick={() => {

                              if (u.role === 'collector' && onSelectCollector) {

                                onSelectCollector({ id: u.id, username: u.username });

                              }

                            }}

                            className="flex-1 flex items-center gap-3 text-left hover:bg-slate-50 rounded-lg transition-colors px-2 py-1 -mx-2 -my-1"

                          >

                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 text-xs font-bold flex-shrink-0">

                              {u.username[0].toUpperCase()}

                            </div>

                            <div className="flex-1 min-w-0">

                              <p className="text-sm font-semibold text-slate-800 truncate">{u.username}</p>

                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-600'}`}>

                                {roleLabel(u.role)}

                              </span>

                            </div>

                          </button>

                          <button onClick={() => handleDelete(u.id, u.username)}

                            className="p-2 hover:bg-red-50 rounded-full text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">

                            <Trash2 className="w-4 h-4" />

                          </button>

                        </li>

                      ))}

                    </ul>

                  )}

                </>

              )}

            </div>

          </>

        ) : (

          /* ── 分组列表视图 ── */

          <>

            <SubHeader title="账号管理" onBack={onBack} />



            {/* 模式切换 */}

            <div className="flex bg-white rounded-2xl shadow-sm p-1.5 mb-4 gap-1">

              {(['single', 'batch'] as const).map(m => (

                <button key={m} onClick={() => { setMode(m); setBatchResult(null); setBatchError(''); setSelected(new Set()); setBulkAction('none'); }}

                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all

                    ${mode === m ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50'}`}>

                  {m === 'single' ? '单个创建' : '批量创建'}

                </button>

              ))}

            </div>



            {/* ── 单个创建 ── */}

            {mode === 'single' && (

              <>

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />添加新账号

                  </h2>

                  <form onSubmit={handleAdd} className="space-y-3">

                    <input type="text" placeholder="账号名称" value={form.username}

                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}

                      className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                    <input type="password" placeholder="初始密码" value={form.password}

                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}

                      className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as RoleValue }))}

                      className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all">

                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}

                    </select>

                    {formError && <p className="text-red-500 text-sm">{formError}</p>}

                    {formSuccess && <p className="text-green-600 text-sm flex items-center gap-1"><CheckCircle className="w-4 h-4" />{formSuccess}</p>}

                    <button type="submit" disabled={submitting}

                      className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                      {submitting ? <Loader2 className="animate-spin w-5 h-5" /> : '创建账号'}

                    </button>

                  </form>

                </div>



                {/* 分组列表 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

                    <Users className="w-4 h-4 text-violet-600" />按组浏览账号

                  </h2>

                  {groupsLoading ? (

                    <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

                  ) : (

                    <div className="space-y-2">

                      {/* 系统管理组 */}

                      {adminUsers.length > 0 && (

                        <button

                          onClick={() => {

                            setSelectedGroup({

                              id: 0, name: '系统管理', role_type: 'manager',

                              member_count: adminUsers.length,

                              members: adminUsers,

                            });

                            setSelected(new Set()); setBulkAction('none'); setUserSearch('');

                          }}

                          className="w-full p-3 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl flex items-center justify-between transition-all text-left"

                        >

                          <div className="flex items-center gap-3 min-w-0">

                            <div className="w-8 h-8 bg-violet-200 rounded-lg flex items-center justify-center flex-shrink-0">

                              <ShieldCheck className="w-4 h-4 text-violet-700" />

                            </div>

                            <div className="min-w-0">

                              <p className="text-sm font-semibold text-slate-800 truncate">系统管理</p>

                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-200 text-violet-800">

                                管理员 / 二级管理员

                              </span>

                            </div>

                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">

                            <span className="text-xs text-slate-500">{adminUsers.length} 人</span>

                            <ChevronLeft className="w-4 h-4 text-slate-400 rotate-180" />

                          </div>

                        </button>

                      )}



                      {/* 文件夹树形结构 */}

                      {corpDialectFolders.length > 0 && corpDialectFolders.map(df => {

                        const regionFolders = getCorpRegionFolders(df.id);

                        const isDialectExpanded = expandedFolders.has(df.id);

                        return (

                          <div key={df.id} className="border border-amber-100 rounded-xl overflow-hidden">

                            <div className="flex items-center gap-2 p-3 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"

                              onClick={() => toggleCorpFolder(df.id)}>

                              <ChevronLeft className={`w-4 h-4 text-amber-600 transition-transform ${isDialectExpanded ? 'rotate-90' : '-rotate-90'}`} />

                              <FolderOpen className="w-4 h-4 text-amber-600" />

                              <span className="text-sm font-bold text-amber-800 flex-1">{df.name}</span>

                              <span className="text-xs text-amber-600">{regionFolders.length} 个地区</span>

                            </div>

                            {isDialectExpanded && (

                              <div className="pl-4 pb-2">

                                {regionFolders.length === 0 ? (

                                  <p className="text-xs text-slate-400 py-2 pl-6">暂无地区</p>

                                ) : regionFolders.map(rf => {

                                  const groupsInRegion = getGroupsInCorpFolder(rf.id);

                                  const isRegionExpanded = expandedFolders.has(rf.id);

                                  return (

                                    <div key={rf.id} className="mt-1">

                                      <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"

                                        onClick={() => toggleCorpFolder(rf.id)}>

                                        <ChevronLeft className={`w-3.5 h-3.5 text-green-600 transition-transform ${isRegionExpanded ? 'rotate-90' : '-rotate-90'}`} />

                                        <FolderOpen className="w-3.5 h-3.5 text-green-600" />

                                        <span className="text-sm font-medium text-green-800 flex-1">{rf.name}</span>

                                        <span className="text-xs text-green-600">{groupsInRegion.length} 个组</span>

                                      </div>

                                      {isRegionExpanded && (

                                        <div className="pl-6 mt-1 space-y-1">

                                          {groupsInRegion.length === 0 ? (

                                            <p className="text-xs text-slate-400 py-1">暂无账号组</p>

                                          ) : groupsInRegion.map(g => (

                                            <button

                                              key={g.id}

                                              onClick={() => { setSelectedGroup(g); setSelected(new Set()); setBulkAction('none'); setUserSearch(''); }}

                                              className="w-full p-2.5 bg-slate-50 hover:bg-violet-50 border border-slate-100 hover:border-violet-200 rounded-lg flex items-center justify-between transition-all text-left"

                                            >

                                              <div className="flex items-center gap-2 min-w-0">

                                                <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">

                                                  <Users className="w-3.5 h-3.5 text-violet-600" />

                                                </div>

                                                <div className="min-w-0">

                                                  <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>

                                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[g.role_type] ?? 'bg-slate-100 text-slate-600'}`}>

                                                    {roleLabel(g.role_type)}

                                                  </span>

                                                </div>

                                              </div>

                                              <div className="flex items-center gap-1 flex-shrink-0">

                                                <span className="text-xs text-slate-400">{g.member_count}人</span>

                                                <ChevronLeft className="w-3.5 h-3.5 text-slate-400 rotate-180" />

                                              </div>

                                            </button>

                                          ))}

                                        </div>

                                      )}

                                    </div>

                                  );

                                })}

                              </div>

                            )}

                          </div>

                        );

                      })}



                      {/* 未分组的账号组 */}

                      {unfolderedGroups.length > 0 && (

                        <div className="border border-slate-100 rounded-xl overflow-hidden">

                          <div className="p-3 bg-slate-50">

                            <p className="text-sm font-bold text-slate-600">未分组账号组 <span className="text-xs font-normal text-slate-400">（{unfolderedGroups.length} 个）</span></p>

                          </div>

                          <div className="p-2 space-y-1">

                            {unfolderedGroups.map(g => (

                              <button

                                key={g.id}

                                onClick={() => { setSelectedGroup(g); setSelected(new Set()); setBulkAction('none'); setUserSearch(''); }}

                                className="w-full p-2.5 bg-white hover:bg-violet-50 border border-slate-100 hover:border-violet-200 rounded-lg flex items-center justify-between transition-all text-left"

                              >

                                <div className="flex items-center gap-2 min-w-0">

                                  <div className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">

                                    <Users className="w-3.5 h-3.5 text-violet-600" />

                                  </div>

                                  <div className="min-w-0">

                                    <p className="text-sm font-semibold text-slate-800 truncate">{g.name}</p>

                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[g.role_type] ?? 'bg-slate-100 text-slate-600'}`}>

                                      {roleLabel(g.role_type)}

                                    </span>

                                  </div>

                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">

                                  <span className="text-xs text-slate-400">{g.member_count}人</span>

                                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400 rotate-180" />

                                </div>

                              </button>

                            ))}

                          </div>

                        </div>

                      )}



                      {groups.length === 0 && adminUsers.length === 0 && (

                        <p className="text-center text-slate-400 text-sm py-6">暂无分组</p>

                      )}

                    </div>

                  )}

                </div>

              </>

            )}



            {/* ── 批量创建 ── */}

            {mode === 'batch' && (

              <>

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

                    <Users className="w-4 h-4 text-violet-600" />批量创建账号

                  </h2>

                  <form onSubmit={handleBatchCreate} className="space-y-3">

                    <div>

                      <label className="block text-xs text-slate-500 mb-1 pl-1">账号前缀</label>

                      <input type="text" placeholder="如 collector → collector01、collector02…" value={batchForm.prefix}

                        onChange={e => setBatchForm(f => ({ ...f, prefix: e.target.value }))}

                        className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                    </div>

                    <div className="grid grid-cols-2 gap-3">

                      <div>

                        <label className="block text-xs text-slate-500 mb-1 pl-1">创建数量</label>

                        <input type="number" placeholder="数量" min={1} max={500} value={batchForm.count}

                          onChange={e => setBatchForm(f => ({ ...f, count: e.target.value }))}

                          className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                      </div>

                      <div>

                        <label className="block text-xs text-slate-500 mb-1 pl-1">角色</label>

                        <select value={batchForm.role} onChange={e => {

                          const newRole = e.target.value as RoleValue;

                          setBatchForm(f => ({ ...f, role: newRole, group_id: '' }));

                          fetchBatchGroups(newRole);

                        }}

                          className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all">

                          {ROLES.filter(r => r.value !== 'manager').map(r => (

                            <option key={r.value} value={r.value}>{r.label}</option>

                          ))}

                        </select>

                      </div>

                    </div>

                    <div>

                      <label className="block text-xs text-slate-500 mb-1 pl-1">

                        加入{roleLabel(batchForm.role)}分组 <span className="text-red-400">*</span>

                      </label>

                      <select value={batchForm.group_id} onChange={e => setBatchForm(f => ({ ...f, group_id: e.target.value }))}

                        className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all">

                        <option value="">— 选择分组 —</option>

                        {batchGroups.map(g => <option key={g.id} value={g.id}>{g.name}（{g.member_count} 人）</option>)}

                      </select>

                      {batchGroups.length === 0 && (

                        <p className="text-xs text-amber-500 mt-1 pl-1">请先在"分组管理"里创建 {roleLabel(batchForm.role)} 分组</p>

                      )}

                    </div>

                    {batchForm.prefix && batchForm.count && (

                      <p className="text-xs text-slate-400 pl-1">

                        将创建：<b className="text-violet-600 font-mono">

                          {batchForm.prefix}{String(1).padStart(String(parseInt(batchForm.count) || 1).length, '0')}

                        </b> ~ <b className="text-violet-600 font-mono">

                          {batchForm.prefix}{String(parseInt(batchForm.count) || 0).padStart(String(parseInt(batchForm.count) || 1).length, '0')}

                        </b>，密码随机 6 位字母数字

                      </p>

                    )}

                    {batchError && <p className="text-red-500 text-sm">{batchError}</p>}

                    <button type="submit" disabled={batchSubmitting || batchGroups.length === 0}

                      className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                      {batchSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : `批量创建 ${parseInt(batchForm.count) || 0} 个账号`}

                    </button>

                  </form>

                </div>



                {/* 创建结果 */}

                {batchResult && (

                  <div className="bg-white rounded-2xl shadow-sm p-5">

                    <div className="flex items-center justify-between mb-3">

                      <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">

                        <CheckCircle className="w-4 h-4 text-green-500" />

                        成功创建 {batchResult.length} 个账号

                      </h2>

                      <button onClick={() => exportCSV(batchResult!, batchGroupName)}

                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg transition-colors">

                        <Download className="w-3.5 h-3.5" />导出 CSV

                      </button>

                    </div>

                    <div className="overflow-x-auto">

                      <table className="w-full text-sm">

                        <thead>

                          <tr className="border-b border-slate-100">

                            <th className="text-left text-xs text-slate-400 font-medium pb-2">账号</th>

                            <th className="text-left text-xs text-slate-400 font-medium pb-2">密码</th>

                            <th className="text-left text-xs text-slate-400 font-medium pb-2">角色</th>

                          </tr>

                        </thead>

                        <tbody className="divide-y divide-slate-50">

                          {batchResult.map(r => (

                            <tr key={r.username}>

                              <td className="py-2 font-mono text-slate-800 text-xs">{r.username}</td>

                              <td className="py-2 font-mono text-violet-600 text-xs">{r.password}</td>

                              <td className="py-2">

                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[r.role] ?? 'bg-slate-100 text-slate-600'}`}>

                                  {roleLabel(r.role)}

                                </span>

                              </td>

                            </tr>

                          ))}

                        </tbody>

                      </table>

                    </div>

                  </div>

                )}

              </>

            )}

          </>

        )}

      </div>

    </div>

  );

};



// ── 语料组详情（三 Tab） ──────────────────────────────────────────

type GroupDetailTab = 'corpus' | 'packages' | 'assign';

type AssignSubTab = 'collector' | 'annotator' | 'inspector' | 'reviewer' | 'quality_reviewer';

const PAGE_SIZE = 20;



const CorpusGroupDetailView: React.FC<{

  group: CorpusGroupItem;

  allCollectorGroups: CollectorGroupItem[];

  allAnnotatorGroups: CollectorGroupItem[];

  allInspectorGroups: CollectorGroupItem[];

  allReviewerGroups: CollectorGroupItem[];

  allQualityReviewerGroups: CollectorGroupItem[];

  onBack: () => void;

  onRefreshGroups: () => void;

}> = ({ group, allCollectorGroups, allAnnotatorGroups, allInspectorGroups, allReviewerGroups, allQualityReviewerGroups, onBack, onRefreshGroups }) => {

  const [tab, setTab] = useState<GroupDetailTab>('corpus');

  const [assignSubTab, setAssignSubTab] = useState<AssignSubTab>('collector');





  // ── 语料 Tab state ─────────────────────────────────────────────

  const [corpus, setCorpus] = useState<CorpusItem[]>([]);

  const [total, setTotal] = useState(0);

  const [packedCount, setPackedCount] = useState(0);

  const [page, setPage] = useState(0);

  const [corpusLoading, setCorpusLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);

  const [dragging, setDragging] = useState(false);

  const [uploading, setUploading] = useState(false);

  const [uploadResult, setUploadResult] = useState<{ added: number; skipped: number; invalid: number } | null>(null);

  const [uploadError, setUploadError] = useState('');

  const [bulkMode, setBulkMode] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [clearing, setClearing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);



  // ── 语料包 Tab state ────────────────────────────────────────────

  const [packages, setPackages] = useState<PackageItem[]>([]);

  const [pkgLoading, setPkgLoading] = useState(false);

  const [pkgPage, setPkgPage] = useState(0);

  const [pkgTotal, setPkgTotal] = useState(0);

  const PKG_PAGE_SIZE = 10;

  const [pkgName, setPkgName] = useState('');

  const [pkgSize, setPkgSize] = useState('');

  const [pkgCount, setPkgCount] = useState('1');

  const [pkgCreating, setPkgCreating] = useState(false);

  const [pkgError, setPkgError] = useState('');

  const [pkgStatusCounts, setPkgStatusCounts] = useState({ '未领取': 0, '已领取': 0, '已完成': 0 });

  const [selectedPackages, setSelectedPackages] = useState<Set<number>>(new Set());

  const [batchDeleting, setBatchDeleting] = useState(false);

  const [deletingAllUnclaimed, setDeletingAllUnclaimed] = useState(false);

  const [rearranging, setRearranging] = useState(false);



  // ── 采集组分配 Tab state ────────────────────────────────────────

  const [assignSelected, setAssignSelected] = useState<Set<number>>(new Set());

  const [assigning, setAssigning] = useState(false);



  // ── 标注组分配 Tab state ────────────────────────────────────────

  const [annotatorAssignSelected, setAnnotatorAssignSelected] = useState<Set<number>>(new Set());

  const [annotatorAssigning, setAnnotatorAssigning] = useState(false);



  // ── 质检组分配 Tab state ────────────────────────────────────────

  const [inspectorAssignSelected, setInspectorAssignSelected] = useState<Set<number>>(new Set());

  const [inspectorAssigning, setInspectorAssigning] = useState(false);



  // ── 采集审核组分配 Tab state ────────────────────────────────────

  const [reviewerAssignSelected, setReviewerAssignSelected] = useState<Set<number>>(new Set());

  const [reviewerAssigning, setReviewerAssigning] = useState(false);



  // ── 质检审核组分配 Tab state ────────────────────────────────────

  const [qualityReviewerAssignSelected, setQualityReviewerAssignSelected] = useState<Set<number>>(new Set());

  const [qualityReviewerAssigning, setQualityReviewerAssigning] = useState(false);



  const [exporting, setExporting] = useState(false);

  const [exportError, setExportError] = useState('');

  const [showExportDialog, setShowExportDialog] = useState(false);

  const [exportMode, setExportMode] = useState<'all_completed' | 'selected'>('all_completed');
  const [showCollectionExportDialog, setShowCollectionExportDialog] = useState(false);
  const [collectionType, setCollectionType] = useState('');
  const [language, setLanguage] = useState('');

  const [exportablePackages, setExportablePackages] = useState<{ id: number; name: string; collector_real_name: string }[]>([]);

  const [exportSelectedPackages, setExportSelectedPackages] = useState<Set<number>>(new Set());

  const [exportableLoading, setExportableLoading] = useState(false);

  const [exportResult, setExportResult] = useState<{ filename: string; download_url: string; total_files: number } | null>(null);

  

  // 异步导出任务状态

  const [exportTaskId, setExportTaskId] = useState<string | null>(null);

  const [exportTaskStatus, setExportTaskStatus] = useState<string | null>(null);

  const [exportTaskProgress, setExportTaskProgress] = useState(0);

  const [exportTaskMessage, setExportTaskMessage] = useState('');

  const exportPollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);



  // ── 批量替换 state ──────────────────────────────────────────

  const [showReplace, setShowReplace] = useState(false);

  const [findText, setFindText] = useState('');

  const [replaceText, setReplaceText] = useState('');

  const [replacing, setReplacing] = useState(false);

  const [replaceResult, setReplaceResult] = useState('');

  const [replaceError, setReplaceError] = useState('');



  const handleBatchReplace = async () => {

    if (!findText) { setReplaceError('请输入查找内容'); return; }

    if (!window.confirm(`确认将语料中的"${findText}"全部替换为"${replaceText}"？`)) return;

    setReplacing(true);

    setReplaceError('');

    setReplaceResult('');

    try {

      const res = await apiFetch(getApiUrl('/admin/corpus/batch-replace'), {

        method: 'POST',

        body: JSON.stringify({ corpus_group_id: group.id, find_text: findText, replace_text: replaceText }),

      });

      const json = await res.json();

      if (!res.ok) {

        setReplaceError(json.detail || '替换失败');

      } else {

        setReplaceResult(json.msg);

        fetchCorpus(page);

      }

    } catch {

      setReplaceError('网络异常');

    } finally {

      setReplacing(false);

    }

  };



  // ── 地区编辑 state ──────────────────────────────────────────

  const [editingRegion, setEditingRegion] = useState(false);

  const [regionInput, setRegionInput] = useState(group.pinyin_region || '');

  const [savingRegion, setSavingRegion] = useState(false);

  const [savedPinyinRegion, setSavedPinyinRegion] = useState(group.pinyin_region || '');



  const fetchCorpus = useCallback(async (p: number) => {

    setCorpusLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus?corpus_group_id=${group.id}&limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`));

      const json = await res.json();

      setCorpus(json.data ?? []);

      setTotal(json.total ?? 0);

      setPackedCount(json.packaged_count ?? 0);

    } finally { setCorpusLoading(false); }

  }, [group.id]);



  const fetchPackages = useCallback(async (p?: number) => {

    const currentPage = p ?? pkgPage;

    setPkgLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-packages?corpus_group_id=${group.id}&limit=${PKG_PAGE_SIZE}&offset=${currentPage * PKG_PAGE_SIZE}`));

      const json = await res.json();

      setPackages(json.data ?? []);

      setPkgTotal(json.total ?? 0);

      if (json.status_counts) setPkgStatusCounts(json.status_counts);

      // 重置选中的包

      setSelectedPackages(new Set());

    } finally { setPkgLoading(false); }

  }, [group.id, pkgPage]);



  useEffect(() => {

    if (tab === 'corpus') fetchCorpus(page);

    if (tab === 'packages') fetchPackages();

  }, [tab, page, fetchCorpus, fetchPackages]);



  // upload handlers

  const selectFile = (f: File) => {

    const name = f.name.toLowerCase();

    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) { setUploadError('请选择 .csv 或 .xlsx 文件'); return; }

    setFile(f); setUploadError(''); setUploadResult(null);

  };

  const handleUpload = async () => {

    if (!file) return;

    setUploading(true); setUploadError(''); setUploadResult(null);

    try {

      const fd = new FormData();

      fd.append('file', file);

      fd.append('corpus_group_id', String(group.id));

      const res = await apiFetch(getApiUrl(`/admin/upload-corpus`), { method: 'POST', body: fd });

      const json = await res.json();

      if (!res.ok) { setUploadError(json.detail ?? '上传失败'); return; }

      setUploadResult(json);

      setFile(null);

      setPage(0);

      fetchCorpus(0);

      onRefreshGroups();

    } catch { setUploadError('网络异常'); }

    finally { setUploading(false); }

  };



  const handleDeleteCorpus = async (id: number) => {

    if (!window.confirm('确认删除这条语料？')) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus/${id}`), { method: 'DELETE' });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '删除失败'); return; }

      fetchCorpus(page);

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleBulkDelete = async () => {

    if (selected.size === 0) return;

    if (!window.confirm(`确认删除选中的 ${selected.size} 条语料？`)) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus/bulk-delete`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ ids: Array.from(selected) }),

      });

      const json = await res.json();

      alert(json.msg);

      setSelected(new Set()); setBulkMode(false);

      fetchCorpus(page); onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleClearUnpacked = async () => {

    const available = total - packedCount;

    if (available === 0) { alert('没有未打包的语料'); return; }

    if (!window.confirm(`确认删除 ${available} 条未打包的语料？\n\n此操作无法撤销，但不影响已打包语料。`)) return;

    setClearing(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/clear-unpacked`), { method: 'POST' });

      const json = await res.json();

      alert(json.msg);

      setPage(0); fetchCorpus(0); onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setClearing(false); }

  };



  const toggleSelect = (id: number) => {

    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  };



  // package handlers

  const handleCreatePkg = async (e: React.FormEvent) => {

    e.preventDefault(); setPkgError('');

    const size = parseInt(pkgSize);

    const count = parseInt(pkgCount) || 1;

    if (!pkgName.trim() || isNaN(size) || size <= 0) { setPkgError('请填写包名和有效数量'); return; }

    if (count <= 0) { setPkgError('创建包数必须大于 0'); return; }

    if (size * count > available) { setPkgError(`所需语料 ${size * count} 条，超过可用 ${available} 条`); return; }

    setPkgCreating(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-packages`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ corpus_group_id: group.id, name: pkgName.trim(), size, count }),

      });

      const json = await res.json();

      if (!res.ok) { setPkgError(json.detail ?? '创建失败'); return; }

      setPkgName(''); setPkgSize(''); setPkgCount('1');

      setPkgPage(0); fetchPackages(0); onRefreshGroups();

    } catch { setPkgError('网络异常'); }

    finally { setPkgCreating(false); }

  };



  const handleDeletePkg = async (id: number, name: string) => {

    if (!window.confirm(`确认删除语料包"${name}"？`)) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-packages/${id}`), { method: 'DELETE' });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '删除失败'); return; }

      setPkgPage(0); fetchPackages(0); onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  // assign handlers

  const handleAssign = async () => {

    if (assignSelected.size === 0) return;

    setAssigning(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/assign`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ collector_group_ids: Array.from(assignSelected) }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '分配失败'); return; }

      setAssignSelected(new Set());

      onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setAssigning(false); }

  };



  const handleUnassign = async (cgid: number) => {

    try {

      await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/collector-groups/${cgid}`), { method: 'DELETE' });

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleAnnotatorAssign = async () => {

    if (annotatorAssignSelected.size === 0) return;

    setAnnotatorAssigning(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/assign-annotators`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ annotator_group_ids: Array.from(annotatorAssignSelected) }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '分配失败'); return; }

      setAnnotatorAssignSelected(new Set());

      onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setAnnotatorAssigning(false); }

  };



  const handleAnnotatorUnassign = async (agid: number) => {

    try {

      await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/annotator-groups/${agid}`), { method: 'DELETE' });

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleInspectorAssign = async () => {

    if (inspectorAssignSelected.size === 0) return;

    setInspectorAssigning(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/assign-inspectors`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ inspector_group_ids: Array.from(inspectorAssignSelected) }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '分配失败'); return; }

      setInspectorAssignSelected(new Set());

      onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setInspectorAssigning(false); }

  };



  const handleInspectorUnassign = async (igid: number) => {

    try {

      await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/inspector-groups/${igid}`), { method: 'DELETE' });

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleReviewerAssign = async () => {

    if (reviewerAssignSelected.size === 0) return;

    setReviewerAssigning(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/assign-reviewers`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ reviewer_group_ids: Array.from(reviewerAssignSelected) }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '分配失败'); return; }

      setReviewerAssignSelected(new Set());

      onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setReviewerAssigning(false); }

  };



  const handleReviewerUnassign = async (rgid: number) => {

    try {

      await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/reviewer-groups/${rgid}`), { method: 'DELETE' });

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleQualityReviewerAssign = async () => {

    if (qualityReviewerAssignSelected.size === 0) return;

    setQualityReviewerAssigning(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/assign-quality-reviewers`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ quality_reviewer_group_ids: Array.from(qualityReviewerAssignSelected) }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '分配失败'); return; }

      setQualityReviewerAssignSelected(new Set());

      onRefreshGroups();

    } catch { alert('网络异常'); }

    finally { setQualityReviewerAssigning(false); }

  };



  const handleQualityReviewerUnassign = async (qrgid: number) => {

    try {

      await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}/quality-reviewer-groups/${qrgid}`), { method: 'DELETE' });

      onRefreshGroups();

    } catch { alert('网络异常'); }

  };



  const handleSaveRegion = async () => {

    if (!regionInput.trim()) {

      alert('请输入地区拼音');

      return;

    }

    setSavingRegion(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}`), {

        method: 'PUT',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ pinyin_region: regionInput.trim() }),

      });

      const json = await res.json();

      if (!res.ok) {

        alert(json.detail || '保存失败');

        return;

      }

      // 保存成功，更新本地状态

      const savedValue = regionInput.trim();

      setSavedPinyinRegion(savedValue);

      setEditingRegion(false);

      alert('地区设置保存成功');

      onRefreshGroups();

    } catch {

      alert('网络异常');

    } finally {

      setSavingRegion(false);

    }

  };



  const fetchExportablePackages = async () => {

    setExportableLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/exportable-packages/${group.id}`));

      const json = await res.json();

      if (res.ok) {

        setExportablePackages(json.data ?? []);

      } else {

        setExportError(json.detail || '获取可导出包列表失败');

      }

    } catch {

      setExportError('网络异常');

    } finally {

      setExportableLoading(false);

    }

  };



  const openExportDialog = async () => {

    setExportError('');

    setExportResult(null);

    setExportMode('all_completed');

    setExportSelectedPackages(new Set());

    setShowExportDialog(true);

    await fetchExportablePackages();

  };



  const handleCollectionExport = async () => {
    if (!collectionType.trim() || !language.trim()) {
      setExportError('请填写采集类型和语种');
      return;
    }
    setExportError('');
    setExporting(true);
    setExportResult(null);
    setExportTaskId(null);
    setExportTaskStatus(null);
    setExportTaskProgress(0);
    setExportTaskMessage('');
    try {
      const res = await apiFetch(getApiUrl(`/admin/export-collection-approved-group/${group.id}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_type: collectionType.trim(),
          language: language.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.detail || '启动导出任务失败');
        setExporting(false);
        return;
      }
      setShowCollectionExportDialog(false);
      setExportTaskId(data.data.task_id);
      setExportTaskStatus('pending');
      setExportTaskMessage('任务已启动...');
      setShowExportDialog(true);
    } catch (err) {
      setExportError('网络异常，无法导出');
      setExporting(false);
    }
  };

  const handleExport = async () => {

    setExporting(true);

    setExportError('');

    setExportResult(null);

    setExportTaskId(null);

    setExportTaskStatus(null);

    setExportTaskProgress(0);

    setExportTaskMessage('');

    try {

      const body = exportMode === 'selected'

        ? { mode: 'selected', package_ids: Array.from(exportSelectedPackages) }

        : { mode: 'all_completed' };



      if (exportMode === 'selected' && exportSelectedPackages.size === 0) {

        setExportError('请至少选择一个包');

        setExporting(false);

        return;

      }



      const res = await apiFetch(getApiUrl(`/admin/export-corpus-group/${group.id}`), {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(body),

      });

      const json = await res.json();

      if (!res.ok) {

        setExportError(json.detail || '导出失败');

        setExporting(false);

        return;

      }

      // 异步模式：获取任务ID

      if (json.data?.task_id) {

        setExportTaskId(json.data.task_id);

        setExportTaskStatus('pending');

        setExportTaskMessage('任务已启动...');

      }

    } catch (err) {

      setExportError('网络异常');

      setExporting(false);

    }

  };



  // 轮询导出任务状态

  useEffect(() => {

    if (!exportTaskId || exportTaskStatus === 'completed' || exportTaskStatus === 'failed') {

      if (exportPollTimerRef.current) {

        clearInterval(exportPollTimerRef.current);

        exportPollTimerRef.current = null;

      }

      return;

    }



    const pollStatus = async () => {

      try {

        const res = await apiFetch(getApiUrl(`/admin/export-task/${exportTaskId}`));

        const data = await res.json();

        if (res.ok && data.data) {

          setExportTaskStatus(data.data.status);

          setExportTaskProgress(data.data.progress);

          setExportTaskMessage(data.data.message);

          if (data.data.status === 'completed') {

            setExportResult(data.data.result);

            setExporting(false);

          } else if (data.data.status === 'failed') {

            setExportError(data.data.message);

            setExporting(false);

          }

        }

      } catch {

        // 忽略轮询错误

      }

    };



    pollStatus();

    exportPollTimerRef.current = setInterval(pollStatus, 2000);



    return () => {

      if (exportPollTimerRef.current) {

        clearInterval(exportPollTimerRef.current);

        exportPollTimerRef.current = null;

      }

    };

  }, [exportTaskId, exportTaskStatus]);



  const totalPages = Math.ceil(total / PAGE_SIZE);

  const available = total - packedCount;

  const assignedIds = new Set(group.assigned_groups.map(g => g.id));

  const unassigned = allCollectorGroups.filter(g => !assignedIds.has(g.id));



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-md">

        <SubHeader title={group.name} onBack={onBack} />



        {/* 地区设置 */}

        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">

          <div className="flex items-center justify-between mb-3">

            <h3 className="text-sm font-bold text-slate-700">导出地区（拼音）</h3>

            {savedPinyinRegion && !editingRegion && (

              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">

                ✓ {savedPinyinRegion}

              </span>

            )}

          </div>

          {editingRegion ? (

            <div className="flex gap-2">

              <input type="text" value={regionInput} onChange={e => setRegionInput(e.target.value)}

                placeholder="如: quanzhou, xiamen"

                className="flex-1 px-3 py-2 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-400" />

              <button onClick={handleSaveRegion} disabled={savingRegion}

                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg font-bold text-sm transition-all">

                {savingRegion ? '保存中...' : '保存'}

              </button>

              <button onClick={() => { setEditingRegion(false); setRegionInput(savedPinyinRegion || ''); }}

                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg font-bold text-sm transition-all">

                取消

              </button>

            </div>

          ) : (

            <button onClick={() => setEditingRegion(true)}

              className="w-full px-4 py-2 text-sm border border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-green-400 hover:text-green-600 font-medium transition-colors">

              {savedPinyinRegion ? '修改地区' : '设置地区（必填）'}

            </button>

          )}

        </div>



        {/* 导出按钮 */}

        <button onClick={openExportDialog} disabled={exporting || !savedPinyinRegion}

          className="w-full mb-4 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95">

          {exporting ? <Loader2 className="animate-spin w-5 h-5" /> : <DownloadIcon className="w-5 h-5" />}

          {exporting ? '导出中...' : '导出为标准格式'}

        </button>

        <button onClick={() => setShowCollectionExportDialog(true)} disabled={exporting}
          className="w-full mb-4 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95">
          {exporting ? <Loader2 className="animate-spin w-5 h-5" /> : <DownloadIcon className="w-5 h-5" />}
          导出采集通过包
        </button>

        {exportError && !showExportDialog && (

          <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-2xl">

            <p className="text-red-700 text-sm">{exportError}</p>

          </div>

        )}



        {/* 导出采集包对话框 */}
        {showCollectionExportDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-800">导出采集通过包</h3>
                <p className="text-xs text-slate-500 mt-1">提取当前语料组中所有通过采集审核的包，生成免标注格式的录音压缩包。</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">采集类型 <span className="text-red-500">*</span></label>
                  <input type="text" value={collectionType} onChange={e => setCollectionType(e.target.value)}
                    placeholder="例如：方言采集、普通话采集..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">语种 <span className="text-red-500">*</span></label>
                  <input type="text" value={language} onChange={e => setLanguage(e.target.value)}
                    placeholder="例如：闽南语、粤语..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                {exportError && (
                  <p className="text-red-600 text-sm">{exportError}</p>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowCollectionExportDialog(false)}
                    className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold">取消</button>
                  <button onClick={handleCollectionExport} disabled={exporting}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50">
                    {exporting ? '启动中...' : '开始导出'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 导出对话框 */}

        {showExportDialog && (

          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">

              <div className="p-4 border-b border-slate-200">

                <h3 className="text-lg font-bold text-slate-800">

                  {exportResult ? '导出成功' : exportTaskId ? '导出中...' : '导出语料组'}

                </h3>

              </div>

              <div className="p-4 flex-1 overflow-y-auto">

                {/* 异步任务进度 */}

                {exportTaskId && !exportResult && exportTaskStatus !== 'failed' && (

                  <div className="space-y-4">

                    <div className="text-center py-4">

                      <Loader2 className="animate-spin w-10 h-10 text-violet-500 mx-auto mb-3" />

                      <p className="text-sm text-slate-600">{exportTaskMessage}</p>

                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-3">

                      <div

                        className="bg-violet-500 h-3 rounded-full transition-all duration-300"

                        style={{ width: `${exportTaskProgress}%` }}

                      />

                    </div>

                    <p className="text-center text-sm text-slate-600">{exportTaskProgress}%</p>

                  </div>

                )}



                {/* 导出成功 - 显示下载链接 */}

                {exportResult ? (

                  <div className="space-y-4">

                    <div className="text-center py-4">

                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">

                        <DownloadIcon className="w-8 h-8 text-green-600" />

                      </div>

                      <p className="text-sm text-slate-600 mb-1">共导出 <span className="font-bold text-green-600">{exportResult.total_files}</span> 个文件</p>

                      <p className="text-xs text-slate-400">{exportResult.filename}</p>

                    </div>

                    <a href={exportResult.download_url} target="_blank" rel="noopener noreferrer"

                      className="block w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm text-center transition-all active:scale-95">

                      点击下载

                    </a>

                    <div className="p-3 bg-slate-50 rounded-lg break-all">

                      <p className="text-xs text-slate-400 mb-1">下载链接：</p>

                      <p className="text-xs text-blue-600 select-all">{exportResult.download_url}</p>

                    </div>

                  </div>

                ) : !exportTaskId ? (

                  <>

                    {/* 导出模式选择 */}

                    <div className="space-y-3 mb-4">

                      <label className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all"

                        style={{ borderColor: exportMode === 'all_completed' ? '#22c55e' : '#e2e8f0' }}

                        onClick={() => setExportMode('all_completed')}>

                        <input type="radio" name="exportMode" checked={exportMode === 'all_completed'}

                          onChange={() => setExportMode('all_completed')}

                          className="w-4 h-4 text-green-600" />

                        <div>

                          <p className="font-bold text-sm text-slate-700">导出所有已完成的包</p>

                          <p className="text-xs text-slate-500">导出语料组中所有通过质检审核的包</p>

                        </div>

                      </label>

                      <label className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all"

                        style={{ borderColor: exportMode === 'selected' ? '#22c55e' : '#e2e8f0' }}

                        onClick={() => setExportMode('selected')}>

                        <input type="radio" name="exportMode" checked={exportMode === 'selected'}

                          onChange={() => setExportMode('selected')}

                          className="w-4 h-4 text-green-600" />

                        <div>

                          <p className="font-bold text-sm text-slate-700">自选包导出</p>

                          <p className="text-xs text-slate-500">手动选择要导出的包</p>

                        </div>

                      </label>

                    </div>



                    {/* 自选包列表 */}

                    {exportMode === 'selected' && (

                      <div className="border border-slate-200 rounded-lg overflow-hidden">

                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">

                          <span className="text-xs font-bold text-slate-600">

                            可导出的包 ({exportablePackages.length})

                          </span>

                          <button onClick={() => {

                            if (exportSelectedPackages.size === exportablePackages.length) {

                              setExportSelectedPackages(new Set());

                            } else {

                              setExportSelectedPackages(new Set(exportablePackages.map(p => p.id)));

                            }

                          }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">

                            {exportSelectedPackages.size === exportablePackages.length ? '取消全选' : '全选'}

                          </button>

                        </div>

                        {exportableLoading ? (

                          <div className="p-6 text-center text-slate-400 text-sm">加载中...</div>

                        ) : exportablePackages.length === 0 ? (

                          <div className="p-6 text-center text-slate-400 text-sm">暂无可导出的包</div>

                        ) : (

                          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">

                            {exportablePackages.map(pkg => (

                              <label key={pkg.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                                <input type="checkbox"

                                  checked={exportSelectedPackages.has(pkg.id)}

                                  onChange={() => {

                                    setExportSelectedPackages(prev => {

                                      const s = new Set(prev);

                                      s.has(pkg.id) ? s.delete(pkg.id) : s.add(pkg.id);

                                      return s;

                                    });

                                  }}

                                  className="w-4 h-4 text-green-600 rounded" />

                                <div className="flex-1 min-w-0">

                                  <p className="text-sm font-medium text-slate-700 truncate">{pkg.name}</p>

                                  <p className="text-xs text-slate-400">{pkg.collector_real_name || '未知采集员'}</p>

                                </div>

                                <span className="text-xs text-slate-300">#{pkg.id}</span>

                              </label>

                            ))}

                          </div>

                        )}

                        {exportMode === 'selected' && exportSelectedPackages.size > 0 && (

                          <div className="p-3 bg-green-50 border-t border-green-200">

                            <p className="text-xs text-green-700 font-medium">已选择 {exportSelectedPackages.size} 个包</p>

                          </div>

                        )}

                      </div>

                    )}



                    {/* 错误提示 */}

                    {exportError && (

                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">

                        <p className="text-red-700 text-sm">{exportError}</p>

                      </div>

                    )}

                  </>

                ) : null}



                {/* 任务失败 */}

                {exportTaskStatus === 'failed' && (

                  <div className="text-center py-4">

                    <p className="text-red-600 mb-2">导出失败</p>

                    <p className="text-sm text-slate-600">{exportError || exportTaskMessage}</p>

                  </div>

                )}

              </div>

              <div className="p-4 border-t border-slate-200 flex gap-3">

                <button onClick={() => { setShowExportDialog(false); setExportResult(null); setExportTaskId(null); setExportTaskStatus(null); }}

                  className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-sm transition-all">

                  {exportResult || exportTaskStatus === 'failed' ? '关闭' : '取消'}

                </button>

                {!exportResult && !exportTaskId && (

                  <button onClick={handleExport}

                    disabled={exporting || (exportMode === 'selected' && exportSelectedPackages.size === 0)}

                    className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all">

                    {exporting ? <Loader2 className="animate-spin w-4 h-4" /> : <DownloadIcon className="w-4 h-4" />}

                    {exporting ? '启动中...' : '开始导出'}

                  </button>

                )}

              </div>

            </div>

          </div>

        )}



        {/* 批量替换 */}

        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">

          <button onClick={() => setShowReplace(!showReplace)}

            className="w-full flex items-center justify-between text-sm font-bold text-slate-700">

            <span>批量替换语料文本</span>

            <span className="text-slate-400">{showReplace ? '▲' : '▼'}</span>

          </button>

          {showReplace && (

            <div className="mt-3 space-y-3">

              <div>

                <label className="block text-xs text-slate-500 mb-1">查找内容</label>

                <input type="text" value={findText} onChange={e => setFindText(e.target.value)}

                  placeholder="输入要替换的文本"

                  className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300" />

              </div>

              <div>

                <label className="block text-xs text-slate-500 mb-1">替换为</label>

                <input type="text" value={replaceText} onChange={e => setReplaceText(e.target.value)}

                  placeholder="输入新的文本（留空则删除）"

                  className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300" />

              </div>

              <button onClick={handleBatchReplace} disabled={replacing || !findText}

                className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg font-bold text-sm transition-all">

                {replacing ? '替换中...' : '执行替换'}

              </button>

              {replaceResult && <p className="text-sm text-green-600">{replaceResult}</p>}

              {replaceError && <p className="text-sm text-red-600">{replaceError}</p>}

            </div>

          )}

        </div>



        {/* Tab 切换 */}

        <div className="flex bg-white rounded-2xl shadow-sm p-1.5 mb-4 gap-1">

          {([['corpus', '语料', FileText], ['packages', '语料包', Package], ['assign', '分配管理', Layers]] as const).map(([key, label, Icon]) => (

            <button key={key} onClick={() => setTab(key)}

              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-all

                ${tab === key ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50'}`}>

              <Icon className="w-4 h-4" />{label}

            </button>

          ))}

        </div>



        {/* ── Tab: 语料 ── */}

        {tab === 'corpus' && (

          <>

            {/* 统计条 */}

            <div className="grid grid-cols-3 gap-3 mb-4">

              {[

                { label: '总语料', val: total, color: 'violet' },

                { label: '已打包', val: packedCount, color: 'amber' },

                { label: '可用', val: available, color: 'green' },

              ].map(s => (

                <div key={s.label} className="bg-white rounded-2xl shadow-sm p-4 text-center">

                  <p className={`text-2xl font-bold text-${s.color}-600`}>{s.val}</p>

                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>

                </div>

              ))}

            </div>



            {/* 上传区 */}

            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                <Upload className="w-4 h-4 text-violet-600" />上传语料

              </h3>

              <div

                onClick={() => inputRef.current?.click()}

                onDragOver={e => { e.preventDefault(); setDragging(true); }}

                onDragLeave={() => setDragging(false)}

                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) selectFile(f); }}

                className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center cursor-pointer transition-all select-none

                  ${dragging ? 'border-violet-400 bg-violet-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50'}`}

              >

                <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden"

                  onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); e.target.value = ''; }} />

                {file ? (

                  <>

                    <FileText className="w-8 h-8 text-green-500 mb-2" />

                    <p className="text-sm font-semibold text-green-700">{file.name}</p>

                    <p className="text-xs text-green-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>

                  </>

                ) : (

                  <>

                    <Upload className="w-8 h-8 text-slate-300 mb-2" />

                    <p className="text-sm font-semibold text-slate-500">点击或拖拽 CSV / XLSX 文件</p>

                    <p className="text-xs text-slate-400 mt-0.5">第一列 ID，第二列内容</p>

                  </>

                )}

              </div>

              {uploadError && <p className="text-red-500 text-sm mt-2">{uploadError}</p>}

              {uploadResult && (

                <div className="mt-2 bg-green-50 border border-green-100 rounded-xl p-3">

                  <p className="text-green-700 text-sm font-semibold flex items-center gap-1 mb-2">

                    <CheckCircle className="w-4 h-4" />上传完成

                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center">

                    <div><p className="text-lg font-bold text-green-600">{uploadResult.added}</p><p className="text-xs text-slate-400">新增</p></div>

                    <div><p className="text-lg font-bold text-amber-500">{uploadResult.skipped}</p><p className="text-xs text-slate-400">跳过</p></div>

                    <div><p className="text-lg font-bold text-slate-400">{uploadResult.invalid}</p><p className="text-xs text-slate-400">无效</p></div>

                  </div>

                </div>

              )}

              <button onClick={handleUpload} disabled={!file || uploading}

                className="w-full mt-3 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                {uploading ? <Loader2 className="animate-spin w-5 h-5" /> : '开始上传'}

              </button>

            </div>



            {/* 语料列表 */}

            <div className="bg-white rounded-2xl shadow-sm p-5">

              <div className="flex items-center justify-between mb-3">

                <h3 className="text-sm font-bold text-slate-700">语料列表 ({total} 条)</h3>

                <div className="flex gap-2">

                  <button onClick={handleClearUnpacked} disabled={clearing || total === packedCount}

                    className="text-xs px-3 py-1.5 rounded-lg font-medium bg-orange-50 text-orange-600 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"

                    title="一键删除所有未打包的语料，已打包语料不受影响">

                    {clearing ? '清空中...' : '清空未打包'}

                  </button>

                  <button onClick={() => { setBulkMode(b => !b); setSelected(new Set()); }}

                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${bulkMode ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-600'}`}>

                    {bulkMode ? '退出勾选' : '批量删除'}

                  </button>

                </div>

              </div>

              {corpusLoading ? (

                <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

              ) : corpus.length === 0 ? (

                <p className="text-center text-slate-400 text-sm py-8">暂无语料，请上传 CSV 或 XLSX</p>

              ) : (

                <ul className="divide-y divide-slate-50">

                  {corpus.map(item => (

                    <li key={item.id} className="py-3 flex items-start gap-3">

                      {bulkMode && (

                        <input type="checkbox" checked={selected.has(item.id)}

                          onChange={() => toggleSelect(item.id)}

                          className="mt-1 w-4 h-4 accent-violet-600 shrink-0" />

                      )}

                      <div className="flex-1 min-w-0">

                        <div className="flex items-center gap-2 mb-0.5">

                          <p className="text-xs text-violet-500 font-mono">{item.text_id}</p>

                          {item.packaged && (

                            <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">已打包</span>

                          )}

                        </div>

                        <p className="text-sm text-slate-700 line-clamp-2">{item.content}</p>

                      </div>

                      {!bulkMode && (

                        <button onClick={() => handleDeleteCorpus(item.id)}

                          disabled={item.packaged}

                          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">

                          <Trash2 className="w-4 h-4" />

                        </button>

                      )}

                    </li>

                  ))}

                </ul>

              )}

              {totalPages > 1 && (

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-50">

                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}

                    className="px-4 py-2 text-sm bg-slate-100 rounded-xl disabled:opacity-40 hover:bg-violet-50 hover:text-violet-600 transition-colors">

                    上一页

                  </button>

                  <span className="text-xs text-slate-400">{page + 1} / {totalPages}</span>

                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}

                    className="px-4 py-2 text-sm bg-slate-100 rounded-xl disabled:opacity-40 hover:bg-violet-50 hover:text-violet-600 transition-colors">

                    下一页

                  </button>

                </div>

              )}

              {bulkMode && selected.size > 0 && (

                <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center justify-between">

                  <p className="text-sm text-red-600">已选 {selected.size} 条</p>

                  <button onClick={handleBulkDelete}

                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors">

                    确认删除

                  </button>

                </div>

              )}

            </div>

          </>

        )}



        {/* ── Tab: 语料包 ── */}

        {tab === 'packages' && (

          <>

            {/* 包状态统计 */}

            <div className="grid grid-cols-3 gap-3 mb-4">

              {[

                { label: '未领取', val: pkgStatusCounts['未领取'], color: 'slate' },

                { label: '已领取', val: pkgStatusCounts['已领取'], color: 'amber' },

                { label: '已完成', val: pkgStatusCounts['已完成'], color: 'green' },

              ].map(s => (

                <div key={s.label} className="bg-white rounded-2xl shadow-sm p-4 text-center">

                  <p className={`text-2xl font-bold text-${s.color}-600`}>{s.val}</p>

                  <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>

                </div>

              ))}

            </div>



            {/* 新建语料包 */}

            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

                <Plus className="w-4 h-4 text-violet-600" />新建语料包

              </h3>

              <form onSubmit={handleCreatePkg} className="space-y-3">

                <input type="text" placeholder="语料包名称前缀（多包时自动从最大序号继续编号）" value={pkgName}

                  onChange={e => setPkgName(e.target.value)}

                  className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                <div className="grid grid-cols-2 gap-3">

                  <div>

                    <label className="block text-xs text-slate-500 mb-1 pl-1">每包语料条数</label>

                    <input type="number" placeholder="条数" value={pkgSize}

                      min={1} onChange={e => setPkgSize(e.target.value)}

                      className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                  </div>

                  <div>

                    <label className="block text-xs text-slate-500 mb-1 pl-1">创建包数</label>

                    <input type="number" placeholder="包数" value={pkgCount}

                      min={1} onChange={e => setPkgCount(e.target.value)}

                      className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

                  </div>

                </div>

                {pkgSize && pkgCount && (

                  <p className="text-xs text-slate-400 pl-1">

                    共消耗 <b className="text-violet-600">{(parseInt(pkgSize) || 0) * (parseInt(pkgCount) || 0)}</b> 条语料，可用 <b>{available}</b> 条

                  </p>

                )}

                {pkgError && <p className="text-red-500 text-sm">{pkgError}</p>}

                <button type="submit" disabled={pkgCreating || available === 0}

                  className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                  {pkgCreating ? <Loader2 className="animate-spin w-5 h-5" /> : `创建 ${parseInt(pkgCount) || 1} 个语料包`}

                </button>

              </form>

            </div>



            {/* 包列表 */}

            <div className="bg-white rounded-2xl shadow-sm p-5">

              <div className="flex items-center justify-between mb-3">

                <h3 className="text-sm font-bold text-slate-700">语料包列表</h3>

                {selectedPackages.size > 0 && (

                  <div className="flex items-center gap-2">

                    <span className="text-xs text-slate-500">已选 {selectedPackages.size} 个</span>

                    <button

                      onClick={async () => {

                        if (!window.confirm(`确认删除选中的 ${selectedPackages.size} 个语料包？`)) return;

                        setBatchDeleting(true);

                        try {

                          const res = await apiFetch(getApiUrl('/admin/corpus-packages/batch-delete'), {

                            method: 'POST',

                            headers: { 'Content-Type': 'application/json' },

                            body: JSON.stringify({ package_ids: Array.from(selectedPackages) })

                          });

                          const json = await res.json();

                          if (!res.ok) { alert(json.detail ?? '删除失败'); return; }

                          setSelectedPackages(new Set());

                          setPkgPage(0); fetchPackages(0); onRefreshGroups();

                        } catch { alert('网络异常'); }

                        finally { setBatchDeleting(false); }

                      }}

                      disabled={batchDeleting}

                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-xs font-medium rounded-lg transition-colors"

                    >

                      {batchDeleting ? '删除中...' : '批量删除'}

                    </button>

                  </div>

                )}

              </div>



              {/* 操作按钮 */}

              <div className="mb-3 flex gap-2">

                {/* 删除所有未领取按钮 */}

                {pkgStatusCounts['未领取'] > 0 && selectedPackages.size === 0 && (

                  <button

                    onClick={async () => {

                      if (!window.confirm(`确认删除所有 ${pkgStatusCounts['未领取']} 个未领取的语料包？`)) return;

                      setDeletingAllUnclaimed(true);

                      try {

                        const res = await apiFetch(getApiUrl(`/admin/corpus-packages/unclaimed?corpus_group_id=${group.id}`), {

                          method: 'DELETE'

                        });

                        const json = await res.json();

                        if (!res.ok) { alert(json.detail ?? '删除失败'); return; }

                        setPkgPage(0); fetchPackages(0); onRefreshGroups();

                      } catch { alert('网络异常'); }

                      finally { setDeletingAllUnclaimed(false); }

                    }}

                    disabled={deletingAllUnclaimed}

                    className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:bg-red-100 text-red-700 text-xs font-medium rounded-lg transition-colors"

                  >

                    {deletingAllUnclaimed ? '删除中...' : `删除所有未领取 (${pkgStatusCounts['未领取']})`}

                  </button>

                )}



                {/* 重新排列序号按钮 */}

                <button

                  onClick={async () => {

                    if (!window.confirm('确认重新排列所有语料包的序号？\n\n这将按前缀分组并重新编号，例如：\n- 测试包 #1, 测试包 #2, 测试包 #3\n- 其他包 #1, 其他包 #2')) return;

                    setRearranging(true);

                    try {

                      const res = await apiFetch(getApiUrl(`/admin/corpus-packages/rearrange?corpus_group_id=${group.id}`), {

                        method: 'POST'

                      });

                      const json = await res.json();

                      if (!res.ok) { alert(json.detail ?? '重新排列失败'); return; }

                      alert(json.msg);

                      setPkgPage(0); fetchPackages(0);

                    } catch { alert('网络异常'); }

                    finally { setRearranging(false); }

                  }}

                  disabled={rearranging}

                  className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 disabled:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"

                >

                  {rearranging ? '排列中...' : '重新排列序号'}

                </button>

              </div>



              {pkgLoading ? (

                <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

              ) : packages.length === 0 ? (

                <p className="text-center text-slate-400 text-sm py-6">暂无语料包</p>

              ) : (

                <ul className="space-y-2">

                  {packages.map(pkg => (

                    <li key={pkg.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">

                      <div className="flex items-center gap-3">

                        <input

                          type="checkbox"

                          checked={selectedPackages.has(pkg.id)}

                          onChange={() => {

                            setSelectedPackages(prev => {

                              const next = new Set(prev);

                              if (next.has(pkg.id)) {

                                next.delete(pkg.id);

                              } else {

                                next.add(pkg.id);

                              }

                              return next;

                            });

                          }}

                          disabled={pkg.status !== '未领取'}

                          className="w-4 h-4 accent-violet-600 disabled:opacity-30"

                        />

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center gap-2 mb-1">

                            <p className="text-sm font-semibold text-slate-800 truncate">{pkg.name}</p>

                          </div>

                          <div className="flex flex-wrap gap-1 mb-1">

                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pkg.status === '已完成' ? 'bg-green-100 text-green-600' : pkg.status === '已领取' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>

                              采集{pkg.status === '已完成' ? '✓' : pkg.status === '已领取' ? '...' : ''}

                            </span>

                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pkg.annotation_status === '已标注' ? 'bg-green-100 text-green-600' : pkg.annotation_status === '待标注' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>

                              标注{pkg.annotation_status === '已标注' ? '✓' : pkg.annotation_status === '待标注' ? '...' : ''}

                            </span>

                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pkg.quality_status === '已质检' ? 'bg-green-100 text-green-600' : pkg.quality_status === '待质检' ? 'bg-amber-100 text-amber-600' : pkg.quality_status === '已打回' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>

                              质检{pkg.quality_status === '已质检' ? '✓' : pkg.quality_status === '待质检' ? '...' : pkg.quality_status === '已打回' ? '!' : ''}

                            </span>

                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pkg.quality_review_status === '已合格' ? 'bg-green-100 text-green-600' : pkg.quality_review_status === '待审核' ? 'bg-amber-100 text-amber-600' : pkg.quality_review_status === '已打回' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>

                              质检审核{pkg.quality_review_status === '已合格' ? '✓' : pkg.quality_review_status === '待审核' ? '...' : pkg.quality_review_status === '已打回' ? '!' : ''}

                            </span>

                          </div>

                          <p className="text-xs text-slate-400">

                            {pkg.size} 条 · {pkg.created_at}

                            {pkg.claimed_by_name && ` · ${pkg.claimed_by_name} 领取`}

                          </p>

                        </div>

                      </div>

                      <button onClick={() => handleDeletePkg(pkg.id, pkg.name)}

                        disabled={pkg.status !== '未领取'}

                        className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-2 shrink-0">

                        <Trash2 className="w-4 h-4" />

                      </button>

                    </li>

                  ))}

                </ul>

              )}

              <Pagination page={pkgPage} total={pkgTotal} pageSize={PKG_PAGE_SIZE} onPageChange={(p) => { setPkgPage(p); fetchPackages(p); }} />

            </div>

          </>

        )}



        {/* ── Tab: 采集组分配 ── */}

        {tab === 'assign' && (

          <>

            {/* 分配管理 Sub-Tab */}

            <div className="flex gap-2 mb-6 border-b border-slate-200">

              {[

                { key: 'collector' as AssignSubTab, label: '采集组' },

                { key: 'annotator' as AssignSubTab, label: '标注组' },

                { key: 'inspector' as AssignSubTab, label: '质检组' },

                { key: 'reviewer' as AssignSubTab, label: '采集审核组' },

                { key: 'quality_reviewer' as AssignSubTab, label: '质检审核组' },

              ].map(item => (

                <button key={item.key}

                  onClick={() => setAssignSubTab(item.key)}

                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${assignSubTab === item.key

                    ? 'text-violet-600 border-violet-600'

                    : 'text-slate-600 border-transparent hover:text-slate-800'

                    }`}>

                  {item.label}

                </button>

              ))}

            </div>



            {/* 采集组分配内容 */}

            {assignSubTab === 'collector' && (

              <>

                {/* 已分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h3 className="text-sm font-bold text-slate-700 mb-3">已分配的采集组</h3>

                  {group.assigned_groups.length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-4">尚未分配给任何采��组</p>

                  ) : (

                    <ul className="space-y-2">

                      {group.assigned_groups.map(ag => {

                        const full = allCollectorGroups.find(g => g.id === ag.id);

                        return (

                          <li key={ag.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">

                            <div>

                              <p className="text-sm font-semibold text-slate-800">{ag.name}</p>

                              {full && <p className="text-xs text-slate-400">{full.member_count} 名成员</p>}

                            </div>

                            <button onClick={() => handleUnassign(ag.id)}

                              className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                              <X className="w-4 h-4" />

                            </button>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>



                {/* 添加分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />分配给采集组

                  </h3>

                  {unassigned.length === 0 ? (

                    <p className="text-slate-400 text-sm text-center py-4">所有采集组均已分配，或尚未创建采集组</p>

                  ) : (

                    <>

                      <div className="space-y-2 mb-4">

                        {unassigned.map(g => (

                          <label key={g.id} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">

                            <input type="checkbox" checked={assignSelected.has(g.id)}

                              onChange={() => {

                                setAssignSelected(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s; });

                              }}

                              className="w-4 h-4 accent-violet-600" />

                            <div>

                              <p className="text-sm font-medium text-slate-800">{g.name}</p>

                              <p className="text-xs text-slate-400">{g.member_count} 名成员</p>

                            </div>

                          </label>

                        ))}

                      </div>

                      <button onClick={handleAssign} disabled={assignSelected.size === 0 || assigning}

                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                        {assigning ? <Loader2 className="animate-spin w-5 h-5" /> : `分配给 ${assignSelected.size} 个采集组`}

                      </button>

                    </>

                  )}

                </div>

              </>

            )}



            {/* 标注组分配内容 */}

            {assignSubTab === 'annotator' && (

              <>

                {/* 已分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h3 className="text-sm font-bold text-slate-700 mb-3">已分配的标注组</h3>

                  {group.annotator_groups.length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-4">尚未分配给任何标注组</p>

                  ) : (

                    <ul className="space-y-2">

                      {group.annotator_groups.map(ag => {

                        const full = allAnnotatorGroups.find(g => g.id === ag.id);

                        return (

                          <li key={ag.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">

                            <div>

                              <p className="text-sm font-semibold text-slate-800">{ag.name}</p>

                              {full && <p className="text-xs text-slate-400">{full.member_count} 名成员</p>}

                            </div>

                            <button onClick={() => handleAnnotatorUnassign(ag.id)}

                              className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                              <X className="w-4 h-4" />

                            </button>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>



                {/* 添加分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />分配给标注组

                  </h3>

                  {allAnnotatorGroups.filter(g => !new Set(group.annotator_groups.map(ag => ag.id)).has(g.id)).length === 0 ? (

                    <p className="text-slate-400 text-sm text-center py-4">所有标注组均已分配，或尚未创建标注组</p>

                  ) : (

                    <>

                      <div className="space-y-2 mb-4">

                        {allAnnotatorGroups.filter(g => !new Set(group.annotator_groups.map(ag => ag.id)).has(g.id)).map(g => (

                          <label key={g.id} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">

                            <input type="checkbox" checked={annotatorAssignSelected.has(g.id)}

                              onChange={() => {

                                setAnnotatorAssignSelected(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s; });

                              }}

                              className="w-4 h-4 accent-violet-600" />

                            <div>

                              <p className="text-sm font-medium text-slate-800">{g.name}</p>

                              <p className="text-xs text-slate-400">{g.member_count} 名成员</p>

                            </div>

                          </label>

                        ))}

                      </div>

                      <button onClick={handleAnnotatorAssign} disabled={annotatorAssignSelected.size === 0 || annotatorAssigning}

                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                        {annotatorAssigning ? <Loader2 className="animate-spin w-5 h-5" /> : `分配给 ${annotatorAssignSelected.size} 个标注组`}

                      </button>

                    </>

                  )}

                </div>

              </>

            )}



            {/* 质检组分配内容 */}

            {assignSubTab === 'inspector' && (

              <>

                {/* 已分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h3 className="text-sm font-bold text-slate-700 mb-3">已分配的质检组</h3>

                  {group.inspector_groups.length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-4">尚未分配给任何质检组</p>

                  ) : (

                    <ul className="space-y-2">

                      {group.inspector_groups.map(ig => {

                        const full = allInspectorGroups.find(g => g.id === ig.id);

                        return (

                          <li key={ig.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">

                            <div>

                              <p className="text-sm font-semibold text-slate-800">{ig.name}</p>

                              {full && <p className="text-xs text-slate-400">{full.member_count} 名成员</p>}

                            </div>

                            <button onClick={() => handleInspectorUnassign(ig.id)}

                              className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                              <X className="w-4 h-4" />

                            </button>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>



                {/* 添加分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />分配给质检组

                  </h3>

                  {allInspectorGroups.filter(g => !new Set(group.inspector_groups.map(ig => ig.id)).has(g.id)).length === 0 ? (

                    <p className="text-slate-400 text-sm text-center py-4">所有质检组均已分配，或尚未创建质检组</p>

                  ) : (

                    <>

                      <div className="space-y-2 mb-4">

                        {allInspectorGroups.filter(g => !new Set(group.inspector_groups.map(ig => ig.id)).has(g.id)).map(g => (

                          <label key={g.id} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">

                            <input type="checkbox" checked={inspectorAssignSelected.has(g.id)}

                              onChange={() => {

                                setInspectorAssignSelected(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s; });

                              }}

                              className="w-4 h-4 accent-violet-600" />

                            <div>

                              <p className="text-sm font-medium text-slate-800">{g.name}</p>

                              <p className="text-xs text-slate-400">{g.member_count} 名成员</p>

                            </div>

                          </label>

                        ))}

                      </div>

                      <button onClick={handleInspectorAssign} disabled={inspectorAssignSelected.size === 0 || inspectorAssigning}

                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                        {inspectorAssigning ? <Loader2 className="animate-spin w-5 h-5" /> : `分配给 ${inspectorAssignSelected.size} 个质检组`}

                      </button>

                    </>

                  )}

                </div>

              </>

            )}



            {/* 审核组分配内容 */}

            {assignSubTab === 'reviewer' && (

              <>

                {/* 已分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h3 className="text-sm font-bold text-slate-700 mb-3">已分配的审核组</h3>

                  {group.reviewer_groups.length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-4">尚未分配给任何审核组</p>

                  ) : (

                    <ul className="space-y-2">

                      {group.reviewer_groups.map(rg => {

                        const full = allReviewerGroups.find(g => g.id === rg.id);

                        return (

                          <li key={rg.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">

                            <div>

                              <p className="text-sm font-semibold text-slate-800">{rg.name}</p>

                              {full && <p className="text-xs text-slate-400">{full.member_count} 名成员</p>}

                            </div>

                            <button onClick={() => handleReviewerUnassign(rg.id)}

                              className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                              <X className="w-4 h-4" />

                            </button>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>



                {/* 添加分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />分配给审核组

                  </h3>

                  {allReviewerGroups.filter(g => !new Set(group.reviewer_groups.map(rg => rg.id)).has(g.id)).length === 0 ? (

                    <p className="text-slate-400 text-sm text-center py-4">所有审核组均已分配，或尚未创建审核组</p>

                  ) : (

                    <>

                      <div className="space-y-2 mb-4">

                        {allReviewerGroups.filter(g => !new Set(group.reviewer_groups.map(rg => rg.id)).has(g.id)).map(g => (

                          <label key={g.id} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">

                            <input type="checkbox" checked={reviewerAssignSelected.has(g.id)}

                              onChange={() => {

                                setReviewerAssignSelected(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s; });

                              }}

                              className="w-4 h-4 accent-violet-600" />

                            <div>

                              <p className="text-sm font-medium text-slate-800">{g.name}</p>

                              <p className="text-xs text-slate-400">{g.member_count} 名成员</p>

                            </div>

                          </label>

                        ))}

                      </div>

                      <button onClick={handleReviewerAssign} disabled={reviewerAssignSelected.size === 0 || reviewerAssigning}

                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                        {reviewerAssigning ? <Loader2 className="animate-spin w-5 h-5" /> : `分配给 ${reviewerAssignSelected.size} 个审核组`}

                      </button>

                    </>

                  )}

                </div>

              </>

            )}



            {/* 质检审核组分配内容 */}

            {assignSubTab === 'quality_reviewer' && (

              <>

                {/* 已分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

                  <h3 className="text-sm font-bold text-slate-700 mb-3">已分配的质检审核组</h3>

                  {group.quality_reviewer_groups.length === 0 ? (

                    <p className="text-center text-slate-400 text-sm py-4">尚未分配给任何质检审核组</p>

                  ) : (

                    <ul className="space-y-2">

                      {group.quality_reviewer_groups.map(qrg => {

                        const full = allQualityReviewerGroups.find(g => g.id === qrg.id);

                        return (

                          <li key={qrg.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">

                            <div>

                              <p className="text-sm font-semibold text-slate-800">{qrg.name}</p>

                              {full && <p className="text-xs text-slate-400">{full.member_count} 名成员</p>}

                            </div>

                            <button onClick={() => handleQualityReviewerUnassign(qrg.id)}

                              className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                              <X className="w-4 h-4" />

                            </button>

                          </li>

                        );

                      })}

                    </ul>

                  )}

                </div>



                {/* 添加分配 */}

                <div className="bg-white rounded-2xl shadow-sm p-5">

                  <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">

                    <Plus className="w-4 h-4 text-violet-600" />分配给质检审核组

                  </h3>

                  {allQualityReviewerGroups.filter(g => !new Set(group.quality_reviewer_groups.map(qrg => qrg.id)).has(g.id)).length === 0 ? (

                    <p className="text-slate-400 text-sm text-center py-4">所有质检审核组均已分配，或尚未创建质检审核组</p>

                  ) : (

                    <>

                      <div className="space-y-2 mb-4">

                        {allQualityReviewerGroups.filter(g => !new Set(group.quality_reviewer_groups.map(qrg => qrg.id)).has(g.id)).map(g => (

                          <label key={g.id} className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">

                            <input type="checkbox" checked={qualityReviewerAssignSelected.has(g.id)}

                              onChange={() => {

                                setQualityReviewerAssignSelected(prev => { const s = new Set(prev); s.has(g.id) ? s.delete(g.id) : s.add(g.id); return s; });

                              }}

                              className="w-4 h-4 accent-violet-600" />

                            <div>

                              <p className="text-sm font-medium text-slate-800">{g.name}</p>

                              <p className="text-xs text-slate-400">{g.member_count} 名成员</p>

                            </div>

                          </label>

                        ))}

                      </div>

                      <button onClick={handleQualityReviewerAssign} disabled={qualityReviewerAssignSelected.size === 0 || qualityReviewerAssigning}

                        className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                        {qualityReviewerAssigning ? <Loader2 className="animate-spin w-5 h-5" /> : `分配给 ${qualityReviewerAssignSelected.size} 个质检审核组`}

                      </button>

                    </>

                  )}

                </div>

              </>

            )}

          </>

        )}

      </div>

    </div>

  );

};



// ── 语料组列表 ────────────────────────────────────────────────────

const CorpusGroupsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {

  const [groups, setGroups] = useState<CorpusGroupItem[]>([]);

  const [folders, setFolders] = useState<FolderItem[]>([]);

  const [collectorGroups, setCollectorGroups] = useState<CollectorGroupItem[]>([]);

  const [annotatorGroups, setAnnotatorGroups] = useState<CollectorGroupItem[]>([]);

  const [inspectorGroups, setInspectorGroups] = useState<CollectorGroupItem[]>([]);

  const [reviewerGroups, setReviewerGroups] = useState<CollectorGroupItem[]>([]);

  const [qualityReviewerGroups, setQualityReviewerGroups] = useState<CollectorGroupItem[]>([]);

  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState('');

  const [creating, setCreating] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<CorpusGroupItem | null>(null);

  const [cgPage, setCgPage] = useState(0);

  const [cgTotal, setCgTotal] = useState(0);

  const CG_PAGE_SIZE = 100; // 文件夹模式下一次加载更多



  // 文件夹相关状态

  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const [showNewFolder, setShowNewFolder] = useState<'dialect' | 'region' | null>(null);

  const [newFolderName, setNewFolderName] = useState('');

  const [newFolderParent, setNewFolderParent] = useState<number | null>(null);

  const [creatingFolder, setCreatingFolder] = useState(false);

  const [movingGroup, setMovingGroup] = useState<CorpusGroupItem | null>(null);

  const [showMoveDialog, setShowMoveDialog] = useState(false);



  const fetchGroups = useCallback(async (p?: number) => {

    const currentPage = p ?? cgPage;

    setLoading(true);

    try {

      const [cgRes, folderRes, cgrpRes, agrpRes, igrpRes, rgrpRes, qrgrpRes] = await Promise.all([

        apiFetch(getApiUrl(`/admin/corpus-groups?limit=${CG_PAGE_SIZE}&offset=${currentPage * CG_PAGE_SIZE}`)),

        apiFetch(getApiUrl('/admin/corpus-folders')),

        apiFetch(getApiUrl(`/admin/groups?role_type=collector&limit=100`)),

        apiFetch(getApiUrl(`/admin/groups?role_type=annotator&limit=100`)),

        apiFetch(getApiUrl(`/admin/groups?role_type=inspector&limit=100`)),

        apiFetch(getApiUrl(`/admin/groups?role_type=reviewer&limit=100`)),

        apiFetch(getApiUrl(`/admin/groups?role_type=quality_reviewer&limit=100`)),

      ]);

      const cgJson = await cgRes.json();

      const folderJson = await folderRes.json();

      const cgrpJson = await cgrpRes.json();

      const agrpJson = await agrpRes.json();

      const igrpJson = await igrpRes.json();

      const rgrpJson = await rgrpRes.json();

      const qrgrpJson = await qrgrpRes.json();

      setGroups(cgJson.data ?? []);

      setCgTotal(cgJson.total ?? 0);

      setFolders(folderJson.data ?? []);

      setCollectorGroups(cgrpJson.data ?? []);

      setAnnotatorGroups(agrpJson.data ?? []);

      setInspectorGroups(igrpJson.data ?? []);

      setReviewerGroups(rgrpJson.data ?? []);

      setQualityReviewerGroups(qrgrpJson.data ?? []);

    } finally { setLoading(false); }

  }, [cgPage]);



  useEffect(() => { fetchGroups(); }, [fetchGroups]);



  const handleRefresh = useCallback(async () => {

    const [cgRes, folderRes, cgrpRes, agrpRes, igrpRes, rgrpRes, qrgrpRes] = await Promise.all([

      apiFetch(getApiUrl(`/admin/corpus-groups?limit=${CG_PAGE_SIZE}&offset=${cgPage * CG_PAGE_SIZE}`)),

      apiFetch(getApiUrl('/admin/corpus-folders')),

      apiFetch(getApiUrl(`/admin/groups?role_type=collector&limit=100`)),

      apiFetch(getApiUrl(`/admin/groups?role_type=annotator&limit=100`)),

      apiFetch(getApiUrl(`/admin/groups?role_type=inspector&limit=100`)),

      apiFetch(getApiUrl(`/admin/groups?role_type=reviewer&limit=100`)),

      apiFetch(getApiUrl(`/admin/groups?role_type=quality_reviewer&limit=100`)),

    ]);

    const cgJson = await cgRes.json();

    const folderJson = await folderRes.json();

    const cgrpJson = await cgrpRes.json();

    const agrpJson = await agrpRes.json();

    const igrpJson = await igrpRes.json();

    const rgrpJson = await rgrpRes.json();

    const qrgrpJson = await qrgrpRes.json();

    const updated: CorpusGroupItem[] = cgJson.data ?? [];

    setGroups(updated);

    setCgTotal(cgJson.total ?? 0);

    setFolders(folderJson.data ?? []);

    setCollectorGroups(cgrpJson.data ?? []);

    setAnnotatorGroups(agrpJson.data ?? []);

    setInspectorGroups(igrpJson.data ?? []);

    setReviewerGroups(rgrpJson.data ?? []);

    setQualityReviewerGroups(qrgrpJson.data ?? []);

    if (selectedGroup) {

      const refreshed = updated.find(g => g.id === selectedGroup.id);

      if (refreshed) setSelectedGroup(refreshed);

    }

  }, [selectedGroup, cgPage]);



  const handleCreate = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!newName.trim()) return;

    setCreating(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ name: newName.trim() }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '创建失败'); return; }

      setNewName('');

      fetchGroups();

    } catch { alert('网络异常'); }

    finally { setCreating(false); }

  };



  const handleDelete = async (group: CorpusGroupItem) => {

    if (group.corpus_count > 0) {

      const confirm1 = window.confirm(

        `⚠️ 强制删除语料组"${group.name}"？\n\n将永久删除该组内所有内容：\n` +

        `  • ${group.corpus_count} 条语料\n  • ${group.package_count} 个语料包\n\n` +

        `此操作无法撤销！\n\n点击"确定"进行二次确认`

      );

      if (!confirm1) return;

      const confirm2 = window.confirm(

        `最后确认：真的要强制删除语料组"${group.name}"及其所有 ${group.corpus_count} 条语料吗？\n\n无法恢复！`

      );

      if (!confirm2) return;

    } else {

      if (!window.confirm(`确认删除空语料组"${group.name}"？`)) return;

    }

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${group.id}`), { method: 'DELETE' });

      const json = await res.json();

      if (!res.ok) {

        const errorMsg = json.detail ?? (res.status === 500 ? '服务器错误，请检查后端日志' : '删除失败');

        alert(errorMsg);

        return;

      }

      alert('删除成功');

      fetchGroups();

    } catch {

      alert('网络异常，请检查后端服务是否正常运行');

    }

  };



  // 创建文件夹

  const handleCreateFolder = async () => {

    if (!newFolderName.trim()) return;

    setCreatingFolder(true);

    try {

      const level = showNewFolder === 'dialect' ? 1 : 2;

      const res = await apiFetch(getApiUrl('/admin/corpus-folders'), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ name: newFolderName.trim(), level, parent_id: newFolderParent }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '创建失败'); return; }

      setNewFolderName('');

      setShowNewFolder(null);

      setNewFolderParent(null);

      fetchGroups();

    } catch { alert('网络异常'); }

    finally { setCreatingFolder(false); }

  };



  // 删除文件夹

  const handleDeleteFolder = async (folder: FolderItem) => {

    if (!window.confirm(`确认删除文件夹"${folder.name}"？`)) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-folders/${folder.id}`), { method: 'DELETE' });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '删除失败'); return; }

      fetchGroups();

    } catch { alert('网络异常'); }

  };



  // 移动语料组到文件夹

  const handleMoveGroup = async (folderId: number | null) => {

    if (!movingGroup) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups/${movingGroup.id}/move`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ folder_id: folderId }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '移动失败'); return; }

      setShowMoveDialog(false);

      setMovingGroup(null);

      fetchGroups();

    } catch { alert('网络异常'); }

  };



  // 切换文件夹展开/折叠

  const toggleFolder = (folderId: number) => {

    setExpandedFolders(prev => {

      const next = new Set(prev);

      if (next.has(folderId)) next.delete(folderId);

      else next.add(folderId);

      return next;

    });

  };



  // 获取方言文件夹

  const dialectFolders = folders.filter(f => f.level === 1);

  // 获取某个方言下的地区文件夹

  const getRegionFolders = (dialectId: number) => folders.filter(f => f.level === 2 && f.parent_id === dialectId);

  // 获取某个地区文件夹下的语料组

  const getGroupsInFolder = (folderId: number) => groups.filter(g => g.folder_id === folderId);

  // 获取不在任何文件夹中的语料组

  const ungroupedGroups = groups.filter(g => !g.folder_id);



  if (selectedGroup) {

    return (

      <CorpusGroupDetailView

        group={selectedGroup}

        allCollectorGroups={collectorGroups}

        allAnnotatorGroups={annotatorGroups}

        allInspectorGroups={inspectorGroups}

        allReviewerGroups={reviewerGroups}

        allQualityReviewerGroups={qualityReviewerGroups}

        onBack={() => setSelectedGroup(null)}

        onRefreshGroups={handleRefresh}

      />

    );

  }



  // 渲染单个语料组卡片

  const renderGroupCard = (g: CorpusGroupItem) => (

    <li key={g.id} className="border border-slate-100 rounded-xl overflow-hidden">

      <button onClick={() => setSelectedGroup(g)}

        className="w-full flex items-start justify-between p-3 hover:bg-violet-50 transition-colors text-left">

        <div className="flex-1 min-w-0">

          <p className="text-sm font-bold text-slate-800 mb-1">{g.name}</p>

          <div className="flex gap-3 text-xs text-slate-500">

            <span>语料 <b className="text-slate-700">{g.corpus_count}</b></span>

            <span>语料包 <b className="text-slate-700">{g.package_count}</b></span>

            <span>可打包 <b className="text-green-600">{g.corpus_count - g.packaged_count}</b></span>

          </div>

          {g.assigned_groups.length > 0 && (

            <div className="flex flex-wrap gap-1 mt-1.5">

              {g.assigned_groups.map(ag => (

                <span key={ag.id} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">

                  {ag.name}

                </span>

              ))}

            </div>

          )}

        </div>

        <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 shrink-0 mt-1" />

      </button>

      <div className="px-3 pb-2 flex justify-end gap-2 border-t border-slate-50">

        <button

          onClick={() => { setMovingGroup(g); setShowMoveDialog(true); }}

          className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors cursor-pointer">

          <FolderOpen className="w-3.5 h-3.5" />

          移动

        </button>

        <button

          onClick={() => handleDelete(g)}

          className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer">

          <Trash2 className="w-3.5 h-3.5" />

          删除

        </button>

      </div>

    </li>

  );



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-md">

        <SubHeader title="语料组管理" onBack={onBack} />



        {/* 新建语料组 */}

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

          <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

            <Plus className="w-4 h-4 text-violet-600" />新建语料组

          </h2>

          <form onSubmit={handleCreate} className="flex gap-2">

            <input type="text" placeholder="输入语料组名称" value={newName}

              onChange={e => setNewName(e.target.value)}

              className="flex-1 px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

            <button type="submit" disabled={!newName.trim() || creating}

              className="px-5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold rounded-xl flex items-center justify-center transition-all">

              {creating ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}

            </button>

          </form>

        </div>



        {/* 文件夹管理 */}

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

          <div className="flex items-center justify-between mb-4">

            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">

              <FolderOpen className="w-4 h-4 text-amber-600" />文件夹管理

            </h2>

            <button

              onClick={() => { setShowNewFolder('dialect'); setNewFolderName(''); setNewFolderParent(null); }}

              className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1">

              <Plus className="w-3.5 h-3.5" />新建方言

            </button>

          </div>



          {/* 新建文件夹表单 */}

          {showNewFolder && (

            <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">

              <p className="text-xs text-amber-700 mb-2">

                新建{showNewFolder === 'dialect' ? '方言' : '地区'}文件夹

                {showNewFolder === 'region' && newFolderParent && (

                  <span className="ml-1">（所属方言：{folders.find(f => f.id === newFolderParent)?.name}）</span>

                )}

              </p>

              <div className="flex gap-2">

                <input type="text" placeholder="输入名称" value={newFolderName}

                  onChange={e => setNewFolderName(e.target.value)}

                  className="flex-1 px-3 py-2 bg-white rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 border border-amber-200" />

                <button onClick={handleCreateFolder} disabled={!newFolderName.trim() || creatingFolder}

                  className="px-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-bold rounded-lg">

                  {creatingFolder ? <Loader2 className="animate-spin w-4 h-4" /> : '创建'}

                </button>

                <button onClick={() => { setShowNewFolder(null); setNewFolderParent(null); }}

                  className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-600 text-sm rounded-lg">

                  取消

                </button>

              </div>

            </div>

          )}



          {/* 文件夹树 */}

          {loading ? (

            <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

          ) : dialectFolders.length === 0 ? (

            <p className="text-center text-slate-400 text-sm py-4">暂无文件夹，点击上方按钮创建</p>

          ) : (

            <div className="space-y-2">

              {dialectFolders.map(df => {

                const regionFolders = getRegionFolders(df.id);

                const isDialectExpanded = expandedFolders.has(df.id);

                return (

                  <div key={df.id} className="border border-slate-100 rounded-xl overflow-hidden">

                    {/* 方言文件夹 */}

                    <div className="flex items-center gap-2 p-3 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"

                      onClick={() => toggleFolder(df.id)}>

                      <ChevronLeft className={`w-4 h-4 text-amber-600 transition-transform ${isDialectExpanded ? 'rotate-90' : '-rotate-90'}`} />

                      <FolderOpen className="w-4 h-4 text-amber-600" />

                      <span className="text-sm font-bold text-amber-800 flex-1">{df.name}</span>

                      <span className="text-xs text-amber-600">{regionFolders.length} 个地区</span>

                      <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(df); }}

                        className="text-xs text-red-400 hover:text-red-600 p-1">

                        <Trash2 className="w-3.5 h-3.5" />

                      </button>

                      <button onClick={(e) => {

                        e.stopPropagation();

                        setNewFolderParent(df.id);

                        setShowNewFolder('region');

                        setNewFolderName('');

                      }}

                        className="text-xs text-amber-600 hover:text-amber-700 p-1">

                        <Plus className="w-3.5 h-3.5" />

                      </button>

                    </div>



                    {/* 地区文件夹列表 */}

                    {isDialectExpanded && (

                      <div className="pl-4 pb-2">

                        {regionFolders.length === 0 ? (

                          <p className="text-xs text-slate-400 py-2 pl-6">暂无地区，点击 + 创建</p>

                        ) : (

                          regionFolders.map(rf => {

                            const groupsInRegion = getGroupsInFolder(rf.id);

                            const isRegionExpanded = expandedFolders.has(rf.id);

                            return (

                              <div key={rf.id} className="mt-1">

                                <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"

                                  onClick={() => toggleFolder(rf.id)}>

                                  <ChevronLeft className={`w-3.5 h-3.5 text-green-600 transition-transform ${isRegionExpanded ? 'rotate-90' : '-rotate-90'}`} />

                                  <FolderOpen className="w-3.5 h-3.5 text-green-600" />

                                  <span className="text-sm font-medium text-green-800 flex-1">{rf.name}</span>

                                  <span className="text-xs text-green-600">{groupsInRegion.length} 个组</span>

                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(rf); }}

                                    className="text-xs text-red-400 hover:text-red-600 p-1">

                                    <Trash2 className="w-3 h-3" />

                                  </button>

                                </div>



                                {/* 语料组列表 */}

                                {isRegionExpanded && (

                                  <div className="pl-6 mt-1">

                                    {groupsInRegion.length === 0 ? (

                                      <p className="text-xs text-slate-400 py-1">暂无语料组</p>

                                    ) : (

                                      <ul className="space-y-1.5">

                                        {groupsInRegion.map(g => renderGroupCard(g))}

                                      </ul>

                                    )}

                                  </div>

                                )}

                              </div>

                            );

                          })

                        )}

                      </div>

                    )}

                  </div>

                );

              })}

            </div>

          )}

        </div>



        {/* 未分组的语料组 */}

        <div className="bg-white rounded-2xl shadow-sm p-5">

          <h2 className="text-sm font-bold text-slate-700 mb-3">

            未分组语料组

            <span className="text-xs font-normal text-slate-400 ml-2">（{ungroupedGroups.length} 个）</span>

          </h2>

          {ungroupedGroups.length === 0 ? (

            <p className="text-center text-slate-400 text-sm py-4">所有语料组都已分组</p>

          ) : (

            <ul className="space-y-2">

              {ungroupedGroups.map(g => renderGroupCard(g))}

            </ul>

          )}

          {cgTotal > CG_PAGE_SIZE && (

            <Pagination page={cgPage} total={cgTotal} pageSize={CG_PAGE_SIZE} onPageChange={(p) => { setCgPage(p); fetchGroups(p); }} />

          )}

        </div>



        {/* 移动对话框 */}

        {showMoveDialog && movingGroup && (

          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[80vh] overflow-hidden">

              <div className="p-4 border-b border-slate-100">

                <h3 className="text-sm font-bold text-slate-800">移动"{movingGroup.name}"到</h3>

                <p className="text-xs text-slate-500 mt-1">选择目标地区文件夹</p>

              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">

                {/* 移出文件夹选项 */}

                <button onClick={() => handleMoveGroup(null)}

                  className="w-full text-left p-3 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors">

                  <p className="text-sm font-medium text-slate-700">移出文件夹</p>

                  <p className="text-xs text-slate-400">放到"未分组"列表</p>

                </button>



                {/* 地区文件夹列表 */}

                {dialectFolders.map(df => {

                  const regionFolders = getRegionFolders(df.id);

                  return regionFolders.map(rf => (

                    <button key={rf.id} onClick={() => handleMoveGroup(rf.id)}

                      className="w-full text-left p-3 rounded-lg hover:bg-green-50 border border-green-100 transition-colors">

                      <p className="text-sm font-medium text-green-800">{rf.name}</p>

                      <p className="text-xs text-green-500">{df.name} / {rf.name}</p>

                    </button>

                  ));

                })}



                {dialectFolders.length === 0 && (

                  <p className="text-center text-slate-400 text-sm py-4">暂无文件夹，请先创建</p>

                )}

              </div>

              <div className="p-4 border-t border-slate-100">

                <button onClick={() => { setShowMoveDialog(false); setMovingGroup(null); }}

                  className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-600 text-sm rounded-lg">

                  取消

                </button>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>

  );

};



// ── 采集组管理 ────────────────────────────────────────────────────

const ROLE_TABS = [

  { role: 'collector', label: '采集员' },

  { role: 'annotator', label: '标注员' },

  { role: 'inspector', label: '质检员' },

  { role: 'reviewer', label: '采集审核员' },

  { role: 'quality_reviewer', label: '质检审核员' },

] as const;

type GroupRoleTab = typeof ROLE_TABS[number]['role'];





const CollectorGroupsView: React.FC<{ onBack: () => void }> = ({ onBack }) => {

  const [activeTab, setActiveTab] = useState<GroupRoleTab>('collector');

  const [groups, setGroups] = useState<CollectorGroupItem[]>([]);

  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState('');

  const [creating, setCreating] = useState(false);

  const [selectedGroup, setSelectedGroup] = useState<CollectorGroupItem | null>(null);

  const [allUsers, setAllUsers] = useState<UserItem[]>([]);

  const [addUserId, setAddUserId] = useState('');

  const [adding, setAdding] = useState(false);

  const [msg, setMsg] = useState('');

  const [grpPage, setGrpPage] = useState(0);

  const [grpTotal, setGrpTotal] = useState(0);

  const GRP_PAGE_SIZE = 10;




  const fetchGroups = useCallback(async (roleType: GroupRoleTab, p?: number) => {

    const currentPage = p ?? grpPage;

    setLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/groups?role_type=${roleType}&limit=${GRP_PAGE_SIZE}&offset=${currentPage * GRP_PAGE_SIZE}`));

      const json = await res.json();

      const data = json.data ?? [];

      setGroups(data);

      setGrpTotal(json.total ?? 0);

      return data;

    } finally { setLoading(false); }

  }, [grpPage]);



  const fetchUsers = useCallback(async () => {

    const res = await apiFetch(getApiUrl(`/users?limit=200`));

    const json = await res.json();

    setAllUsers((json.data ?? []).filter((u: UserItem) => u.role !== 'manager'));

  }, []);



  

  



  useEffect(() => { setGrpPage(0); fetchGroups(activeTab, 0); fetchUsers(); }, [activeTab]);



  const handleTabChange = (tab: GroupRoleTab) => {

    setActiveTab(tab);

    setSelectedGroup(null);

    setNewName('');

  };



  const handleCreate = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!newName.trim()) return;

    setCreating(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/groups`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ name: newName.trim(), role_type: activeTab }),

      });

      const json = await res.json();

      if (!res.ok) { alert(json.detail ?? '创建失败'); return; }

      setNewName('');

      fetchGroups(activeTab);

    } catch { alert('网络异常'); }

    finally { setCreating(false); }

  };



  const handleDelete = async (id: number, name: string) => {

    if (!window.confirm(`确认删除分组"${name}"？`)) return;

    try {

      await apiFetch(getApiUrl(`/admin/groups/${id}`), { method: 'DELETE' });

      if (selectedGroup?.id === id) setSelectedGroup(null);

      fetchGroups(activeTab);

    } catch { alert('网络异常'); }

  };



  const handleAddMember = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!selectedGroup || !addUserId) return;

    setAdding(true); setMsg('');

    try {

      const res = await apiFetch(getApiUrl(`/admin/groups/${selectedGroup.id}/members`), {

        method: 'POST', headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ user_id: Number(addUserId) }),

      });

      const json = await res.json();

      if (!res.ok) { setMsg(json.detail ?? '添加失败'); return; }

      setMsg('添加成功'); setAddUserId('');

      // 重新获取当前分页数据

      const data = await fetchGroups(activeTab, grpPage);

      // 如果选中的组不在当前页，清除选中状态

      const updated = data.find((g: CollectorGroupItem) => g.id === selectedGroup.id);

      if (updated) setSelectedGroup(updated);

      else setSelectedGroup(null);

    } catch { setMsg('网络异常'); }

    finally { setAdding(false); }

  };



  const handleRemoveMember = async (userId: number) => {

    if (!selectedGroup) return;

    try {

      await apiFetch(getApiUrl(`/admin/groups/${selectedGroup.id}/members/${userId}`), { method: 'DELETE' });

      // 重新获取当前分页数据

      const data = await fetchGroups(activeTab, grpPage);

      // 如果选中的组不在当前页，清除选中状态

      const updated = data.find((g: CollectorGroupItem) => g.id === selectedGroup.id);

      if (updated) setSelectedGroup(updated);

      else setSelectedGroup(null);

    } catch { alert('网络异常'); }

  };



  if (selectedGroup) {

    const memberIds = new Set(selectedGroup.members.map(m => m.id));

    const available = allUsers.filter(u => !memberIds.has(u.id) && u.role === activeTab);

    return (

      <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

        <div className="w-full max-w-md">

          <SubHeader title={`${selectedGroup.name} · 成员管理`} onBack={() => setSelectedGroup(null)} />



          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

            <h2 className="text-sm font-bold text-slate-700 mb-3">当前成员（{selectedGroup.members.length} 人）</h2>

            {selectedGroup.members.length === 0 ? (

              <p className="text-center text-slate-400 text-sm py-4">暂无成员</p>

            ) : (

              <ul className="divide-y divide-slate-50">

                {selectedGroup.members.map(u => (

                  <li key={u.id} className="flex items-center justify-between py-3">

                    <div className="flex items-center gap-3">

                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 text-xs font-bold">

                        {u.username[0].toUpperCase()}

                      </div>

                      <div>

                        <p className="text-sm font-semibold text-slate-800">{u.username}</p>

                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-600'}`}>

                          {roleLabel(u.role)}

                        </span>

                      </div>

                    </div>

                    <button onClick={() => handleRemoveMember(u.id)}

                      className="p-2 hover:bg-red-50 rounded-full text-slate-300 hover:text-red-400 transition-colors">

                      <X className="w-4 h-4" />

                    </button>

                  </li>

                ))}

              </ul>

            )}

          </div>



          <div className="bg-white rounded-2xl shadow-sm p-5">

            <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

              <UserPlus className="w-4 h-4 text-violet-600" />添加成员

            </h2>

            <form onSubmit={handleAddMember} className="space-y-3">

              <select value={addUserId} onChange={e => { setAddUserId(e.target.value); setMsg(''); }}

                className="block w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all">

                <option value="">— 选择用户 —</option>

                {available.map(u => (

                  <option key={u.id} value={u.id}>{u.username}（{roleLabel(u.role)}）</option>

                ))}

              </select>

              {msg && <p className={`text-sm ${msg === '添加成功' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

              <button type="submit" disabled={!addUserId || adding}

                className="w-full bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-all">

                {adding ? <Loader2 className="animate-spin w-5 h-5" /> : '添加到组'}

              </button>

            </form>

          </div>

        </div>

      </div>

    );

  }



  const tabLabel = ROLE_TABS.find(t => t.role === activeTab)?.label ?? '';



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-md">

        <SubHeader title="分组管理" onBack={onBack} />



        {/* 角色 Tab */}

        <div className="flex bg-white rounded-2xl shadow-sm p-1.5 mb-4 gap-1">

          {ROLE_TABS.map(t => (

            <button key={t.role} onClick={() => handleTabChange(t.role)}

              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all

                ${activeTab === t.role ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-500 hover:text-violet-600 hover:bg-violet-50'}`}>

              {t.label}

            </button>

          ))}

        </div>



        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">

          <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">

            <Plus className="w-4 h-4 text-violet-600" />新建{tabLabel}分组

          </h2>

          <form onSubmit={handleCreate} className="flex gap-2">

            <input type="text" placeholder={`输入${tabLabel}分组名称`} value={newName}

              onChange={e => setNewName(e.target.value)}

              className="flex-1 px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />

            <button type="submit" disabled={!newName.trim() || creating}

              className="px-5 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold rounded-xl flex items-center justify-center transition-all">

              {creating ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}

            </button>

          </form>

        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5">

          <h2 className="text-sm font-bold text-slate-700 mb-3">全部{tabLabel}分组</h2>

          {loading ? (

            <div className="flex justify-center py-6"><Loader2 className="animate-spin w-6 h-6 text-violet-400" /></div>

          ) : groups.length === 0 ? (

            <p className="text-center text-slate-400 text-sm py-6">暂无{tabLabel}分组</p>

          ) : (

            <ul className="space-y-2">

              {groups.map(g => (

                <li key={g.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">

                  <div>

                    <p className="text-sm font-semibold text-slate-800">{g.name}</p>

                    <p className="text-xs text-slate-400 mt-0.5">{g.member_count} 名成员</p>

                  </div>

                  <div className="flex items-center gap-2">

                    <button onClick={() => setSelectedGroup(g)}

                      className="px-3 py-1.5 bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium rounded-lg transition-colors">

                      管理成员

                    </button>

                    <button onClick={() => handleDelete(g.id, g.name)}

                      className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors">

                      <Trash2 className="w-4 h-4" />

                    </button>

                  </div>

                </li>

              ))}

            </ul>

          )}

          <Pagination page={grpPage} total={grpTotal} pageSize={GRP_PAGE_SIZE} onPageChange={(p) => { setGrpPage(p); fetchGroups(activeTab, p); }} />

        </div>

      </div>

    </div>

  );

};



// ── 统计详情页面 ─────────────────────────────────────────────────

const StatsDetailPage: React.FC<{

  role: 'collector' | 'annotator' | 'inspector';

  data: UserStat[];

  onBack: () => void;

  userId: number;

}> = ({ role, data, onBack, userId }) => {

  const [searchText, setSearchText] = useState('');

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;

  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());

  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const [allGroups, setAllGroups] = useState<string[]>([]);

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  const [filteredStats, setFilteredStats] = useState<UserStat[]>(data);

  const [statsLoading, setStatsLoading] = useState(false);



  const roleConfig = {

    collector: { title: '采集员工作统计', col1: '已完成包数', col2: '结算录音数', col3: '录音总时长', col4: '审核合格时长', col5: '结算条数' },

    annotator: { title: '标注员工作统计', col1: '已标注包数', col2: '结算标注数', col3: '标注总时长', col4: '审核合格时长', col5: '结算条数' },

    inspector: { title: '质检员工作统计', col1: '已质检包数', col2: '结算质检数', col3: '质检总时长', col4: '审核合格时长', col5: '结算条数' },

  };

  const config = roleConfig[role];



  // 按时间段获取统计数据

  const fetchFilteredStats = useCallback(async () => {

    setStatsLoading(true);

    try {

      let url = `/admin/statistics?user_id=${userId}`;

      if (startDate) url += `&start_date=${startDate}`;

      if (endDate) url += `&end_date=${endDate}`;

      const res = await apiFetch(getApiUrl(url));

      const json = await res.json();

      if (json.code === 200 && json.data) {

        const roleKey = role === 'collector' ? 'collectors' : role === 'annotator' ? 'annotators' : 'inspectors';

        setFilteredStats(json.data[roleKey] ?? []);

      }

    } catch { /* ignore */ }

    finally { setStatsLoading(false); }

  }, [userId, role, startDate, endDate]);



  // 无日期筛选时使用传入的 data，有日期筛选时自行请求

  useEffect(() => {

    if (startDate || endDate) {

      fetchFilteredStats();

    } else {

      setFilteredStats(data);

    }

  }, [startDate, endDate, data, fetchFilteredStats]);



  // 从后端获取所有分组

  useEffect(() => {

    const fetchGroups = async () => {

      try {

        const roleType = role === 'collector' ? 'collector' : role === 'annotator' ? 'annotator' : 'inspector';

        const res = await apiFetch(getApiUrl(`/admin/groups?role_type=${roleType}&limit=500`));

        const json = await res.json();

        if (json.code === 200 && json.data) {

          const groups = json.data.map((g: any) => g.name).sort();

          setAllGroups(groups);

        }

      } catch { /* ignore */ }

    };

    fetchGroups();

  }, [role]);



  const filteredData = filteredStats.filter(item => {

    if (searchText && !item.username.includes(searchText) && !(item.real_name || '').includes(searchText)) return false;

    if (selectedGroups.size > 0 && !item.group_names.some(g => selectedGroups.has(g))) return false;

    if (selectedMembers.size > 0 && !selectedMembers.has(item.id)) return false;

    return true;

  });

  const pagedData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);



  useEffect(() => { setPage(0); }, [searchText, selectedGroups, selectedMembers, startDate, endDate]);



  const groupDropdownRef = React.useRef<HTMLDivElement>(null);

  const memberDropdownRef = React.useRef<HTMLDivElement>(null);



  useEffect(() => {

    const handleClickOutside = (e: MouseEvent) => {

      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) setShowGroupDropdown(false);

      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) setShowMemberDropdown(false);

    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);



  const exportToCSV = () => {

    const header = `ID,账号,姓名,所属分组,${config.col1},${config.col2},${config.col3},${config.col4},${config.col5}\n`;

    const rows = filteredData.map(u => `${u.id},${u.username},"${u.real_name || ''}","${u.group_names.join(';')}",${u.packages},${u.corpus_count},${Math.floor(u.total_duration_seconds)}秒,${Math.floor(u.approved_duration_seconds)}秒,${u.valid_count}`);

    const csv = header + rows.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);

    link.download = `${role}统计_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;

    link.click();

    URL.revokeObjectURL(link.href);

  };



  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">{config.title}</h1>



        <div className="w-full">

          {/* 搜索、日期筛选和导出 */}

          <div className="flex flex-wrap gap-3 mb-6 items-end">

            <div className="flex-1 relative min-w-[150px]">

              <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />

              <input

                type="text"

                placeholder="搜索账号..."

                value={searchText}

                onChange={(e) => setSearchText(e.target.value)}

                className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            {/* 时间段筛选 */}

            <div className="flex items-center gap-2">

              <label className="text-sm text-slate-500">从</label>

              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}

                className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300" />

              <label className="text-sm text-slate-500">至</label>

              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}

                className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300" />

              {(startDate || endDate) && (

                <button onClick={() => { setStartDate(''); setEndDate(''); }}

                  className="px-2 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">

                  清除

                </button>

              )}

            </div>

            {/* 分组筛选 */}

            {allGroups.length > 0 && (

              <div className="relative" ref={groupDropdownRef}>

                <button type="button" onClick={() => setShowGroupDropdown(!showGroupDropdown)}

                  className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-700 min-w-[120px] flex items-center justify-between gap-2">

                  <span className="truncate">{selectedGroups.size === 0 ? '全部分组' : `已选 ${selectedGroups.size} 组`}</span>

                  <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${showGroupDropdown ? 'rotate-90' : '-rotate-90'}`} />

                </button>

                {showGroupDropdown && (

                  <div className="absolute z-20 mt-1 left-0 w-48 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">

                    {allGroups.map(g => (

                      <label key={g} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                        <input type="checkbox" checked={selectedGroups.has(g)}

                          onChange={() => { const n = new Set(selectedGroups); n.has(g) ? n.delete(g) : n.add(g); setSelectedGroups(n); }}

                          className="accent-violet-600" />

                        <span className="text-sm text-slate-700 truncate">{g}</span>

                      </label>

                    ))}

                  </div>

                )}

              </div>

            )}

            {/* 成员筛选 */}

            <div className="relative" ref={memberDropdownRef}>

              <button type="button" onClick={() => setShowMemberDropdown(!showMemberDropdown)}

                className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-700 min-w-[120px] flex items-center justify-between gap-2">

                <span className="truncate">{selectedMembers.size === 0 ? '全部成员' : `已选 ${selectedMembers.size} 人`}</span>

                <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${showMemberDropdown ? 'rotate-90' : '-rotate-90'}`} />

              </button>

              {showMemberDropdown && (

                <div className="absolute z-20 mt-1 right-0 w-48 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">

                  {filteredStats.map(u => (

                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                      <input type="checkbox" checked={selectedMembers.has(u.id)}

                        onChange={() => { const n = new Set(selectedMembers); n.has(u.id) ? n.delete(u.id) : n.add(u.id); setSelectedMembers(n); }}

                        className="accent-violet-600" />

                      <span className="text-sm text-slate-700 truncate">{u.username}</span>

                    </label>

                  ))}

                </div>

              )}

            </div>

            {(searchText || selectedGroups.size > 0 || selectedMembers.size > 0) && (

              <button onClick={() => { setSearchText(''); setSelectedGroups(new Set()); setSelectedMembers(new Set()); }}

                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 underline">

                清除

              </button>

            )}

            <button onClick={exportToCSV}

              className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 font-medium rounded-lg transition-colors">

              <DownloadIcon className="w-5 h-5" />导出 CSV

            </button>

          </div>



          {/* 统计表 */}

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">

            <table className="w-full min-w-max">

              <thead>

                <tr className="border-b border-slate-100 bg-slate-50 sticky top-0">

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 w-10"></th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-16">ID</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">账号</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-24">姓名</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">所属分组</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-28">{config.col1}</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-28">{config.col2}</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">{config.col3}</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">{config.col4}</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-28">{config.col5}</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {statsLoading ? (

                  <tr>

                    <td colSpan={10} className="px-6 py-8 text-center text-slate-500">

                      <Loader2 className="animate-spin w-6 h-6 text-violet-400 mx-auto" />

                    </td>

                  </tr>

                ) : pagedData.length === 0 ? (

                  <tr>

                    <td colSpan={10} className="px-6 py-8 text-center text-slate-500">暂无数据</td>

                  </tr>

                ) : (

                  pagedData.map((item) => (

                    <React.Fragment key={item.id}>

                      <tr className="hover:bg-slate-50">

                        <td className="px-6 py-4">

                          <button onClick={() => {

                            const newExpanded = new Set(expandedIds);

                            newExpanded.has(item.id) ? newExpanded.delete(item.id) : newExpanded.add(item.id);

                            setExpandedIds(newExpanded);

                          }} className="p-1 hover:bg-slate-200 rounded">

                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedIds.has(item.id) ? 'rotate-180' : ''}`} />

                          </button>

                        </td>

                        <td className="px-6 py-4 text-sm text-slate-500 font-mono">{item.id}</td>

                        <td className="px-6 py-4 text-sm text-slate-800 font-medium">{item.username}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{item.real_name || <span className="text-slate-300">-</span>}</td>

                        <td className="px-6 py-4 text-xs text-slate-500">

                          {item.group_names.length > 0 ? item.group_names.map(g => (

                            <span key={g} className="inline-block px-2 py-0.5 bg-slate-100 rounded-full mr-1 mb-0.5">{g}</span>

                          )) : <span className="text-slate-300">-</span>}

                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">{item.packages}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{item.corpus_count}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{formatDuration(item.total_duration_seconds)}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{formatDuration(item.approved_duration_seconds)}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{item.valid_count}</td>

                      </tr>

                      {expandedIds.has(item.id) && (

                        <tr className="bg-slate-50">

                          <td colSpan={10} className="px-6 py-4">

                            <div className="grid grid-cols-5 gap-4 text-sm">

                              <div>

                                <p className="text-slate-500">平均工作效率</p>

                                <p className="text-lg font-bold text-slate-800">

                                  {item.packages > 0 ? formatDuration(Math.floor(item.total_duration_seconds / item.packages)) : '-'}

                                </p>

                              </div>

                              <div>

                                <p className="text-slate-500">平均单位用时</p>

                                <p className="text-lg font-bold text-slate-800">

                                  {item.corpus_count > 0 ? `${Math.floor(item.total_duration_seconds / item.corpus_count)}s` : '-'}

                                </p>

                              </div>

                              <div>

                                <p className="text-slate-500">总工作时长</p>

                                <p className="text-lg font-bold text-slate-800">{formatDuration(item.total_duration_seconds)}</p>

                              </div>

                              <div>

                                <p className="text-slate-500">审核通过时长</p>

                                <p className="text-lg font-bold text-slate-800">{formatDuration(item.approved_duration_seconds)}</p>

                              </div>

                              <div>

                                <p className="text-slate-500">结算条数 / 剔除条数</p>

                                <p className="text-lg font-bold text-slate-800">

                                  <span className="text-green-600">{item.valid_count}</span>

                                  <span className="text-slate-400 mx-1">/</span>

                                  <span className="text-red-600">{item.invalid_count}</span>

                                </p>

                              </div>

                            </div>

                          </td>

                        </tr>

                      )}

                    </React.Fragment>

                  ))

                )}

              </tbody>

            </table>

          </div>

          <Pagination page={page} total={filteredData.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

        </div>

      </div>

    </div>

  );

};



// ── 每日作业监控视图 ──────────────────────────────────────────────────

const DailyWorkView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack, userId }) => {

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [role, setRole] = useState<'collector' | 'annotator' | 'inspector'>('collector');

  const [data, setData] = useState<UserStat[]>([]);

  const [loading, setLoading] = useState(false);

  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());

  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [startHour, setStartHour] = useState<string>('');

  const [endHour, setEndHour] = useState<string>('');



  const roleConfig = {

    collector: { title: '采集员每日作业', col1: '录音条数', col2: '录音总时长' },

    annotator: { title: '标注员每日作业', col1: '标注条数', col2: '工作时长' },

    inspector: { title: '质检员每日作业', col1: '质检条数', col2: '工作时长' },

  };

  const config = roleConfig[role];



  const fetchDailyWork = useCallback(async () => {

    setLoading(true);

    try {

      let url = `/admin/daily-work?user_id=${userId}&date=${date}&role=${role}`;

      if (startHour !== '' && endHour !== '' && Number(startHour) <= Number(endHour)) {

        url += `&start_hour=${startHour}&end_hour=${endHour}`;

      }

      const res = await apiFetch(getApiUrl(url));

      const json = await res.json();

      if (json.code === 200) setData(json.data ?? []);

    } catch { /* ignore */ }

    finally { setLoading(false); }

  }, [userId, date, role, startHour, endHour]);



  useEffect(() => { fetchDailyWork(); }, [fetchDailyWork]);



  const allGroups = [...new Set(data.flatMap(u => u.group_names))].sort();



  const filteredData = data.filter(item => {

    if (selectedUsers.size > 0 && !selectedUsers.has(item.id)) return false;

    if (selectedGroups.size > 0 && !item.group_names.some(g => selectedGroups.has(g))) return false;

    return true;

  });

  const pagedData = filteredData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);



  useEffect(() => { setPage(0); }, [selectedUsers, selectedGroups]);



  const userDropdownRef = React.useRef<HTMLDivElement>(null);

  const groupDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {

    const handleClickOutside = (e: MouseEvent) => {

      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) setShowUserDropdown(false);

      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) setShowGroupDropdown(false);

    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);



  const exportToCSV = () => {

    const header = `ID,账号,姓名,所属分组,${config.col1},${config.col2}\n`;

    const rows = filteredData.map(u => `${u.id},${u.username},"${u.real_name || ''}","${u.group_names.join(';')}",${u.corpus_count},${Math.floor(u.total_duration_seconds)}秒`);

    const csv = header + rows.join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(blob);

    link.download = `每日作业_${date}_${role}.csv`;

    link.click();

    URL.revokeObjectURL(link.href);

  };



  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">每日作业监控</h1>



        {/* 筛选栏 */}

        <div className="flex flex-wrap gap-3 mb-6 items-end">

          <div>

            <label className="block text-xs text-slate-500 mb-1">日期</label>

            <input type="date" value={date} onChange={e => setDate(e.target.value)}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />

          </div>

          <div>

            <label className="block text-xs text-slate-500 mb-1">开始时间</label>

            <select value={startHour} onChange={e => setStartHour(e.target.value)}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">

              <option value="">不限</option>

              {Array.from({ length: 24 }, (_, i) => (

                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>

              ))}

            </select>

          </div>

          <div>

            <label className="block text-xs text-slate-500 mb-1">结束时间</label>

            <select value={endHour} onChange={e => setEndHour(e.target.value)}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">

              <option value="">不限</option>

              {Array.from({ length: 24 }, (_, i) => (

                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>

              ))}

            </select>

          </div>

          <div>

            <label className="block text-xs text-slate-500 mb-1">角色</label>

            <select value={role} onChange={e => { setRole(e.target.value as any); setSelectedUsers(new Set()); setSelectedGroups(new Set()); }}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">

              <option value="collector">采集员</option>

              <option value="annotator">标注员</option>

              <option value="inspector">质检员</option>

            </select>

          </div>

          {/* 分组筛选 */}

          {allGroups.length > 0 && (

            <div className="relative" ref={groupDropdownRef}>

              <label className="block text-xs text-slate-500 mb-1">分组筛选</label>

              <button type="button" onClick={() => setShowGroupDropdown(!showGroupDropdown)}

                className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm min-w-[120px] flex items-center justify-between gap-2">

                <span className="truncate">{selectedGroups.size === 0 ? '全部分组' : `已选 ${selectedGroups.size} 组`}</span>

                <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${showGroupDropdown ? 'rotate-90' : '-rotate-90'}`} />

              </button>

              {showGroupDropdown && (

                <div className="absolute z-20 mt-1 left-0 w-48 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">

                  {allGroups.map(g => (

                    <label key={g} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                      <input type="checkbox" checked={selectedGroups.has(g)}

                        onChange={() => { const n = new Set(selectedGroups); n.has(g) ? n.delete(g) : n.add(g); setSelectedGroups(n); }}

                        className="accent-violet-600" />

                      <span className="text-sm text-slate-700 truncate">{g}</span>

                    </label>

                  ))}

                </div>

              )}

            </div>

          )}

          <div className="relative" ref={userDropdownRef}>

            <label className="block text-xs text-slate-500 mb-1">成员筛选</label>

            <button type="button" onClick={() => setShowUserDropdown(!showUserDropdown)}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm min-w-[120px] flex items-center justify-between gap-2">

              <span className="truncate">{selectedUsers.size === 0 ? '全部成员' : `已选 ${selectedUsers.size} 人`}</span>

              <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${showUserDropdown ? 'rotate-90' : '-rotate-90'}`} />

            </button>

            {showUserDropdown && (

              <div className="absolute z-20 mt-1 left-0 w-48 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">

                {data.map(u => (

                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                    <input type="checkbox" checked={selectedUsers.has(u.id)}

                      onChange={() => { const n = new Set(selectedUsers); n.has(u.id) ? n.delete(u.id) : n.add(u.id); setSelectedUsers(n); }}

                      className="accent-violet-600" />

                    <span className="text-sm text-slate-700 truncate">{u.username}</span>

                  </label>

                ))}

              </div>

            )}

          </div>

          {(selectedUsers.size > 0 || selectedGroups.size > 0) && (

            <button onClick={() => { setSelectedUsers(new Set()); setSelectedGroups(new Set()); }}

              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 underline">

              清除

            </button>

          )}

          <button onClick={exportToCSV}

            className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 font-medium rounded-lg transition-colors">

            <DownloadIcon className="w-5 h-5" />导出 CSV

          </button>

        </div>



        {/* 数据表格 */}

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">

          {loading ? (

            <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>

          ) : (

            <table className="w-full min-w-max">

              <thead>

                <tr className="border-b border-slate-100 bg-slate-50 sticky top-0">

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 w-10"></th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-16">ID</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">账号</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-24">姓名</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">所属分组</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-28">{config.col1}</th>

                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600 min-w-32">{config.col2}</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {pagedData.length === 0 ? (

                  <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">暂无数据</td></tr>

                ) : pagedData.map((item) => (

                  <React.Fragment key={item.id}>

                    <tr className="hover:bg-slate-50">

                      <td className="px-6 py-4">

                        <button onClick={() => {

                          const n = new Set(expandedIds);

                          n.has(item.id) ? n.delete(item.id) : n.add(item.id);

                          setExpandedIds(n);

                        }} className="p-1 hover:bg-slate-200 rounded">

                          <ChevronDown className={`w-4 h-4 transition-transform ${expandedIds.has(item.id) ? 'rotate-180' : ''}`} />

                        </button>

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-500 font-mono">{item.id}</td>

                      <td className="px-6 py-4 text-sm text-slate-800 font-medium">{item.username}</td>

                      <td className="px-6 py-4 text-sm text-slate-600">{item.real_name || <span className="text-slate-300">-</span>}</td>

                      <td className="px-6 py-4 text-xs text-slate-500">

                        {item.group_names.length > 0 ? item.group_names.map(g => (

                          <span key={g} className="inline-block px-2 py-0.5 bg-slate-100 rounded-full mr-1 mb-0.5">{g}</span>

                        )) : <span className="text-slate-300">-</span>}

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">{item.corpus_count}</td>

                      <td className="px-6 py-4 text-sm text-slate-600">{formatDuration(item.total_duration_seconds)}</td>

                    </tr>

                    {expandedIds.has(item.id) && (

                      <tr className="bg-slate-50">

                        <td colSpan={7} className="px-6 py-4">

                          <div className="grid grid-cols-3 gap-4 text-sm">

                            <div><p className="text-slate-500">平均单位用时</p><p className="font-medium text-slate-800">{item.corpus_count > 0 ? Math.floor(item.total_duration_seconds / item.corpus_count) : 0}秒/条</p></div>

                            <div><p className="text-slate-500">总工作时长</p><p className="font-medium text-slate-800">{formatDuration(item.total_duration_seconds)}</p></div>

                          </div>

                        </td>

                      </tr>

                    )}

                  </React.Fragment>

                ))}

              </tbody>

            </table>

          )}

        </div>



        <Pagination page={page} total={filteredData.length} pageSize={PAGE_SIZE} onPageChange={setPage} />

      </div>

    </div>

  );

};



// ── 作业查询视图 ──────────────────────────────────────────────────

const JobQueryView: React.FC<{

  onBack: () => void;

}> = ({ onBack }) => {

  const [packages, setPackages] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const [releasing, setReleasing] = useState<number | null>(null);

  const [page, setPage] = useState(0);

  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 20;



  // 筛选条件

  const [workerName, setWorkerName] = useState('');

  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);

  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);

  const [allWorkers, setAllWorkers] = useState<any[]>([]);

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  const [roleFilter, setRoleFilter] = useState('');

  const [excludeQualityReviewer, setExcludeQualityReviewer] = useState(true);

  const [releasingRole, setReleasingRole] = useState<string | null>(null);

  const [releasingFiltered, setReleasingFiltered] = useState(false);



  // 获取所有用户列表

  useEffect(() => {

    const fetchUsers = async () => {

      try {

        const res = await apiFetch(getApiUrl('/admin/users/simple'));

        const data = await res.json();

        if (res.ok) {

          setAllWorkers(data.data ?? []);

        }

      } catch (err) {

        console.error('Failed to fetch users:', err);

      }

    };

    fetchUsers();

  }, []);



  const fetchPackages = async (p?: number) => {

    const currentPage = p ?? page;

    setLoading(true);

    try {

      let url = getApiUrl(`/admin/claimed-packages?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`);



      // 添加筛选参数

      if (workerName) {

        url += `&worker_name=${encodeURIComponent(workerName)}`;

      }

      if (selectedWorkers.length > 0) {

        url += `&worker_ids=${selectedWorkers.join(',')}`;

      }

      if (startDate) {

        url += `&start_date=${startDate}`;

      }

      if (endDate) {

        url += `&end_date=${endDate}`;

      }

      if (roleFilter) {

        url += `&role_filter=${roleFilter}`;

      }

      if (!excludeQualityReviewer) {

        url += `&exclude_quality_reviewer=false`;

      }



      const res = await apiFetch(url);

      const data = await res.json();

      if (res.ok) {

        setPackages(data.data ?? []);

        setTotal(data.total ?? 0);

      }

    } catch (err) {

      console.error('Failed to fetch claimed packages:', err);

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    fetchPackages(0);

  }, [workerName, selectedWorkers, startDate, endDate, roleFilter, excludeQualityReviewer]);



  const handleRelease = async (packageId: number) => {

    if (!confirm('确定要释放这个语料包吗？释放后，当前作业人员将失去该包，其他人员可以重新领取。')) {

      return;

    }



    setReleasing(packageId);

    try {

      const res = await apiFetch(getApiUrl('/admin/release-package'), {

        method: 'POST',

        body: JSON.stringify({ package_id: packageId }),

      });

      const data = await res.json();

      if (res.ok) {

        alert('释放成功');

        fetchPackages(page); // 刷新当前页

      } else {

        alert(data.detail || '释放失败');

      }

    } catch (err) {

      alert('网络异常，请重试');

    } finally {

      setReleasing(null);

    }

  };



  const handleSearch = () => {

    setPage(0);

    fetchPackages(0);

  };



  const handleClearFilters = () => {

    setWorkerName('');

    setSelectedWorkers([]);

    setStartDate('');

    setEndDate('');

    setRoleFilter('');

    setPage(0);

  };



  const handleReleaseByRole = async (role: string) => {

    const roleNames: Record<string, string> = {

      collector: '采集员',

      annotator: '标注员',

      inspector: '质检员',

      reviewer: '采集审核员',

    };

    

    if (!confirm(`确定要释放所有${roleNames[role] || role}的数据吗？此操作不可撤销！`)) {

      return;

    }



    setReleasingRole(role);

    try {

      const res = await apiFetch(getApiUrl('/admin/release-packages-by-role'), {

        method: 'POST',

        body: JSON.stringify({ role }),

      });

      const data = await res.json();

      if (res.ok) {

        alert(data.msg);

        fetchPackages(page);

      } else {

        alert(data.detail || '释放失败');

      }

    } catch (err) {

      alert('网络异常，请重试');

    } finally {

      setReleasingRole(null);

    }

  };



  const handleReleaseByFilter = async () => {

    if (!confirm(`确定要释放当前筛选结果吗？\n\n筛选条件：${[

      workerName && `人员: ${workerName}`,

      selectedWorkers.length > 0 && `已选 ${selectedWorkers.length} 人`,

      roleFilter && `角色: ${roleFilter}`,

      startDate && `开始: ${startDate}`,

      endDate && `结束: ${endDate}`,

    ].filter(Boolean).join('，') || '无'}`)) {

      return;

    }



    setReleasingFiltered(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/release-packages-by-filter'), {

        method: 'POST',

        body: JSON.stringify({

          worker_name: workerName || null,

          worker_ids: selectedWorkers,

          role_filter: roleFilter || null,

          exclude_quality_reviewer: excludeQualityReviewer,

          start_date: startDate || null,

          end_date: endDate || null,

        }),

      });

      const data = await res.json();

      if (res.ok) {

        alert(data.msg);

        fetchPackages(page);

      } else {

        alert(data.detail || '释放失败');

      }

    } catch (err) {

      alert('网络异常，请重试');

    } finally {

      setReleasingFiltered(false);

    }

  };



  const toggleWorker = (workerId: number) => {

    setSelectedWorkers(prev =>

      prev.includes(workerId)

        ? prev.filter(id => id !== workerId)

        : [...prev, workerId]

    );

  };



  return (

    <div className="w-full min-h-screen bg-slate-100 p-6">

      <div className="max-w-6xl mx-auto">

        {/* Header */}

        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-3">

            <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm">

              <ChevronLeft className="w-5 h-5 text-slate-600" />

            </button>

            <div>

              <h1 className="text-xl font-bold text-slate-800">作业查询</h1>

              <p className="text-sm text-slate-500">查看所有被领取的语料包并进行管理</p>

            </div>

          </div>

          <button onClick={() => fetchPackages(page)} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">

            <RefreshCw className="w-5 h-5" />

          </button>

        </div>



        {/* Stats */}

        <div className="grid grid-cols-4 gap-4 mb-6">

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">采集中</p>

            <p className="text-2xl font-bold text-blue-600">

              {packages.filter(p => p.status === '已领取').length}

            </p>

          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">标注中</p>

            <p className="text-2xl font-bold text-green-600">

              {packages.filter(p => p.annotation_status === '待标注').length}

            </p>

          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">质检中</p>

            <p className="text-2xl font-bold text-amber-600">

              {packages.filter(p => p.quality_status === '待质检').length}

            </p>

          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">审核中</p>

            <p className="text-2xl font-bold text-purple-600">

              {packages.filter(p => p.review_status === '待审核' && p.review_claimed_by).length}

            </p>

          </div>

        </div>



        {/* Filters */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">

          <div className="flex flex-wrap items-end gap-4">

            <div className="flex-1 min-w-[200px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">作业人员（模糊搜索）</label>

              <input

                type="text"

                value={workerName}

                onChange={(e) => setWorkerName(e.target.value)}

                placeholder="输入人员名称..."

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <div className="flex-1 min-w-[200px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">作业人员（多选）</label>

              <div className="relative">

                <button

                  type="button"

                  onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}

                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 flex items-center justify-between"

                >

                  <span className="truncate">

                    {selectedWorkers.length === 0

                      ? '选择人员...'

                      : `${selectedWorkers.length} 人已选`}

                  </span>

                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${workerDropdownOpen ? 'rotate-180' : ''}`} />

                </button>

                {workerDropdownOpen && (

                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">

                    {allWorkers.map((worker) => (

                      <label

                        key={worker.id}

                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"

                      >

                        <input

                          type="checkbox"

                          checked={selectedWorkers.includes(worker.id)}

                          onChange={() => toggleWorker(worker.id)}

                          className="accent-violet-600"

                        />

                        <span className="text-sm text-slate-700">{worker.username}</span>

                        <span className="text-xs text-slate-400">({worker.role})</span>

                      </label>

                    ))}

                  </div>

                )}

              </div>

            </div>

            <div className="flex-1 min-w-[150px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">角色筛选</label>

              <select

                value={roleFilter}

                onChange={(e) => setRoleFilter(e.target.value)}

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              >

                <option value="">全部角色</option>

                <option value="collector">采集员</option>

                <option value="annotator">标注员</option>

                <option value="inspector">质检员</option>

                <option value="reviewer">采集审核员</option>

                <option value="no_role">无角色</option>

              </select>

            </div>

            <div className="flex-1 min-w-[150px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>

              <input

                type="date"

                value={startDate}

                onChange={(e) => setStartDate(e.target.value)}

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <div className="flex-1 min-w-[150px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>

              <input

                type="date"

                value={endDate}

                onChange={(e) => setEndDate(e.target.value)}

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <div className="flex items-center gap-2">

              <label className="flex items-center gap-2 cursor-pointer">

                <input

                  type="checkbox"

                  checked={excludeQualityReviewer}

                  onChange={(e) => setExcludeQualityReviewer(e.target.checked)}

                  className="accent-violet-600"

                />

                <span className="text-sm text-slate-700">排除质检审核</span>

              </label>

            </div>

            <button

              onClick={handleSearch}

              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"

            >

              搜索

            </button>

            <button

              onClick={handleClearFilters}

              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"

            >

              清除

            </button>

          </div>

        </div>



        {/* Release by Role Buttons */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">

          <p className="text-sm font-medium text-slate-700 mb-3">一键释放角色数据</p>

          <div className="flex flex-wrap gap-3">

            <button

              onClick={() => handleReleaseByRole('collector')}

              disabled={releasingRole === 'collector'}

              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"

            >

              {releasingRole === 'collector' ? '释放中...' : '释放所有采集员'}

            </button>

            <button

              onClick={() => handleReleaseByRole('annotator')}

              disabled={releasingRole === 'annotator'}

              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"

            >

              {releasingRole === 'annotator' ? '释放中...' : '释放所有标注员'}

            </button>

            <button

              onClick={() => handleReleaseByRole('inspector')}

              disabled={releasingRole === 'inspector'}

              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"

            >

              {releasingRole === 'inspector' ? '释放中...' : '释放所有质检员'}

            </button>

            <button

              onClick={() => handleReleaseByRole('reviewer')}

              disabled={releasingRole === 'reviewer'}

              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"

            >

              {releasingRole === 'reviewer' ? '释放中...' : '释放所有采集审核员'}

            </button>

          </div>

        </div>



        {/* Release by Filter */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm font-medium text-slate-700">按筛选条件释放</p>

              <p className="text-xs text-slate-500 mt-1">

                释放当前筛选结果（{total} 个包）

              </p>

            </div>

            <button

              onClick={handleReleaseByFilter}

              disabled={releasingFiltered || total === 0}

              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"

            >

              {releasingFiltered ? '释放中...' : `释放筛选结果 (${total})`}

            </button>

          </div>

        </div>



        {/* Package List */}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">

          {loading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin w-8 h-8 text-violet-400" />

            </div>

          ) : packages.length === 0 ? (

            <div className="flex flex-col items-center py-12 text-slate-400">

              <ListTodo className="w-12 h-12 mb-3 opacity-30" />

              <p>暂无被领取的语料包</p>

            </div>

          ) : (

            <>

              <table className="w-full">

                <thead>

                  <tr className="border-b border-slate-100 bg-slate-50">

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">语料包</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">语料组</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">状态</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">作业人员</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">领取时间</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">提交时间</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">操作</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {packages.map((pkg) => (

                    <tr key={pkg.id} className="hover:bg-slate-50">

                      <td className="px-6 py-4">

                        <div>

                          <p className="font-medium text-slate-800">{pkg.name}</p>

                          <p className="text-xs text-slate-500">{pkg.size} 条语料</p>

                        </div>

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">{pkg.corpus_group_name}</td>

                      <td className="px-6 py-4">

                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${pkg.status === '已领取' ? 'bg-blue-100 text-blue-700' :

                          pkg.annotation_status === '待标注' ? 'bg-green-100 text-green-700' :

                            pkg.quality_status === '待质检' ? 'bg-amber-100 text-amber-700' :

                              pkg.review_status === '待审核' && pkg.review_claimed_by ? 'bg-purple-100 text-purple-700' :

                                pkg.quality_review_status === '待审核' && pkg.quality_review_claimed_by ? 'bg-pink-100 text-pink-700' :

                                  'bg-slate-100 text-slate-600'

                          }`}>

                          {pkg.status === '已领取' ? '采集中' :

                            pkg.annotation_status === '待标注' ? '标注中' :

                              pkg.quality_status === '待质检' ? '质检中' :

                                pkg.review_status === '待审核' && pkg.review_claimed_by ? '审核中' :

                                  pkg.quality_review_status === '待审核' && pkg.quality_review_claimed_by ? '质检审核中' : '未知'}

                        </span>

                      </td>

                      <td className="px-6 py-4">

                        <div className="flex items-center gap-2">

                          <span className="text-sm font-medium text-slate-700">{pkg.worker_name}</span>

                          <span className="text-xs text-slate-500">({pkg.worker_role})</span>

                        </div>

                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">{pkg.claimed_at}</td>

                      <td className="px-6 py-4 text-sm text-slate-600">{pkg.last_worked_at}</td>

                      <td className="px-6 py-4">

                        <button

                          onClick={() => handleRelease(pkg.id)}

                          disabled={releasing === pkg.id}

                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"

                        >

                          {releasing === pkg.id ? '释放中...' : '释放'}

                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>



              {/* Pagination */}

              <Pagination

                page={page}

                total={total}

                pageSize={PAGE_SIZE}

                onPageChange={(p) => { setPage(p); fetchPackages(p); }}

              />

            </>

          )}

        </div>

      </div>

    </div>

  );

};



// ── 导出管理视图 ──────────────────────────────────────────────────

const ExportManagementView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack, userId: _userId }) => {

  const [corpusGroups, setCorpusGroups] = useState<any[]>([]);

  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState('');

  const [groupRegions, setGroupRegions] = useState<Map<number, string>>(new Map());

  

  // 异步任务状态

  const [taskId, setTaskId] = useState<string | null>(null);

  const [taskStatus, setTaskStatus] = useState<string | null>(null);

  const [taskProgress, setTaskProgress] = useState(0);

  const [taskMessage, setTaskMessage] = useState('');

  const [taskResult, setTaskResult] = useState<any>(null);

  

  // 自动导出配置状态

  const [autoConfigs, setAutoConfigs] = useState<any[]>([]);

  const [autoAvailable, setAutoAvailable] = useState<any[]>([]);

  const [autoLastResult, setAutoLastResult] = useState<any>(null);

  const [autoLoading, setAutoLoading] = useState(false);

  const [autoSaving, setAutoSaving] = useState(false);

  const [autoNewGroupId, setAutoNewGroupId] = useState<number | ''>('');

  const [autoNewRegion, setAutoNewRegion] = useState('');

  const [autoEdits, setAutoEdits] = useState<Map<number, string>>(new Map());

  const [autoEnabled, setAutoEnabled] = useState(true);



  const handleToggleAutoExport = async (checked: boolean) => {

    try {

      const res = await apiFetch(getApiUrl('/admin/auto-export-config/toggle'), {

        method: 'POST',

        body: JSON.stringify({ enabled: checked }),

      });

      if (res.ok) {

        setAutoEnabled(checked);

      }

    } catch { /* ignore */ }

  };

  

  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);



  useEffect(() => {

    fetchCorpusGroups();

    fetchAutoConfig();

    return () => {

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    };

  }, []);



  // 轮询任务状态

  useEffect(() => {

    if (!taskId || taskStatus === 'completed' || taskStatus === 'failed') {

      if (pollTimerRef.current) {

        clearInterval(pollTimerRef.current);

        pollTimerRef.current = null;

      }

      return;

    }



    const pollStatus = async () => {

      try {

        const res = await apiFetch(getApiUrl(`/admin/export-task/${taskId}`));

        const data = await res.json();

        if (res.ok && data.data) {

          setTaskStatus(data.data.status);

          setTaskProgress(data.data.progress);

          setTaskMessage(data.data.message);

          if (data.data.status === 'completed') {

            setTaskResult(data.data.result);

            setExporting(false);

          } else if (data.data.status === 'failed') {

            setError(data.data.message);

            setExporting(false);

          }

        }

      } catch {

        // 忽略轮询错误

      }

    };



    // 立即查询一次

    pollStatus();

    

    // 每2秒轮询一次

    pollTimerRef.current = setInterval(pollStatus, 2000);



    return () => {

      if (pollTimerRef.current) {

        clearInterval(pollTimerRef.current);

        pollTimerRef.current = null;

      }

    };

  }, [taskId, taskStatus]);



  const fetchCorpusGroups = async () => {

    setLoading(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/corpus-groups?limit=100'));

      const data = await res.json();

      if (res.ok) {

        setCorpusGroups(data.data ?? []);

        // 初始化地区Map（使用组自带的pinyin_region）

        const initMap = new Map<number, string>();

        (data.data ?? []).forEach((g: any) => {

          if (g.pinyin_region) initMap.set(g.id, g.pinyin_region);

        });

        setGroupRegions(initMap);

      }

    } catch {

      setError('加载语料组失败');

    } finally {

      setLoading(false);

    }

  };



  const fetchAutoConfig = async () => {

    setAutoLoading(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/auto-export-config'));

      const data = await res.json();

      if (res.ok && data.data) {

        setAutoConfigs(data.data.configs || []);

        setAutoAvailable(data.data.available_groups || []);

        setAutoLastResult(data.data.last_result || null);

        setAutoEnabled(data.data.is_enabled !== false);

        // 初始化编辑Map

        const editMap = new Map<number, string>();

        (data.data.configs || []).forEach((c: any) => editMap.set(c.id, c.pinyin_region));

        setAutoEdits(editMap);

      }

    } catch {

      // ignore

    } finally {

      setAutoLoading(false);

    }

  };



  const handleSaveAutoRegion = async (configId: number) => {

    const region = autoEdits.get(configId)?.trim();

    if (!region) return;

    setAutoSaving(true);

    try {

      const config = autoConfigs.find(c => c.id === configId);

      if (!config) return;

      const res = await apiFetch(getApiUrl('/admin/auto-export-config'), {

        method: 'POST',

        body: JSON.stringify({ items: [{ corpus_group_id: config.corpus_group_id, pinyin_region: region }] }),

      });

      if (res.ok) fetchAutoConfig();

    } catch { /* ignore */ }

    finally { setAutoSaving(false); }

  };



  const handleDeleteAutoConfig = async (configId: number) => {

    if (!confirm('确定删除此自动导出配置？')) return;

    try {

      const res = await apiFetch(getApiUrl(`/admin/auto-export-config/delete/${configId}`), { method: 'POST' });

      if (res.ok) fetchAutoConfig();

    } catch { /* ignore */ }

  };



  const handleAddAutoConfig = async () => {

    if (!autoNewGroupId || !autoNewRegion.trim()) return;

    setAutoSaving(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/auto-export-config'), {

        method: 'POST',

        body: JSON.stringify({ items: [{ corpus_group_id: autoNewGroupId, pinyin_region: autoNewRegion.trim() }] }),

      });

      if (res.ok) {

        setAutoNewGroupId('');

        setAutoNewRegion('');

        fetchAutoConfig();

      }

    } catch { /* ignore */ }

    finally { setAutoSaving(false); }

  };



  const toggleGroup = (groupId: number) => {

    setSelectedGroups(prev => {

      const newSet = new Set(prev);

      if (newSet.has(groupId)) {

        newSet.delete(groupId);

      } else {

        newSet.add(groupId);

      }

      return newSet;

    });

  };



  const toggleAll = () => {

    if (selectedGroups.size === corpusGroups.length) {

      setSelectedGroups(new Set());

    } else {

      setSelectedGroups(new Set(corpusGroups.map(g => g.id)));

    }

  };



  const handleExport = async () => {

    if (selectedGroups.size === 0) {

      setError('请选择至少一个语料组');

      return;

    }



    // 检查所有已选组是否填写了地区

    const missingRegions: string[] = [];

    selectedGroups.forEach(gid => {

      if (!groupRegions.get(gid)?.trim()) {

        const group = corpusGroups.find(g => g.id === gid);

        missingRegions.push(group?.name || `#${gid}`);

      }

    });

    if (missingRegions.length > 0) {

      setError(`以下语料组未填写拼音地区：${missingRegions.join('、')}`);

      return;

    }



    setExporting(true);

    setError('');

    setTaskId(null);

    setTaskStatus(null);

    setTaskProgress(0);

    setTaskMessage('');

    setTaskResult(null);



    try {

      const group_regions = Array.from(selectedGroups).map(gid => ({

        group_id: gid,

        pinyin_region: groupRegions.get(gid)?.trim() || '',

      }));



      const res = await apiFetch(getApiUrl('/admin/export-multiple-groups'), {

        method: 'POST',

        body: JSON.stringify({ group_regions }),

      });



      const data = await res.json();



      if (res.ok && data.data?.task_id) {

        setTaskId(data.data.task_id);

        setTaskStatus('pending');

        setTaskMessage('任务已启动...');

      } else {

        setError(data.detail || '启动导出任务失败');

        setExporting(false);

      }

    } catch {

      setError('网络异常，请重试');

      setExporting(false);

    }

  };



  const handleClose = () => {

    setTaskId(null);

    setTaskStatus(null);

    setTaskProgress(0);

    setTaskMessage('');

    setTaskResult(null);

    setError('');

  };



  return (

    <div className="w-full min-h-screen bg-slate-100 p-6">

      <div className="max-w-4xl mx-auto">

        {/* Header */}

        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-3">

            <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm">

              <ChevronLeft className="w-5 h-5 text-slate-600" />

            </button>

            <div>

              <h1 className="text-xl font-bold text-slate-800">导出管理</h1>

              <p className="text-sm text-slate-500">选择多个语料组进行导出</p>

            </div>

          </div>

        </div>



        {/* 自动导出配置 */}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">

            <h3 className="text-sm font-bold text-slate-700">⏰ 每日自动导出（每天19点）</h3>

            <div className="flex items-center gap-2">

              <span className={`text-xs font-semibold ${autoEnabled ? 'text-green-600' : 'text-slate-400'}`}>

                {autoEnabled ? '自动导出已开启' : '自动导出已关闭'}

              </span>

              <button

                onClick={() => handleToggleAutoExport(!autoEnabled)}

                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoEnabled ? 'bg-violet-600' : 'bg-slate-200'}`}

              >

                <span

                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoEnabled ? 'translate-x-6' : 'translate-x-1'}`}

                />

              </button>

            </div>

          </div>



          {/* 上次自动导出结果 */}

          {autoLastResult && (

            <div className={`rounded-lg p-4 mb-4 ${autoLastResult.status === '成功' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>

              <div className="flex items-center justify-between mb-2">

                <span className="text-sm font-bold text-slate-700">上次自动导出</span>

                <span className={`text-xs px-2 py-0.5 rounded-full ${autoLastResult.status === '成功' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>

                  {autoLastResult.status}

                </span>

              </div>

              {autoLastResult.exported_at && <p className="text-xs text-slate-500">时间：{autoLastResult.exported_at}</p>}

              {autoLastResult.total_files && <p className="text-xs text-slate-500">文件数：{autoLastResult.total_files}，时长：{Math.floor((autoLastResult.total_duration || 0) / 60)}分钟</p>}

              {autoLastResult.message && autoLastResult.status === '失败' && <p className="text-xs text-red-600 mt-1">{autoLastResult.message}</p>}

              {autoLastResult.download_url && autoLastResult.status === '成功' && (

                <a href={autoLastResult.download_url} target="_blank" rel="noopener noreferrer"

                  className="inline-block mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors">

                  下载 {autoLastResult.filename}

                </a>

              )}

            </div>

          )}



          {/* 已配置的自动导出组 */}

          {autoLoading ? (

            <div className="flex justify-center py-4"><Loader2 className="animate-spin w-5 h-5 text-violet-400" /></div>

          ) : (

            <div className="space-y-2 mb-4">

              {autoConfigs.length === 0 && !autoAvailable.length && (

                <p className="text-xs text-slate-400 text-center py-2">暂无配置，请先创建语料组</p>

              )}

              {autoConfigs.map(config => (

                <div key={config.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">

                  <span className="text-sm text-slate-700 font-medium min-w-[120px] truncate">{config.group_name}</span>

                  <input

                    type="text"

                    value={autoEdits.get(config.id) || ''}

                    onChange={e => setAutoEdits(prev => new Map(prev).set(config.id, e.target.value))}

                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

                    placeholder="拼音地区"

                  />

                  <button onClick={() => handleSaveAutoRegion(config.id)} disabled={autoSaving}

                    className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-bold disabled:opacity-50">

                    保存

                  </button>

                  <button onClick={() => handleDeleteAutoConfig(config.id)}

                    className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 rounded text-xs">

                    删除

                  </button>

                </div>

              ))}



              {/* 添加新配置 */}

              {autoAvailable.length > 0 && (

                <div className="flex items-center gap-2 p-2 border-2 border-dashed border-slate-200 rounded-lg">

                  <select

                    value={autoNewGroupId}

                    onChange={e => setAutoNewGroupId(Number(e.target.value) || '')}

                    className="px-2 py-1 border border-slate-200 rounded text-sm min-w-[120px] focus:outline-none focus:ring-2 focus:ring-violet-300"

                  >

                    <option value="">选择语料组</option>

                    {autoAvailable.map(g => (

                      <option key={g.id} value={g.id}>{g.name}</option>

                    ))}

                  </select>

                  <input

                    type="text"

                    value={autoNewRegion}

                    onChange={e => setAutoNewRegion(e.target.value)}

                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

                    placeholder="拼音地区（如 quanzhou）"

                  />

                  <button onClick={handleAddAutoConfig} disabled={autoSaving || !autoNewGroupId || !autoNewRegion.trim()}

                    className="px-3 py-1 bg-violet-500 hover:bg-violet-600 text-white rounded text-xs font-bold disabled:opacity-50">

                    添加

                  </button>

                </div>

              )}

            </div>

          )}

        </div>



        {/* 任务进度显示 */}

        {taskId && (taskStatus === 'pending' || taskStatus === 'running') && (

          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

            <div className="text-center mb-4">

              <Loader2 className="animate-spin w-8 h-8 text-violet-500 mx-auto mb-3" />

              <h2 className="text-lg font-bold text-slate-800">正在导出...</h2>

              <p className="text-sm text-slate-500 mt-1">{taskMessage}</p>

            </div>

            <div className="w-full bg-slate-200 rounded-full h-3 mb-2">

              <div

                className="bg-violet-500 h-3 rounded-full transition-all duration-300"

                style={{ width: `${taskProgress}%` }}

              />

            </div>

            <p className="text-center text-sm text-slate-600">{taskProgress}%</p>

          </div>

        )}



        {/* 导出成功 */}

        {taskResult && (

          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

            <div className="text-center mb-6">

              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">

                <DownloadIcon className="w-8 h-8 text-green-600" />

              </div>

              <h2 className="text-xl font-bold text-green-600 mb-2">导出成功！</h2>

            </div>



            <div className="bg-slate-50 rounded-lg p-4 mb-4">

              <div className="grid grid-cols-2 gap-4">

                {taskResult.regions_count && (

                  <div>

                    <p className="text-sm text-slate-500">导出地区</p>

                    <p className="font-bold text-slate-800">{taskResult.regions_count} 个</p>

                  </div>

                )}

                {taskResult.packages_count && (

                  <div>

                    <p className="text-sm text-slate-500">导出包数</p>

                    <p className="font-bold text-slate-800">{taskResult.packages_count} 个</p>

                  </div>

                )}

                <div>

                  <p className="text-sm text-slate-500">有效文件</p>

                  <p className="font-bold text-green-600">{taskResult.total_files} 个</p>

                </div>

                <div>

                  <p className="text-sm text-slate-500">总时长</p>

                  <p className="font-bold text-slate-800">{Math.floor(taskResult.total_duration / 60)} 分钟</p>

                </div>

              </div>

            </div>



            <div className="bg-blue-50 rounded-lg p-4 mb-4">

              <p className="text-sm text-blue-700 mb-2">文件名：{taskResult.filename}</p>

              <p className="text-xs text-slate-500 mb-2">下载链接：</p>

              <a

                href={taskResult.download_url}

                target="_blank"

                rel="noopener noreferrer"

                className="block w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold text-center transition-colors"

              >

                点击下载

              </a>

              <p className="text-xs text-blue-600 mt-2 break-all select-all">{taskResult.download_url}</p>

            </div>



            <button

              onClick={handleClose}

              className="w-full px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"

            >

              继续导出

            </button>

          </div>

        )}



        {/* 导出失败 */}

        {taskStatus === 'failed' && (

          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

            <div className="text-center mb-4">

              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">

                <span className="text-3xl">❌</span>

              </div>

              <h2 className="text-xl font-bold text-red-600 mb-2">导出失败</h2>

              <p className="text-sm text-slate-600">{error || taskMessage}</p>

            </div>

            <button

              onClick={handleClose}

              className="w-full px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"

            >

              重试

            </button>

          </div>

        )}



        {/* 导出表单 */}

        {!taskId && !taskResult && taskStatus !== 'failed' && (

          <>

            {/* Corpus Groups Selection */}

            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">

              <div className="flex items-center justify-between mb-4">

                <h3 className="text-sm font-bold text-slate-700">

                  选择语料组（已选 {selectedGroups.size} / {corpusGroups.length}）

                </h3>

                <button

                  onClick={toggleAll}

                  className="px-3 py-1 text-xs bg-violet-100 text-violet-600 rounded-lg hover:bg-violet-200 transition-colors"

                >

                  {selectedGroups.size === corpusGroups.length ? '取消全选' : '全选'}

                </button>

              </div>



              {loading ? (

                <div className="flex justify-center py-8">

                  <Loader2 className="animate-spin w-6 h-6 text-violet-400" />

                </div>

              ) : corpusGroups.length === 0 ? (

                <div className="text-center py-8 text-slate-400">暂无语料组</div>

              ) : (

                <div className="space-y-2 max-h-96 overflow-y-auto">

                  {corpusGroups.map(group => (

                    <div

                      key={group.id}

                      className={`rounded-lg border transition-all ${

                        selectedGroups.has(group.id)

                          ? 'bg-violet-50 border-violet-300'

                          : 'bg-white border-slate-200 hover:border-slate-300'

                      }`}

                    >

                      <label className="flex items-center gap-3 p-3 cursor-pointer">

                        <input

                          type="checkbox"

                          checked={selectedGroups.has(group.id)}

                          onChange={() => toggleGroup(group.id)}

                          className="accent-violet-600"

                        />

                        <div className="flex-1 min-w-0">

                          <p className="text-sm font-medium text-slate-700 truncate">{group.name}</p>

                          <p className="text-xs text-slate-400">{group.description || '无描述'}</p>

                        </div>

                      </label>

                      {selectedGroups.has(group.id) && (

                        <div className="px-3 pb-3 pt-0">

                          <div className="flex items-center gap-2">

                            <label className="text-xs text-slate-500 whitespace-nowrap">拼音地区<span className="text-red-500">*</span></label>

                            <input

                              type="text"

                              value={groupRegions.get(group.id) || ''}

                              onChange={(e) => {

                                setGroupRegions(prev => {

                                  const m = new Map(prev);

                                  m.set(group.id, e.target.value);

                                  return m;

                                });

                              }}

                              placeholder="例如: quanzhou"

                              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

                            />

                          </div>

                        </div>

                      )}

                    </div>

                  ))}

                </div>

              )}

            </div>



            {/* Error Message */}

            {error && (

              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">

                {error}

              </div>

            )}



            {/* Export Button */}

            <button

              onClick={handleExport}

              disabled={exporting || selectedGroups.size === 0}

              className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"

            >

              {exporting ? (

                <>

                  <Loader2 className="animate-spin w-5 h-5" />

                  启动中...

                </>

              ) : (

                <>

                  <DownloadIcon className="w-5 h-5" />

                  导出 {selectedGroups.size} 个语料组

                </>

              )}

            </button>

          </>

        )}

      </div>

    </div>

  );

};



// ── 已合格包管理视图 ──────────────────────────────────────────────────

const QualityApprovedPackagesView: React.FC<{

  onBack: () => void;

}> = ({ onBack }) => {

  const [groups, setGroups] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [selectedPkgs, setSelectedPkgs] = useState<Set<number>>(new Set());

  const [targetStage, setTargetStage] = useState<string>('annotator');

  const [rejectReason, setRejectReason] = useState('');

  const [rejecting, setRejecting] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const [confirmDialog, setConfirmDialog] = useState<{ type: 'single' | 'multi' | 'group' | 'all'; pkgIds: number[]; groupName?: string } | null>(null);

  const [previewPkg, setPreviewPkg] = useState<any>(null);

  const [previewLoading, setPreviewLoading] = useState(false);

  const [playingId, setPlayingId] = useState<number | null>(null);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);



  // 筛选相关状态

  const [allUsers, setAllUsers] = useState<{ id: number; username: string; real_name?: string; role: string }[]>([]);

  const [selectedCollectors, setSelectedCollectors] = useState<Set<number>>(new Set());

  const [selectedAnnotators, setSelectedAnnotators] = useState<Set<number>>(new Set());

  const [selectedInspectors, setSelectedInspectors] = useState<Set<number>>(new Set());

  const [showCollectorDropdown, setShowCollectorDropdown] = useState(false);

  const [showAnnotatorDropdown, setShowAnnotatorDropdown] = useState(false);

  const [showInspectorDropdown, setShowInspectorDropdown] = useState(false);

  const [collectorSearch, setCollectorSearch] = useState('');

  const [annotatorSearch, setAnnotatorSearch] = useState('');

  const [inspectorSearch, setInspectorSearch] = useState('');



  const collectorDropdownRef = React.useRef<HTMLDivElement>(null);

  const annotatorDropdownRef = React.useRef<HTMLDivElement>(null);

  const inspectorDropdownRef = React.useRef<HTMLDivElement>(null);



  // 加载用户列表

  useEffect(() => {

    const fetchUsers = async () => {

      try {

        const res = await apiFetch(getApiUrl('/users?limit=1000'));

        const data = await res.json();

        setAllUsers(data.data ?? []);

      } catch { /* ignore */ }

    };

    fetchUsers();

  }, []);



  // 点击外部关闭下拉框

  useEffect(() => {

    const handleClickOutside = (e: MouseEvent) => {

      if (collectorDropdownRef.current && !collectorDropdownRef.current.contains(e.target as Node)) setShowCollectorDropdown(false);

      if (annotatorDropdownRef.current && !annotatorDropdownRef.current.contains(e.target as Node)) setShowAnnotatorDropdown(false);

      if (inspectorDropdownRef.current && !inspectorDropdownRef.current.contains(e.target as Node)) setShowInspectorDropdown(false);

    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);

  }, []);



  const fetchApprovedPackages = async () => {

    setLoading(true);

    setError('');

    try {

      const params = new URLSearchParams();

      if (selectedCollectors.size > 0) params.set('collector_ids', Array.from(selectedCollectors).join(','));

      if (selectedAnnotators.size > 0) params.set('annotator_ids', Array.from(selectedAnnotators).join(','));

      if (selectedInspectors.size > 0) params.set('inspector_ids', Array.from(selectedInspectors).join(','));

      const query = params.toString();

      const res = await apiFetch(getApiUrl(`/admin/quality-approved-packages${query ? '?' + query : ''}`));

      const data = await res.json();

      if (res.ok) {

        setGroups(data.data ?? []);

        // 默认展开所有组

        setExpandedGroups(new Set((data.data ?? []).map((g: any) => g.group_id)));

      } else {

        setError(data.detail || '加载失败');

      }

    } catch {

      setError('网络异常');

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => { fetchApprovedPackages(); }, [selectedCollectors, selectedAnnotators, selectedInspectors]);



  const fetchPreview = async (pkgId: number) => {

    setPreviewLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/package-detail/${pkgId}`));

      const data = await res.json();

      if (res.ok && data.data) {

        setPreviewPkg(data.data);

      } else {

        alert(data.detail || '加载失败');

      }

    } catch {

      alert('网络异常');

    } finally {

      setPreviewLoading(false);

    }

  };



  const playAudio = async (recordingId: number) => {

    if (playingId === recordingId) {

      audioRef.current?.pause();

      setPlayingId(null);

      return;

    }

    try {

      const res = await apiFetch(getApiUrl(`/admin/download-recording/${recordingId}`));

      const data = await res.json();

      if (res.ok && data.data?.url) {

        if (audioRef.current) audioRef.current.pause();

        const audio = new Audio(data.data.url);

        audioRef.current = audio;

        audio.onended = () => setPlayingId(null);

        audio.play();

        setPlayingId(recordingId);

      }

    } catch { /* ignore */ }

  };



  const toggleGroup = (gid: number) => {

    setExpandedGroups(prev => {

      const s = new Set(prev);

      s.has(gid) ? s.delete(gid) : s.add(gid);

      return s;

    });

  };



  const togglePkg = (pid: number) => {

    setSelectedPkgs(prev => {

      const s = new Set(prev);

      s.has(pid) ? s.delete(pid) : s.add(pid);

      return s;

    });

  };



  const toggleGroupPkgs = (gid: number) => {

    const group = groups.find(g => g.group_id === gid);

    if (!group) return;

    const allSelected = group.packages.every((p: any) => selectedPkgs.has(p.id));

    setSelectedPkgs(prev => {

      const s = new Set(prev);

      group.packages.forEach((p: any) => {

        allSelected ? s.delete(p.id) : s.add(p.id);

      });

      return s;

    });

  };



  const doReject = async (pkgIds: number[]) => {

    if (pkgIds.length === 0) return;

    setRejecting(true);

    setError('');

    try {

      const res = await apiFetch(getApiUrl('/admin/reject-packages'), {

        method: 'POST',

        body: JSON.stringify({

          package_ids: pkgIds,

          target_stage: targetStage,

          reason: rejectReason,

        }),

      });

      const data = await res.json();

      if (res.ok) {

        alert(data.msg);

        setSelectedPkgs(new Set());

        setRejectReason('');

        fetchApprovedPackages();

      } else {

        setError(data.detail || '打回失败');

      }

    } catch {

      setError('网络异常');

    } finally {

      setRejecting(false);

      setConfirmDialog(null);

    }

  };



  const stageOptions = [

    { value: 'annotator', label: '打回到标注员', desc: '清除标注/质检/审核，重新标注' },

    { value: 'inspector', label: '打回到质检员', desc: '保留标注，清除质检/审核' },

    { value: 'quality_reviewer', label: '打回到质检审核员', desc: '保留标注和质检，清除审核' },

  ];



  const totalPackages = groups.reduce((sum, g) => sum + g.packages.length, 0);



  // 获取筛选后的用户列表

  const getFilteredUsers = (role: string, search: string) => {

    return allUsers

      .filter(u => u.role === role)

      .filter(u => {

        if (!search) return true;

        const s = search.toLowerCase();

        return u.username.toLowerCase().includes(s) || (u.real_name || '').toLowerCase().includes(s);

      });

  };



  // 多选组件

  const MultiSelectFilter: React.FC<{

    label: string;

    role: string;

    selected: Set<number>;

    setSelected: (s: Set<number>) => void;

    show: boolean;

    setShow: (v: boolean) => void;

    search: string;

    setSearch: (v: string) => void;

    dropdownRef: React.RefObject<HTMLDivElement | null>;

  }> = ({ label, role, selected, setSelected, show, setShow, search, setSearch, dropdownRef }) => {

    const filteredUsers = getFilteredUsers(role, search);

    const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selected.has(u.id));

    const toggleUser = (userId: number) => {

      const newSet = new Set(selected);

      newSet.has(userId) ? newSet.delete(userId) : newSet.add(userId);

      setSelected(newSet);

    };

    const toggleAll = () => {

      if (allFilteredSelected) {

        const newSet = new Set(selected);

        filteredUsers.forEach(u => newSet.delete(u.id));

        setSelected(newSet);

      } else {

        const newSet = new Set(selected);

        filteredUsers.forEach(u => newSet.add(u.id));

        setSelected(newSet);

      }

    };

    return (

      <div className="relative" ref={dropdownRef}>

        <button

          type="button"

          onClick={() => setShow(!show)}

          className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm text-slate-700 min-w-[140px] flex items-center justify-between gap-2"

        >

          <span className="truncate">

            {selected.size === 0 ? label : `已选 ${selected.size} 人`}

          </span>

          <ChevronLeft className={`w-4 h-4 text-slate-400 transition-transform ${show ? 'rotate-90' : '-rotate-90'}`} />

        </button>

        {show && (

          <div className="absolute z-20 mt-1 left-0 w-56 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-hidden flex flex-col">

            <div className="p-2 border-b border-slate-100">

              <input

                type="text"

                value={search}

                onChange={e => setSearch(e.target.value)}

                placeholder="搜索账号或姓名..."

                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-300"

                onClick={e => e.stopPropagation()}

              />

            </div>

            <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50 cursor-pointer hover:bg-slate-100">

              <input

                type="checkbox"

                checked={allFilteredSelected}

                onChange={toggleAll}

                className="accent-violet-600"

              />

              <span className="text-sm font-medium text-slate-700">全选{search ? '（搜索结果）' : ''}</span>

            </label>

            <div className="overflow-y-auto flex-1">

              {filteredUsers.length === 0 ? (

                <div className="px-3 py-2 text-sm text-slate-400">无匹配项</div>

              ) : (

                filteredUsers.map(u => (

                  <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">

                    <input

                      type="checkbox"

                      checked={selected.has(u.id)}

                      onChange={() => toggleUser(u.id)}

                      className="accent-violet-600"

                    />

                    <span className="text-sm text-slate-700 truncate">

                      {u.username}{u.real_name ? ` (${u.real_name})` : ''}

                    </span>

                  </label>

                ))

              )}

            </div>

            {selected.size > 0 && (

              <div className="p-2 border-t border-slate-100">

                <button

                  type="button"

                  onClick={() => setSelected(new Set())}

                  className="w-full px-2 py-1 text-xs text-slate-500 hover:text-slate-700 underline"

                >

                  清除选择

                </button>

              </div>

            )}

          </div>

        )}

      </div>

    );

  };



  return (

    <div className="w-full min-h-screen bg-slate-100 p-6">

      <div className="max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-3">

            <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm">

              <ChevronLeft className="w-5 h-5 text-slate-600" />

            </button>

            <div>

              <h1 className="text-xl font-bold text-slate-800">已合格包管理</h1>

              <p className="text-sm text-slate-500">管理所有已通过质检审核的包，支持打回到任意阶段</p>

            </div>

          </div>

          <button onClick={fetchApprovedPackages} className="p-2 text-slate-400 hover:text-violet-500 transition-colors">

            <RefreshCw className="w-5 h-5" />

          </button>

        </div>



        {/* 筛选栏 */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">

          <div className="flex flex-wrap items-center gap-3">

            <span className="text-sm text-slate-600 font-medium">筛选：</span>

            <MultiSelectFilter

              label="采集员"

              role="collector"

              selected={selectedCollectors}

              setSelected={setSelectedCollectors}

              show={showCollectorDropdown}

              setShow={setShowCollectorDropdown}

              search={collectorSearch}

              setSearch={setCollectorSearch}

              dropdownRef={collectorDropdownRef}

            />

            <MultiSelectFilter

              label="标注员"

              role="annotator"

              selected={selectedAnnotators}

              setSelected={setSelectedAnnotators}

              show={showAnnotatorDropdown}

              setShow={setShowAnnotatorDropdown}

              search={annotatorSearch}

              setSearch={setAnnotatorSearch}

              dropdownRef={annotatorDropdownRef}

            />

            <MultiSelectFilter

              label="质检员"

              role="inspector"

              selected={selectedInspectors}

              setSelected={setSelectedInspectors}

              show={showInspectorDropdown}

              setShow={setShowInspectorDropdown}

              search={inspectorSearch}

              setSearch={setInspectorSearch}

              dropdownRef={inspectorDropdownRef}

            />

            {(selectedCollectors.size > 0 || selectedAnnotators.size > 0 || selectedInspectors.size > 0) && (

              <button

                onClick={() => {

                  setSelectedCollectors(new Set());

                  setSelectedAnnotators(new Set());

                  setSelectedInspectors(new Set());

                }}

                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 underline"

              >

                清除全部筛选

              </button>

            )}

          </div>

        </div>



        {/* 操作栏 */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">

          <div className="flex flex-wrap items-center gap-4">

            <div className="flex items-center gap-2">

              <label className="text-sm text-slate-600 font-medium">打回到：</label>

              <select

                value={targetStage}

                onChange={e => setTargetStage(e.target.value)}

                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              >

                {stageOptions.map(opt => (

                  <option key={opt.value} value={opt.value}>{opt.label}</option>

                ))}

              </select>

            </div>

            <div className="flex-1 min-w-[200px]">

              <input

                type="text"

                value={rejectReason}

                onChange={e => setRejectReason(e.target.value)}

                placeholder="打回原因（可选）"

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <button

              onClick={() => {

                if (selectedPkgs.size === 0) { alert('请先选择要打回的包'); return; }

                setConfirmDialog({ type: 'multi', pkgIds: Array.from(selectedPkgs) });

              }}

              disabled={rejecting || selectedPkgs.size === 0}

              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg text-sm font-bold transition-colors"

            >

              打回选中 ({selectedPkgs.size})

            </button>

            <button

              onClick={() => {

                if (totalPackages === 0) { alert('没有可打回的包'); return; }

                setConfirmDialog({ type: 'all', pkgIds: groups.flatMap(g => g.packages.map((p: any) => p.id)) });

              }}

              disabled={rejecting || totalPackages === 0}

              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-lg text-sm font-bold transition-colors"

            >

              全部打回 ({totalPackages})

            </button>

          </div>

          <p className="text-xs text-slate-400 mt-2">{stageOptions.find(o => o.value === targetStage)?.desc}</p>

        </div>



        {/* 错误提示 */}

        {error && (

          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>

        )}



        {/* 内容 */}

        {loading ? (

          <div className="bg-white rounded-xl shadow-sm p-12 text-center">

            <Loader2 className="animate-spin w-8 h-8 text-violet-400 mx-auto mb-3" />

            <p className="text-slate-500">加载中...</p>

          </div>

        ) : groups.length === 0 ? (

          <div className="bg-white rounded-xl shadow-sm p-12 text-center">

            <p className="text-slate-400">暂无已合格的包</p>

          </div>

        ) : (

          <div className="space-y-3">

            {groups.map(group => {

              const isExpanded = expandedGroups.has(group.group_id);

              const groupPkgIds = group.packages.map((p: any) => p.id);

              const allGroupSelected = group.packages.every((p: any) => selectedPkgs.has(p.id));



              return (

                <div key={group.group_id} className="bg-white rounded-xl shadow-sm overflow-hidden">

                  {/* 组头 */}

                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">

                    <input

                      type="checkbox"

                      checked={allGroupSelected && group.packages.length > 0}

                      onChange={() => toggleGroupPkgs(group.group_id)}

                      className="accent-violet-600"

                    />

                    <button

                      onClick={() => toggleGroup(group.group_id)}

                      className="flex items-center gap-2 flex-1 text-left"

                    >

                      <span className="text-sm text-slate-400">{isExpanded ? '▼' : '▶'}</span>

                      <h3 className="text-sm font-bold text-slate-700">{group.group_name}</h3>

                      <span className="text-xs text-slate-400">({group.packages.length} 个包)</span>

                    </button>

                    <button

                      onClick={() => setConfirmDialog({ type: 'group', pkgIds: groupPkgIds, groupName: group.group_name })}

                      disabled={rejecting}

                      className="px-3 py-1 text-xs bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors font-medium"

                    >

                      整组打回

                    </button>

                  </div>



                  {/* 包列表 */}

                  {isExpanded && (

                    <div className="divide-y divide-slate-100">

                      {group.packages.map((pkg: any) => (

                        <div key={pkg.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">

                          <input

                            type="checkbox"

                            checked={selectedPkgs.has(pkg.id)}

                            onChange={() => togglePkg(pkg.id)}

                            className="accent-violet-600"

                          />

                          <div className="flex-1 min-w-0 grid grid-cols-6 gap-2 items-center">

                            <div className="col-span-1">

                              <p className="text-sm font-medium text-slate-700 truncate">{pkg.name}</p>

                              <p className="text-xs text-slate-400">#{pkg.id}</p>

                            </div>

                            <div className="text-xs text-slate-500">

                              <span className="text-slate-400">采集：</span>{pkg.collector || '-'}

                            </div>

                            <div className="text-xs text-slate-500">

                              <span className="text-slate-400">标注：</span>{pkg.annotator || '-'}

                            </div>

                            <div className="text-xs text-slate-500">

                              <span className="text-slate-400">质检：</span>{pkg.inspector || '-'}

                            </div>

                            <div className="text-xs text-slate-500">

                              <span className="text-slate-400">审核：</span>{pkg.quality_reviewer || '-'}

                            </div>

                            <div className="text-xs text-slate-400 text-right">

                              {pkg.recording_count} 条录音

                            </div>

                          </div>

                          <button

                            onClick={() => { fetchPreview(pkg.id); }}

                            disabled={previewLoading}

                            className="px-2 py-1 text-xs bg-violet-50 text-violet-500 rounded hover:bg-violet-100 transition-colors"

                          >

                            预览

                          </button>

                          <button

                            onClick={() => setConfirmDialog({ type: 'single', pkgIds: [pkg.id] })}

                            disabled={rejecting}

                            className="px-2 py-1 text-xs bg-orange-50 text-orange-500 rounded hover:bg-orange-100 transition-colors"

                          >

                            打回

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



        {/* 确认弹窗 */}

        {confirmDialog && (

          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

              <div className="p-6">

                <h3 className="text-lg font-bold text-slate-800 mb-2">确认打回</h3>

                <p className="text-sm text-slate-600 mb-4">

                  {confirmDialog.type === 'single' && `确定要打回这 1 个包吗？`}

                  {confirmDialog.type === 'multi' && `确定要打回选中的 ${confirmDialog.pkgIds.length} 个包吗？`}

                  {confirmDialog.type === 'group' && `确定要打回「${confirmDialog.groupName}」的全部 ${confirmDialog.pkgIds.length} 个包吗？`}

                  {confirmDialog.type === 'all' && `确定要打回全部 ${confirmDialog.pkgIds.length} 个已合格的包吗？`}

                </p>

                <div className="bg-orange-50 rounded-lg p-3 mb-4">

                  <p className="text-sm text-orange-700">

                    <span className="font-bold">目标阶段：</span>

                    {stageOptions.find(o => o.value === targetStage)?.label}

                  </p>

                  {rejectReason && <p className="text-sm text-orange-700 mt-1"><span className="font-bold">原因：</span>{rejectReason}</p>}

                </div>

              </div>

              <div className="p-4 border-t border-slate-200 flex gap-3">

                <button

                  onClick={() => setConfirmDialog(null)}

                  className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-sm transition-all"

                >

                  取消

                </button>

                <button

                  onClick={() => doReject(confirmDialog.pkgIds)}

                  disabled={rejecting}

                  className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"

                >

                  {rejecting ? <Loader2 className="animate-spin w-4 h-4" /> : null}

                  {rejecting ? '处理中...' : '确认打回'}

                </button>

              </div>

            </div>

          </div>

        )}



        {/* 预览弹窗 */}

        {previewPkg && (

          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setPreviewPkg(null); setPlayingId(null); audioRef.current?.pause(); }}>

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">

                <div>

                  <h3 className="text-lg font-bold text-slate-800">{previewPkg.name}</h3>

                  <p className="text-xs text-slate-500 mt-1">

                    包#{previewPkg.id} · {previewPkg.corpus_group_name} · 采集：{previewPkg.collector_name} · {previewPkg.corpus_list?.length || 0} 条语料

                  </p>

                </div>

                <button onClick={() => { setPreviewPkg(null); setPlayingId(null); audioRef.current?.pause(); }}

                  className="p-2 hover:bg-slate-100 rounded-full">

                  <span className="text-xl text-slate-400">×</span>

                </button>

              </div>

              <div className="flex-1 overflow-y-auto p-4">

                {previewLoading ? (

                  <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>

                ) : (

                  <div className="space-y-2">

                    {(previewPkg.corpus_list || []).map((item: any, idx: number) => (

                      <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">

                        <span className="text-xs text-slate-400 font-mono w-8 text-right pt-0.5">{idx + 1}</span>

                        <div className="flex-1 min-w-0">

                          <p className="text-sm text-slate-700 break-words">{item.content}</p>

                          <div className="flex items-center gap-3 mt-1">

                            <span className="text-xs text-slate-400">{item.text_id}</span>

                            {item.is_valid === true && <span className="text-xs text-green-600">✓ 有效</span>}

                            {item.is_valid === false && <span className="text-xs text-red-500">✗ 无效</span>}

                            {item.was_rejected && <span className="text-xs text-orange-500">曾被打回</span>}

                          </div>

                        </div>

                        {item.recording_id && (

                          <button

                            onClick={() => playAudio(item.recording_id)}

                            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${

                              playingId === item.recording_id

                                ? 'bg-violet-100 text-violet-700'

                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'

                            }`}

                          >

                            {playingId === item.recording_id ? '⏸ 暂停' : '▶ 试听'}

                          </button>

                        )}

                      </div>

                    ))}

                  </div>

                )}

              </div>

            </div>

          </div>

        )}

      </div>

    </div>

  );

};



// ── 审核员管理视图 ──────────────────────────────────────────────────

const ReviewerManagementView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack, userId }) => {

  const [reviewers, setReviewers] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const [searchText, setSearchText] = useState('');

  const [selectedReviewers, setSelectedReviewers] = useState<number[]>([]);

  const [reviewerDropdownOpen, setReviewerDropdownOpen] = useState(false);

  const [allReviewers, setAllReviewers] = useState<any[]>([]);

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  const [page, setPage] = useState(0);

  const [total, setTotal] = useState(0);

  const PAGE_SIZE = 20;



  // 获取所有审核员列表

  useEffect(() => {

    const fetchReviewers = async () => {

      try {

        const res = await apiFetch(getApiUrl('/admin/users/simple'));

        const data = await res.json();

        if (res.ok) {

          // 只显示审核员（reviewer 和 quality_reviewer）

          const reviewers = (data.data ?? []).filter((u: any) => u.role === 'reviewer' || u.role === 'quality_reviewer');

          setAllReviewers(reviewers);

        }

      } catch (err) {

        console.error('Failed to fetch reviewers:', err);

      }

    };

    fetchReviewers();

  }, []);



  const fetchReviewerStats = async (p?: number) => {

    const currentPage = p ?? page;

    setLoading(true);

    try {

      let url = getApiUrl(`/admin/reviewer-stats?user_id=${userId}&limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`);



      // 添加筛选参数

      if (selectedReviewers.length > 0) {

        url += `&reviewer_ids=${selectedReviewers.join(',')}`;

      }

      if (startDate) {

        url += `&start_date=${startDate}`;

      }

      if (endDate) {

        url += `&end_date=${endDate}`;

      }



      const res = await apiFetch(url);

      const data = await res.json();

      if (res.ok) {

        setReviewers(data.data.reviewers ?? []);

        setTotal(data.data.total ?? 0);

      }

    } catch (err) {

      console.error('Failed to fetch reviewer stats:', err);

    } finally {

      setLoading(false);

    }

  };



  useEffect(() => {

    setPage(0);

    fetchReviewerStats(0);

  }, [selectedReviewers, startDate, endDate]);



  const toggleReviewer = (reviewerId: number) => {

    setSelectedReviewers(prev =>

      prev.includes(reviewerId)

        ? prev.filter(id => id !== reviewerId)

        : [...prev, reviewerId]

    );

  };



  // 搜索过滤（客户端过滤，因为数据已经分页）

  const filteredReviewers = reviewers.filter(r =>

    r.username.toLowerCase().includes(searchText.toLowerCase())

  );



  return (

    <div className="w-full min-h-screen bg-slate-100 p-6">

      <div className="max-w-6xl mx-auto">

        {/* Header */}

        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-3">

            <button onClick={onBack} className="p-2 hover:bg-white rounded-full shadow-sm">

              <ChevronLeft className="w-5 h-5 text-slate-600" />

            </button>

            <div>

              <h1 className="text-xl font-bold text-slate-800">审核员管理</h1>

              <p className="text-sm text-slate-500">查看采集审核员和质检审核员的作业情况</p>

            </div>

          </div>

          <button onClick={() => fetchReviewerStats(page)} className="p-2 text-slate-400 hover:text-blue-500 transition-colors">

            <RefreshCw className="w-5 h-5" />

          </button>

        </div>



        {/* Stats */}

        <div className="grid grid-cols-2 gap-4 mb-6">

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">采集审核员</p>

            <p className="text-2xl font-bold text-purple-600">

              {reviewers.filter(r => r.username && allReviewers.find(a => a.id === r.id && a.role === 'reviewer')).length}

            </p>

          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">

            <p className="text-sm text-slate-500">质检审核员</p>

            <p className="text-2xl font-bold text-rose-600">

              {reviewers.filter(r => r.username && allReviewers.find(a => a.id === r.id && a.role === 'quality_reviewer')).length}

            </p>

          </div>

        </div>



        {/* Filters */}

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">

          <div className="flex flex-wrap items-end gap-4">

            <div className="flex-1 min-w-[200px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">搜索账号</label>

              <input

                type="text"

                value={searchText}

                onChange={(e) => setSearchText(e.target.value)}

                placeholder="输入账号名称..."

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <div className="flex-1 min-w-[200px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">审核员（多选）</label>

              <div className="relative">

                <button

                  type="button"

                  onClick={() => setReviewerDropdownOpen(!reviewerDropdownOpen)}

                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 flex items-center justify-between"

                >

                  <span className="truncate">

                    {selectedReviewers.length === 0

                      ? '选择审核员...'

                      : `${selectedReviewers.length} 人已选`}

                  </span>

                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${reviewerDropdownOpen ? 'rotate-180' : ''}`} />

                </button>

                {reviewerDropdownOpen && (

                  <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">

                    {allReviewers.map((reviewer) => (

                      <label

                        key={reviewer.id}

                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"

                      >

                        <input

                          type="checkbox"

                          checked={selectedReviewers.includes(reviewer.id)}

                          onChange={() => toggleReviewer(reviewer.id)}

                          className="accent-violet-600"

                        />

                        <span className="text-sm text-slate-700">{reviewer.username}</span>

                        <span className="text-xs text-slate-400">({reviewer.role === 'reviewer' ? '采集审核员' : '质检审核员'})</span>

                      </label>

                    ))}

                  </div>

                )}

              </div>

            </div>

            <div className="flex-1 min-w-[150px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>

              <input

                type="date"

                value={startDate}

                onChange={(e) => setStartDate(e.target.value)}

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <div className="flex-1 min-w-[150px]">

              <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>

              <input

                type="date"

                value={endDate}

                onChange={(e) => setEndDate(e.target.value)}

                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

              />

            </div>

            <button

              onClick={() => { setSearchText(''); setSelectedReviewers([]); setStartDate(''); setEndDate(''); setPage(0); }}

              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 underline"

            >

              清除筛选

            </button>

          </div>

        </div>



        {/* 审核员表格 */}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">

          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">

            <h2 className="text-lg font-bold text-slate-800">审核员列表</h2>

          </div>

          {loading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin w-8 h-8 text-violet-400" />

            </div>

          ) : filteredReviewers.length === 0 ? (

            <div className="flex flex-col items-center py-12 text-slate-400">

              <ShieldCheck className="w-12 h-12 mb-3 opacity-30" />

              <p>暂无数据</p>

            </div>

          ) : (

            <>

              <table className="w-full">

                <thead>

                  <tr className="border-b border-slate-100 bg-slate-50">

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">账号</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">角色</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">所属分组</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">包数</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">条数</th>

                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-600">今日作业量</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-100">

                  {filteredReviewers.map((reviewer) => {

                    const reviewerInfo = allReviewers.find(a => a.id === reviewer.id);

                    const role = reviewerInfo?.role === 'reviewer' ? '采集审核员' :

                      reviewerInfo?.role === 'quality_reviewer' ? '质检审核员' : '未知';

                    return (

                      <tr key={reviewer.id} className="hover:bg-slate-50">

                        <td className="px-6 py-4 text-sm font-medium text-slate-800">{reviewer.username}</td>

                        <td className="px-6 py-4 text-xs text-slate-500">{role}</td>

                        <td className="px-6 py-4 text-xs text-slate-500">

                          {reviewer.group_names.length > 0 ? reviewer.group_names.map((g: string) => (

                            <span key={g} className="inline-block px-2 py-0.5 bg-slate-100 rounded-full mr-1 mb-0.5">{g}</span>

                          )) : <span className="text-slate-300">-</span>}

                        </td>

                        <td className="px-6 py-4 text-sm text-slate-600">{reviewer.packages}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{Math.round(reviewer.corpus_count * 0.15)}</td>

                        <td className="px-6 py-4 text-sm text-slate-600">{reviewer.today_count}</td>

                      </tr>

                    );

                  })}

                </tbody>

              </table>



              {/* Pagination */}

              {total > PAGE_SIZE && (

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">

                  <span className="text-sm text-slate-500">

                    共 {total} 条，第 {page + 1} 页 / 共 {Math.ceil(total / PAGE_SIZE)} 页

                  </span>

                  <div className="flex items-center gap-2">

                    <button

                      onClick={() => {

                        setPage(p => Math.max(0, p - 1));

                        fetchReviewerStats(page - 1);

                      }}

                      disabled={page === 0}

                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"

                    >

                      <ChevronLeft className="w-4 h-4 text-slate-600" />

                    </button>

                    <button

                      onClick={() => {

                        setPage(p => p + 1);

                        fetchReviewerStats(page + 1);

                      }}

                      disabled={page >= Math.ceil(total / PAGE_SIZE) - 1}

                      className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"

                    >

                      <ChevronLeft className="w-4 h-4 text-slate-600 rotate-180" />

                    </button>

                  </div>

                </div>

              )}

            </>

          )}

        </div>

      </div>

    </div>

  );

};



// ── 语料组审核视图 ──────────────────────────────────────────────────

interface CorpusGroupSimple {

  id: number;

  name: string;

}



const CorpusGroupsReviewView: React.FC<{

  onSelectGroup: (groupId: number, groupName: string) => void;

  onBack: () => void;

}> = ({ onSelectGroup, onBack }) => {

  const [groups, setGroups] = React.useState<CorpusGroupSimple[]>([]);

  const [loading, setLoading] = React.useState(false);

  const [page, setPage] = React.useState(0);

  const [total, setTotal] = React.useState(0);

  const PAGE_SIZE = 10;



  const fetchGroups = async (p?: number) => {

    const currentPage = p ?? page;

    setLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/corpus-groups?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`));

      const json = await res.json();

      setGroups(json.data ?? []);

      setTotal(json.total ?? 0);

    } finally {

      setLoading(false);

    }

  };



  React.useEffect(() => {

    fetchGroups();

  }, []);



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-2xl">

        <div className="flex items-center gap-2 mb-6">

          <button onClick={onBack} className="p-2 hover:bg-white rounded-lg transition-colors">

            <ChevronLeft className="w-5 h-5 text-slate-600" />

          </button>

          <h1 className="text-2xl font-bold text-slate-800">采集包审核</h1>

        </div>



        {loading ? (

          <div className="flex justify-center py-20">

            <Loader2 className="animate-spin w-8 h-8 text-violet-400" />

          </div>

        ) : groups.length === 0 ? (

          <div className="flex flex-col items-center py-20 text-slate-400">

            <p className="text-sm">暂无语料组</p>

          </div>

        ) : (

          <div className="grid gap-3">

            {groups.map(group => (

              <button

                key={group.id}

                onClick={() => onSelectGroup(group.id, group.name)}

                className="w-full p-4 bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 hover:border-violet-300 transition-all text-left"

              >

                <div className="flex items-center justify-between">

                  <div>

                    <p className="font-semibold text-slate-800">{group.name}</p>

                    {(group as any).pending_review_count > 0 && (

                      <p className="text-xs text-orange-500 mt-1">{(group as any).pending_review_count} 个包待审核</p>

                    )}

                  </div>

                  <div className="flex items-center gap-2">

                    {(group as any).pending_review_count > 0 && (

                      <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full">

                        {(group as any).pending_review_count}

                      </span>

                    )}

                    <ChevronLeft className="w-5 h-5 text-slate-400 rotate-180" />

                  </div>

                </div>

              </button>

            ))}

          </div>

        )}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={(p) => { setPage(p); fetchGroups(p); }} />

      </div>

    </div>

  );

};



// ── 采集员包列表 ──────────────────────────────────────────────────

interface CollectorPackage {

  id: number;

  name: string;

  size: number;

  status: string;

  review_status: string;

  corpus_group_name: string;

  recorded_count: number;

  total_count: number;

  claimed_at: string | null;

  reviewed_at: string | null;

  review_comment: string | null;

}



const CollectorPackagesView: React.FC<{

  collector: { id: number; username: string };

  onBack: () => void;

}> = ({ collector, onBack }) => {

  const [packages, setPackages] = useState<CollectorPackage[]>([]);

  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');



  useEffect(() => {

    fetchPackages();

  }, [collector.id]);



  const fetchPackages = async () => {

    setLoading(true);

    try {

      const res = await apiFetch(getApiUrl(`/admin/collector-packages?collector_id=${collector.id}`));

      const json = await res.json();

      setPackages(json.data ?? []);

    } finally {

      setLoading(false);

    }

  };



  const filteredPackages = packages.filter(pkg =>

    pkg.name.toLowerCase().includes(search.toLowerCase())

  );



  const REVIEW_BADGE: Record<string, string> = {

    '待审核': 'bg-amber-100 text-amber-700',

    '已合格': 'bg-green-100 text-green-700',

    '已打回': 'bg-red-100 text-red-700',

  };



  const PACKAGE_STATUS_BADGE: Record<string, string> = {

    '进行中': 'bg-blue-100 text-blue-700',

    '已完成': 'bg-green-100 text-green-700',

    '已提交': 'bg-purple-100 text-purple-700',

  };



  return (

    <div className="w-full min-h-screen bg-violet-50 flex justify-center p-4">

      <div className="w-full max-w-md">

        <SubHeader title={`${collector.username} 的包`} onBack={onBack} />



        <input

          value={search}

          onChange={e => setSearch(e.target.value)}

          placeholder="搜索包名..."

          className="w-full px-3 py-2 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-300 mb-4"

        />



        <div className="bg-white rounded-2xl shadow-sm p-5">

          {loading ? (

            <div className="flex justify-center py-6">

              <Loader2 className="animate-spin w-6 h-6 text-violet-400" />

            </div>

          ) : packages.length === 0 ? (

            <p className="text-center text-slate-400 text-sm py-6">该采集员暂无包</p>

          ) : filteredPackages.length === 0 ? (

            <p className="text-center text-slate-400 text-sm py-6">没有搜索到匹配的包</p>

          ) : (

            <ul className="space-y-3">

              {filteredPackages.map(pkg => {

                const progress = `${pkg.recorded_count}/${pkg.total_count}`;

                return (

                  <li key={pkg.id} className="border border-slate-100 rounded-xl overflow-hidden">

                    <div className="p-4 bg-slate-50 hover:bg-slate-100 transition-colors">

                      <div className="flex items-start justify-between gap-2 mb-2">

                        <p className="font-bold text-slate-800 text-sm">{pkg.name}</p>

                        <div className="flex gap-1.5 flex-wrap justify-end">

                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${PACKAGE_STATUS_BADGE[pkg.status] ?? 'bg-slate-100 text-slate-600'}`}>

                            {pkg.status}

                          </span>

                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${REVIEW_BADGE[pkg.review_status] ?? 'bg-slate-100 text-slate-600'}`}>

                            {pkg.review_status}

                          </span>

                        </div>

                      </div>

                      <p className="text-xs text-slate-500 mb-2">{pkg.corpus_group_name}</p>

                      <div className="flex items-center justify-between text-xs text-slate-600">

                        <span>进度: {progress}</span>

                        {pkg.claimed_at && <span className="text-slate-400">{pkg.claimed_at}</span>}

                      </div>

                      {pkg.review_comment && (

                        <p className="text-xs text-slate-500 mt-2">备注: {pkg.review_comment}</p>

                      )}

                    </div>

                  </li>

                );

              })}

            </ul>

          )}

        </div>

      </div>

    </div>

  );

};



// ── 管理员主界面 ──────────────────────────────────────────────────

interface UserStat {

  id: number;

  username: string;

  real_name?: string;

  packages: number;

  corpus_count: number;

  total_duration_seconds: number;

  approved_duration_seconds: number;

  group_names: string[];

  invalid_count: number;

  valid_count: number;

}



interface AdminStats {

  collectors: UserStat[];

  annotators: UserStat[];

  inspectors: UserStat[];

}



const formatDuration = (seconds: number) => {

  return `${Math.floor(seconds)}秒`;

};



// ── 方言统计视图 ──────────────────────────────────────────────────

const DialectStatsView: React.FC<{ onBack: () => void; userId: number }> = ({ onBack }) => {

  const [data, setData] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());



  useEffect(() => {

    const fetchStats = async () => {

      setLoading(true);

      try {

        const res = await apiFetch(getApiUrl('/admin/dialect-stats'));

        const json = await res.json();

        if (json.code === 200) setData(json.data);

      } catch { /* ignore */ }

      finally { setLoading(false); }

    };

    fetchStats();

  }, []);



  const toggle = (id: number) => {

    setExpanded(prev => {

      const next = new Set(prev);

      if (next.has(id)) next.delete(id); else next.add(id);

      return next;

    });

  };



  const formatDur = (s: number) => {

    if (s < 60) return `${s}秒`;

    if (s < 3600) return `${Math.floor(s / 60)}分${s % 60}秒`;

    return `${Math.floor(s / 3600)}时${Math.floor((s % 3600) / 60)}分${s % 60}秒`;

  };



  const StatCard: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = 'text-slate-800' }) => (

    <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">

      <p className="text-xs text-slate-500">{label}</p>

      <p className={`text-lg font-bold ${color}`}>{value}</p>

    </div>

  );



  return (

    <div>

      <SubHeader title="方言统计" onBack={onBack} />

      <div className="p-4">

        {loading ? (

          <p className="text-center text-slate-500 py-10">加载中...</p>

        ) : data.length === 0 ? (

          <p className="text-center text-slate-400 py-10">暂无方言数据</p>

        ) : (

          <div className="space-y-4">

            {data.map(d => {

              const isExp = expanded.has(d.id);

              return (

                <div key={d.id} className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-md border border-indigo-100 overflow-hidden">

                  <button onClick={() => toggle(d.id)} className="w-full flex items-center justify-between p-4 hover:bg-indigo-100/30 transition-colors">

                    <div className="flex items-center gap-3">

                      <span className="text-2xl">🗣️</span>

                      <div className="text-left">

                        <h3 className="text-lg font-bold text-slate-800">{d.name}</h3>

                        <p className="text-xs text-slate-500">

                          {d.regions?.length ?? 0} 个地区 · {d.total_packages} 个包 · 采集 {formatDur(d.total_duration_seconds)} · 可导出 {formatDur(d.quality_approved_duration)}

                        </p>

                      </div>

                    </div>

                    <span className="text-slate-400">{isExp ? '▲' : '▼'}</span>

                  </button>

                  {isExp && (

                    <div className="px-4 pb-4">

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">

                        <StatCard label="总包数" value={d.total_packages} />

                        <StatCard label="已完成" value={d.completed_packages} color="text-green-600" />

                        <StatCard label="已合格" value={d.approved_packages} color="text-blue-600" />

                        <StatCard label="采集总时长" value={formatDur(d.total_duration_seconds)} />

                        <StatCard label="可导出总时长" value={formatDur(d.quality_approved_duration)} color="text-emerald-600" />

                        <StatCard label="总语料条数" value={d.total_recordings} />

                        <StatCard label="已标注" value={d.annotated_count} color="text-purple-600" />

                        <StatCard label="已质检" value={d.inspected_count} color="text-amber-600" />

                        <StatCard label="可导出" value={d.quality_approved_count} color="text-emerald-600" />

                      </div>

                      {d.regions?.length > 0 && (

                        <div className="space-y-2">

                          {d.regions.map((r: any) => (

                            <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-100">

                              <h4 className="font-semibold text-slate-700 mb-2">{r.name}</h4>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">

                                <StatCard label="总包数" value={r.total_packages} />

                                <StatCard label="已完成" value={r.completed_packages} color="text-green-600" />

                                <StatCard label="已合格" value={r.approved_packages} color="text-blue-600" />

                                <StatCard label="采集总时长" value={formatDur(r.total_duration_seconds)} />

                                <StatCard label="可导出总时长" value={formatDur(r.quality_approved_duration)} color="text-emerald-600" />

                              </div>

                              {r.groups?.length > 0 && (

                                <div className="mt-2 space-y-1">

                                  {r.groups.map((g: any) => (

                                    <div key={g.id} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-1.5">

                                      <span className="font-medium text-slate-700">{g.name}</span>

                                      <div className="flex gap-3 text-xs text-slate-500">

                                        <span>包 {g.total_packages}</span>

                                        <span>完成 {g.completed_packages}</span>

                                        <span>合格 {g.approved_packages}</span>

                                        <span>采集 {formatDur(g.total_duration_seconds)}</span>

                                        <span>可导出 {formatDur(g.quality_approved_duration)}</span>

                                      </div>

                                    </div>

                                  ))}

                                </div>

                              )}

                            </div>

                          ))}

                        </div>

                      )}

                    </div>

                  )}

                </div>

              );

            })}

          </div>

        )}

      </div>

    </div>

  );

};



// ── 签名管理视图 ──────────────────────────────────────────────────

const SignatureListView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack, userId }) => {

  const [signatures, setSignatures] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);

  const [groups, setGroups] = useState<any[]>([]);

  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());

  const [exportingId, setExportingId] = useState<number | null>(null);

  const [batchExporting, setBatchExporting] = useState(false);



  const fetchGroups = async () => {

    try {

      const res = await apiFetch(getApiUrl('/admin/groups?role_type=collector&limit=500'));

      const json = await res.json();

      if (json.code === 200) setGroups(json.data ?? []);

    } catch { /* ignore */ }

  };



  const fetchSignatures = async () => {

    setLoading(true);

    try {

      let url = `/admin/agreement-signatures?user_id=${userId}`;

      // 多选分组时，逐个查询再合并；或传空查全部

      if (selectedGroups.size === 1) {

        url += `&group_id=${Array.from(selectedGroups)[0]}`;

      }

      const res = await apiFetch(getApiUrl(url));

      const json = await res.json();

      if (json.code === 200) {

        let data = json.data ?? [];

        // 多选分组时在前端过滤

        if (selectedGroups.size > 1) {

          data = data.filter((sig: any) => sig.group_id && selectedGroups.has(sig.group_id));

        }

        setSignatures(data);

      }

    } catch { /* ignore */ }

    finally { setLoading(false); }

  };



  useEffect(() => { fetchGroups(); }, []);

  useEffect(() => { fetchSignatures(); }, [selectedGroups]);



  const toggleGroup = (gid: number) => {

    setSelectedGroups(prev => {

      const n = new Set(prev);

      n.has(gid) ? n.delete(gid) : n.add(gid);

      return n;

    });

  };



  const toggleAll = () => {

    if (selectedGroups.size === groups.length) {

      setSelectedGroups(new Set());

    } else {

      setSelectedGroups(new Set(groups.map(g => g.id)));

    }

  };



  const exportPdf = async (sigId: number) => {

    setExportingId(sigId);

    try {

      const res = await apiFetch(getApiUrl(`/admin/agreement-signatures/${sigId}/pdf?user_id=${userId}`));

      if (!res.ok) {

        const err = await res.json().catch(() => ({}));

        alert(err.detail || '导出失败');

        return;

      }

      const blob = await res.blob();

      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      a.download = `协议签署_${sigId}.pdf`;

      a.click();

      URL.revokeObjectURL(url);

    } catch {

      alert('导出失败，请重试');

    } finally {

      setExportingId(null);

    }

  };



  const handleBatchExport = async () => {

    if (signatures.length === 0) {

      alert('没有可导出的签名记录');

      return;

    }

    

    // 检查是否有缺失签名的账号

    const failedSigs = signatures.filter(sig => !sig.file_exists);

    if (failedSigs.length > 0) {

      const failedUsernames = failedSigs.map(sig => `${sig.real_name || sig.username}(${sig.username})`).join(', ');

      const confirmExport = window.confirm(

        `警告：当前有 ${failedSigs.length} 个账号的签名在云端(OSS)中不存在！\n\n` +

        `存在缺失的账号：\n${failedUsernames}\n\n` +

        `这些缺失的签名将无法生成协议 PDF，但会在 ZIP 压缩包内以【.error.txt】文件和【failed_signatures_report.txt】汇总报告的形式进行提示。\n\n` +

        `是否继续导出其余正常的签名？`

      );

      if (!confirmExport) {

        return;

      }

    }



    setBatchExporting(true);

    try {

      const body = {

        user_id: userId,

        group_ids: selectedGroups.size > 0 ? Array.from(selectedGroups) : [],

      };

      const res = await apiFetch(getApiUrl('/admin/agreement-signatures/batch-export'), {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify(body),

      });

      if (!res.ok) {

        const err = await res.json().catch(() => ({}));

        alert(err.detail || '批量导出失败');

        return;

      }

      const blob = await res.blob();

      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url;

      a.download = `签名批量导出_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.zip`;

      a.click();

      URL.revokeObjectURL(url);

    } catch {

      alert('批量导出失败，请重试');

    } finally {

      setBatchExporting(false);

    }

  };



  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">签名管理</h1>



        {/* 分组多选 */}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">

          <div className="flex items-center justify-between mb-3">

            <h3 className="text-sm font-bold text-slate-700">

              选择分组（已选 {selectedGroups.size} / {groups.length}）

            </h3>

            <button onClick={toggleAll}

              className="px-3 py-1 text-xs bg-violet-100 text-violet-600 rounded-lg hover:bg-violet-200 transition-colors">

              {selectedGroups.size === groups.length ? '取消全选' : '全选'}

            </button>

          </div>

          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">

            {groups.map(g => (

              <label key={g.id}

                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm ${

                  selectedGroups.has(g.id) ? 'bg-violet-50 border-violet-300 text-violet-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'

                }`}>

                <input type="checkbox" checked={selectedGroups.has(g.id)}

                  onChange={() => toggleGroup(g.id)} className="accent-violet-600" />

                {g.name}

              </label>

            ))}

          </div>

        </div>



        {/* 操作栏 */}

        <div className="flex flex-wrap gap-3 mb-6 items-center">

          <button onClick={handleBatchExport}

            disabled={batchExporting || signatures.length === 0}

            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">

            {batchExporting ? (

              <><Loader2 className="w-4 h-4 animate-spin" />导出中...</>

            ) : (

              <><DownloadIcon className="w-4 h-4" />批量导出 PDF {selectedGroups.size > 0 ? `(${selectedGroups.size}组)` : '(全部)'}</>

            )}

          </button>

          <span className="text-sm text-slate-500">

            共 <span className="font-bold text-slate-700">{signatures.length}</span> 条签署记录

          </span>

        </div>



        {/* 签名记录列表 */}

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">

          {loading ? (

            <div className="flex justify-center py-12">

              <Loader2 className="animate-spin w-8 h-8 text-violet-400" />

            </div>

          ) : signatures.length === 0 ? (

            <div className="flex flex-col items-center justify-center py-16 text-slate-400">

              <FileSignature className="w-12 h-12 mb-3 opacity-50" />

              <p className="text-sm">暂无签署记录</p>

            </div>

          ) : (

            <table className="w-full">

              <thead>

                <tr className="bg-slate-50 border-b border-slate-200">

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">签署人</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">姓名</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">所属分组</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">签署时间</th>

                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">状态</th>

                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">操作</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {signatures.map(sig => (

                  <tr key={sig.id} className="hover:bg-slate-50 transition-colors">

                    <td className="px-4 py-3 text-sm text-slate-700">{sig.username}</td>

                    <td className="px-4 py-3 text-sm text-slate-700">{sig.real_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{sig.group_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{sig.signed_at}</td>

                    <td className="px-4 py-3 text-center">

                      {sig.file_exists ? (

                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">

                          正常

                        </span>

                      ) : (

                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 font-bold">

                          ⚠️ 签名缺失

                        </span>

                      )}

                    </td>

                    <td className="px-4 py-3 text-center">

                      <button

                        onClick={() => exportPdf(sig.id)}

                        disabled={exportingId === sig.id}

                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg transition-colors"

                      >

                        {exportingId === sig.id ? (

                          <><Loader2 className="w-3.5 h-3.5 animate-spin" />导出中...</>

                        ) : (

                          <><DownloadIcon className="w-3.5 h-3.5" />导出 PDF</>

                        )}

                      </button>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          )}

        </div>

      </div>

    </div>

  );

};



// ── 无效语料查看 ─────────────────────────────────────────────

const InvalidRecordingsView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack, userId }) => {

  const [recordings, setRecordings] = useState<any[]>([]);

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(false);

  const [collectors, setCollectors] = useState<any[]>([]);

  const [selectedCollector, setSelectedCollector] = useState<number | ''>('');

  const [groups, setGroups] = useState<any[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<number | ''>('');

  const PAGE_SIZE = 20;



  const fetchCollectors = async () => {

    try {

      const res = await apiFetch(getApiUrl('/admin/users/simple?role=collector'));

      const json = await res.json();

      if (json.code === 200) setCollectors(json.data ?? []);

    } catch { /* ignore */ }

  };



  const fetchGroups = async () => {

    try {

      const res = await apiFetch(getApiUrl('/admin/corpus-groups?limit=500'));

      const json = await res.json();

      if (json.code === 200) setGroups(json.data ?? []);

    } catch { /* ignore */ }

  };



  const fetchRecordings = async (p: number) => {

    setLoading(true);

    try {

      let url = `/admin/invalid-recordings?user_id=${userId}&page=${p}&page_size=${PAGE_SIZE}`;

      if (selectedCollector !== '') url += `&collector_id=${selectedCollector}`;

      if (selectedGroup !== '') url += `&group_id=${selectedGroup}`;

      const res = await apiFetch(getApiUrl(url));

      const json = await res.json();

      if (json.code === 200) {

        setRecordings(json.data ?? []);

        setTotal(json.total ?? 0);

      }

    } catch { /* ignore */ }

    finally { setLoading(false); }

  };



  useEffect(() => { fetchCollectors(); fetchGroups(); }, []);

  useEffect(() => { setPage(0); fetchRecordings(1); }, [selectedCollector, selectedGroup]);



  const handleExportCSV = () => {

    let url = getApiUrl(`/admin/invalid-recordings/export?user_id=${userId}`);

    if (selectedCollector !== '') url += `&collector_id=${selectedCollector}`;

    if (selectedGroup !== '') url += `&group_id=${selectedGroup}`;

    const a = document.createElement('a');

    a.href = url;

    a.download = `无效语料_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;

    a.click();

  };



  const totalPages = Math.ceil(total / PAGE_SIZE);



  const pkgStatusLabel: Record<string, string> = {

    '未领取': 'bg-slate-100 text-slate-600',

    '已领取': 'bg-blue-100 text-blue-700',

    '已完成': 'bg-green-100 text-green-700',

    '已提交': 'bg-violet-100 text-violet-700',

  };



  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">无效语料管理</h1>



        {/* 筛选栏 */}

        <div className="flex flex-wrap gap-3 mb-6 items-end">

          <div>

            <label className="block text-xs text-slate-500 mb-1">采集员</label>

            <select

              value={selectedCollector}

              onChange={e => setSelectedCollector(e.target.value === '' ? '' : Number(e.target.value))}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

            >

              <option value="">全部采集员</option>

              {collectors.map(c => (

                <option key={c.id} value={c.id}>{c.real_name || c.username}</option>

              ))}

            </select>

          </div>

          <div>

            <label className="block text-xs text-slate-500 mb-1">语料组</label>

            <select

              value={selectedGroup}

              onChange={e => setSelectedGroup(e.target.value === '' ? '' : Number(e.target.value))}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

            >

              <option value="">全部语料组</option>

              {groups.map(g => (

                <option key={g.id} value={g.id}>{g.name}</option>

              ))}

            </select>

          </div>

          <div className="flex-1" />

          <button

            onClick={handleExportCSV}

            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"

          >

            <DownloadIcon className="w-4 h-4" />导出 CSV

          </button>

        </div>



        {/* 统计 */}

        <div className="mb-4 text-sm text-slate-500">

          共 <span className="font-bold text-slate-700">{total}</span> 条无效语料

        </div>



        {/* 表格 */}

        {loading ? (

          <div className="flex items-center justify-center py-20">

            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />

          </div>

        ) : recordings.length === 0 ? (

          <div className="flex flex-col items-center justify-center py-20 text-slate-400">

            <XCircle className="w-12 h-12 mb-3" />

            <p className="text-lg">暂无无效语料</p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full border-collapse">

              <thead>

                <tr className="bg-slate-50">

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ID</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">采集员</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">姓名</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">原始语料</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">标注文本</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">标注备注</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">质检备注</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">质检审核备注</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">标注员</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">语料组</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">包状态</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">提交时间</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {recordings.map(rec => (

                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">

                    <td className="px-4 py-3 text-sm text-slate-700">{rec.id}</td>

                    <td className="px-4 py-3 text-sm text-slate-700">{rec.collector_username}</td>

                    <td className="px-4 py-3 text-sm text-slate-700">{rec.collector_real_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title={rec.original_text}>{rec.original_text}</td>

                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate" title={rec.annotated_text}>{rec.annotated_text || '-'}</td>

                    <td className="px-4 py-3 text-sm text-orange-600 max-w-[150px] truncate" title={rec.annotation_note}>{rec.annotation_note || '-'}</td>

                    <td className="px-4 py-3 text-sm text-amber-600 max-w-[150px] truncate" title={rec.quality_note}>{rec.quality_note || '-'}</td>

                    <td className="px-4 py-3 text-sm text-red-600 max-w-[150px] truncate" title={rec.quality_review_note}>{rec.quality_review_note || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{rec.annotated_by_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{rec.group_name || '-'}</td>

                    <td className="px-4 py-3">

                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${pkgStatusLabel[rec.package_status] || 'bg-slate-100 text-slate-600'}`}>

                        {rec.package_status || '-'}

                      </span>

                    </td>

                    <td className="px-4 py-3 text-sm text-slate-500">{rec.submitted_at || '-'}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}



        {/* 分页 */}

        {totalPages > 1 && (

          <div className="mt-6">

            <Pagination

              page={page}

              total={total}

              pageSize={PAGE_SIZE}

              onPageChange={(p) => { setPage(p); fetchRecordings(p + 1); }}

            />

          </div>

        )}

      </div>

    </div>

  );

};



// ── 被打回包管理 ─────────────────────────────────────────────────────

const RejectedPackagesView: React.FC<{

  onBack: () => void;

  userId: number;

}> = ({ onBack }) => {

  const [packages, setPackages] = useState<any[]>([]);

  const [total, setTotal] = useState(0);

  const [page, setPage] = useState(0);

  const [loading, setLoading] = useState(false);

  const [groups, setGroups] = useState<any[]>([]);

  const [selectedGroup, setSelectedGroup] = useState<number | ''>('');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [resetting, setResetting] = useState(false);

  const PAGE_SIZE = 20;



  const fetchGroups = async () => {

    try {

      const res = await apiFetch(getApiUrl('/admin/corpus-groups?limit=500'));

      const json = await res.json();

      if (json.code === 200) setGroups(json.data ?? []);

    } catch { /* ignore */ }

  };



  const fetchPackages = async (p: number) => {

    setLoading(true);

    try {

      let url = `/admin/rejected-packages?page=${p}&limit=${PAGE_SIZE}`;

      if (selectedGroup !== '') url += `&corpus_group_id=${selectedGroup}`;

      const res = await apiFetch(getApiUrl(url));

      const json = await res.json();

      if (json.code === 200) {

        setPackages(json.data ?? []);

        setTotal(json.total ?? 0);

      }

    } catch { /* ignore */ }

    finally { setLoading(false); }

  };



  useEffect(() => { fetchGroups(); }, []);

  useEffect(() => { setPage(0); fetchPackages(1); }, [selectedGroup]);



  const toggleSelect = (id: number) => {

    setSelectedIds(prev => {

      const next = new Set(prev);

      next.has(id) ? next.delete(id) : next.add(id);

      return next;

    });

  };



  const toggleSelectAll = () => {

    if (selectedIds.size === packages.length) {

      setSelectedIds(new Set());

    } else {

      setSelectedIds(new Set(packages.map(p => p.id)));

    }

  };



  const handleReset = async () => {

    if (selectedIds.size === 0) {

      alert('请先选择要重置的包');

      return;

    }

    if (!window.confirm(`确定要将选中的 ${selectedIds.size} 个包重置为待标注状态吗？\n\n重置后标注员可以领取这些包进行标注。`)) return;



    setResetting(true);

    try {

      const res = await apiFetch(getApiUrl('/admin/reset-rejected-packages'), {

        method: 'POST',

        body: JSON.stringify({ package_ids: Array.from(selectedIds) }),

      });

      const json = await res.json();

      if (res.ok) {

        alert(json.msg);

        setSelectedIds(new Set());

        fetchPackages(page + 1);

      } else {

        alert(json.detail || '重置失败');

      }

    } catch {

      alert('网络异常');

    } finally {

      setResetting(false);

    }

  };



  const totalPages = Math.ceil(total / PAGE_SIZE);



  return (

    <div className="w-full bg-white min-h-screen flex flex-col">

      <div className="flex-1 px-8 py-6">

        <button onClick={onBack} className="flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium mb-6">

          <ChevronLeft className="w-5 h-5" />返回

        </button>



        <h1 className="text-3xl font-bold text-slate-800 mb-6">被打回包管理</h1>



        {/* 筛选栏 */}

        <div className="flex flex-wrap gap-3 mb-6 items-end">

          <div>

            <label className="block text-xs text-slate-500 mb-1">语料组</label>

            <select

              value={selectedGroup}

              onChange={e => setSelectedGroup(e.target.value === '' ? '' : Number(e.target.value))}

              className="px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"

            >

              <option value="">全部语料组</option>

              {groups.map(g => (

                <option key={g.id} value={g.id}>{g.name}</option>

              ))}

            </select>

          </div>

          <div className="flex-1" />

          <button

            onClick={handleReset}

            disabled={resetting || selectedIds.size === 0}

            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"

          >

            {resetting ? (

              <><Loader2 className="w-4 h-4 animate-spin" />处理中...</>

            ) : (

              <><RefreshCw className="w-4 h-4" />批量重置为待标注 ({selectedIds.size})</>

            )}

          </button>

        </div>



        {/* 统计 */}

        <div className="mb-4 text-sm text-slate-500">

          共 <span className="font-bold text-slate-700">{total}</span> 个被打回的包

        </div>



        {/* 表格 */}

        {loading ? (

          <div className="flex items-center justify-center py-20">

            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />

          </div>

        ) : packages.length === 0 ? (

          <div className="text-center py-20 text-slate-400">暂无被打回的包</div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full border-collapse">

              <thead>

                <tr className="bg-slate-50">

                  <th className="px-4 py-3 text-center">

                    <input

                      type="checkbox"

                      checked={selectedIds.size === packages.length && packages.length > 0}

                      onChange={toggleSelectAll}

                      className="accent-violet-600"

                    />

                  </th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">包名</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">采集员</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">语料组</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">打回原因</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">打回时间</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">包状态</th>

                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">录音完成度</th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {packages.map(pkg => (

                  <tr key={pkg.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.has(pkg.id) ? 'bg-violet-50' : ''}`}>

                    <td className="px-4 py-3 text-center">

                      <input

                        type="checkbox"

                        checked={selectedIds.has(pkg.id)}

                        onChange={() => toggleSelect(pkg.id)}

                        className="accent-violet-600"

                      />

                    </td>

                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{pkg.name}</td>

                    <td className="px-4 py-3 text-sm text-slate-600">{pkg.collector_real_name || pkg.collector_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{pkg.corpus_group_name || '-'}</td>

                    <td className="px-4 py-3 text-sm text-red-600 max-w-[200px] truncate" title={pkg.review_comment}>{pkg.review_comment || '-'}</td>

                    <td className="px-4 py-3 text-sm text-slate-500">{pkg.reviewed_at || '-'}</td>

                    <td className="px-4 py-3">

                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${

                        pkg.status === '已领取' ? 'bg-blue-100 text-blue-700' :

                        pkg.status === '未领取' ? 'bg-slate-100 text-slate-600' :

                        'bg-amber-100 text-amber-700'

                      }`}>

                        {pkg.status}

                      </span>

                    </td>

                    <td className="px-4 py-3 text-sm text-slate-500">

                      {pkg.recorded_count}/{pkg.total_count}

                      {pkg.recorded_count < pkg.total_count && (

                        <span className="text-orange-500 ml-1">⚠</span>

                      )}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}



        {/* 分页 */}

        {totalPages > 1 && (

          <div className="mt-6">

            <Pagination

              page={page}

              total={total}

              pageSize={PAGE_SIZE}

              onPageChange={(p) => { setPage(p); fetchPackages(p + 1); }}

            />

          </div>

        )}

      </div>

    </div>

  );

};



const Manager: React.FC = () => {

  const navigate = useNavigate();

  const user = JSON.parse(sessionStorage.getItem('user') ?? '{}');



  useEffect(() => {

    if (!user.id) {

      navigate('/');

    }

  }, [user.id, navigate]);



  const [view, setView] = useState<MainView>('dashboard');

  const [selectedCollector, setSelectedCollector] = useState<{ id: number; username: string } | null>(null);

  const [selectedCorpusGroup, setSelectedCorpusGroup] = useState<{ id: number; name: string } | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);

  const [statsLoading, setStatsLoading] = useState(false);



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

    { view: 'job-query' as MainView, icon: ListTodo, label: '作业查询' },

    { view: 'reviewer-management' as MainView, icon: ShieldCheck, label: '审核员管理' },

    { view: 'export-management' as MainView, icon: DownloadIcon, label: '导出管理' },

    { view: 'quality-approved' as MainView, icon: CheckCircle, label: '已合格包管理' },

    { view: 'users' as MainView, icon: Users, label: '账号管理' },

    { view: 'corpus-groups' as MainView, icon: FolderOpen, label: '语料组管理' },

    { view: 'dialect-stats' as MainView, icon: BarChart2, label: '方言统计' },

    { view: 'collector-groups' as MainView, icon: UserPlus, label: '分组管理' },

    { view: 'signature-list' as MainView, icon: FileSignature, label: '签名管理' },

    { view: 'invalid-recordings' as MainView, icon: XCircle, label: '无效语料' },

    { view: 'rejected-packages' as MainView, icon: RefreshCw, label: '被打回包管理' },

    { view: 'submissions' as MainView, icon: Eye, label: '采集包审核' },

    { view: 'personal-info-review' as MainView, icon: ClipboardCheck, label: '个人信息审查' },

    { view: 'system-settings' as MainView, icon: FileText, label: '系统设置' },

  ];



  const renderContent = () => {

    if (view === 'system-settings') return <SystemSettingsView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'personal-info-review') return <PersonalInfoReviewView onBack={() => setView('dashboard')} />;

    if (view === 'daily-work') return <DailyWorkView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'job-query') return <JobQueryView onBack={() => setView('dashboard')} />;

    if (view === 'reviewer-management') return <ReviewerManagementView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'export-management') return <ExportManagementView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'quality-approved') return <QualityApprovedPackagesView onBack={() => setView('dashboard')} />;

    if (view === 'users') return <UsersView onBack={() => setView('dashboard')} onSelectCollector={(c) => { setSelectedCollector(c); setView('collector-packages'); }} />;

    if (view === 'corpus-groups') return <CorpusGroupsView onBack={() => setView('dashboard')} />;

    if (view === 'dialect-stats') return <DialectStatsView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'collector-groups') return <CollectorGroupsView onBack={() => setView('dashboard')} />;

    if (view === 'signature-list') return <SignatureListView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'invalid-recordings') return <InvalidRecordingsView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'rejected-packages') return <RejectedPackagesView onBack={() => setView('dashboard')} userId={user.id} />;

    if (view === 'submissions') {

      if (selectedCorpusGroup) {

        return (

          <PackageReview

            onBack={() => { setSelectedCorpusGroup(null); }}

            userId={user.id}

            corpusGroupId={selectedCorpusGroup.id}

          />

        );

      }

      return (

        <CorpusGroupsReviewView

          onSelectGroup={(groupId, groupName) => {

            setSelectedCorpusGroup({ id: groupId, name: groupName });

          }}

          onBack={() => setView('dashboard')}

        />

      );

    }

    if (view === 'collector-packages' && selectedCollector) return <CollectorPackagesView collector={selectedCollector} onBack={() => { setView('users'); setSelectedCollector(null); }} />;



    if (view === 'collector-stats') {

      if (statsLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>;

      if (stats) return <StatsDetailPage role="collector" data={stats.collectors} onBack={() => setView('dashboard')} userId={user.id} />;

    }

    if (view === 'annotator-stats') {

      if (statsLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>;

      if (stats) return <StatsDetailPage role="annotator" data={stats.annotators} onBack={() => setView('dashboard')} userId={user.id} />;

    }

    if (view === 'inspector-stats') {

      if (statsLoading) return <div className="flex justify-center items-center h-96"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>;

      if (stats) return <StatsDetailPage role="inspector" data={stats.inspectors} onBack={() => setView('dashboard')} userId={user.id} />;

    }



    // Dashboard

    return (

      <div className="w-full flex flex-col items-center px-8 py-6">

        <div className="w-full max-w-6xl">

          <h1 className="text-3xl font-bold text-slate-800 mb-6">仪表盘</h1>



          {statsLoading ? (

            <div className="flex justify-center py-12"><Loader2 className="animate-spin w-8 h-8 text-violet-400" /></div>

          ) : stats ? (

            <>

              {/* 统计卡 - 采集员、标注员、质检员 */}

              <div className="grid grid-cols-3 gap-6 mb-8">

                {/* 采集员 */}

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">

                  <div className="flex items-center justify-between mb-4">

                    <h3 className="text-lg font-bold text-slate-800">采集员</h3>

                    <Users className="w-6 h-6 text-blue-600" />

                  </div>

                  <div className="space-y-3 mb-6">

                    <div>

                      <p className="text-sm text-slate-500 mb-1">总人数</p>

                      <p className="text-3xl font-bold text-slate-800">{stats.collectors.length}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">总包数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.collectors.reduce((sum, c) => sum + c.packages, 0)}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">结算录音条数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.collectors.reduce((sum, c) => sum + c.corpus_count, 0)}</p>

                    </div>

                  </div>

                  <button onClick={() => setView('collector-stats')}

                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">

                    查看详情

                  </button>

                </div>



                {/* 标注员 */}

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">

                  <div className="flex items-center justify-between mb-4">

                    <h3 className="text-lg font-bold text-slate-800">标注员</h3>

                    <FileText className="w-6 h-6 text-green-600" />

                  </div>

                  <div className="space-y-3 mb-6">

                    <div>

                      <p className="text-sm text-slate-500 mb-1">总人数</p>

                      <p className="text-3xl font-bold text-slate-800">{stats.annotators.length}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">已标注包数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.annotators.reduce((sum, a) => sum + a.packages, 0)}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">结算标注条数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.annotators.reduce((sum, a) => sum + a.corpus_count, 0)}</p>

                    </div>

                  </div>

                  <button onClick={() => setView('annotator-stats')}

                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors">

                    查看详情

                  </button>

                </div>



                {/* 质检员 */}

                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">

                  <div className="flex items-center justify-between mb-4">

                    <h3 className="text-lg font-bold text-slate-800">质检员</h3>

                    <CheckCircle className="w-6 h-6 text-amber-600" />

                  </div>

                  <div className="space-y-3 mb-6">

                    <div>

                      <p className="text-sm text-slate-500 mb-1">总人数</p>

                      <p className="text-3xl font-bold text-slate-800">{stats.inspectors.length}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">已质检包数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.inspectors.reduce((sum, i) => sum + i.packages, 0)}</p>

                    </div>

                    <div>

                      <p className="text-sm text-slate-500 mb-1">结算质检条数</p>

                      <p className="text-2xl font-bold text-slate-800">{stats.inspectors.reduce((sum, i) => sum + i.corpus_count, 0)}</p>

                    </div>

                  </div>

                  <button onClick={() => setView('inspector-stats')}

                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors">

                    查看详情

                  </button>

                </div>

              </div>

            </>

          ) : null}



          {/* 快捷入口 */}

          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">

            <h2 className="text-lg font-bold text-slate-800 mb-4">快捷入口</h2>

            <div className="grid grid-cols-3 gap-4">

              {navItems.slice(1).map((item) => {

                const Icon = item.icon;

                return (

                  <button key={item.view} onClick={() => setView(item.view)}

                    className="flex flex-col items-center p-4 bg-slate-50 hover:bg-violet-50 rounded-lg border border-slate-100 hover:border-violet-300 transition-all">

                    <Icon className="w-8 h-8 text-violet-600 mb-2" />

                    <p className="text-sm font-medium text-slate-700">{item.label}</p>

                  </button>

                );

              })}

            </div>

          </div>

        </div>

      </div>

    );

  };



  return (

    <div className="flex flex-col h-screen bg-slate-100">

      {/* Top Bar */}

      <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 shadow-sm">

        <div className="flex items-center gap-3 flex-1">

          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">

            <ShieldCheck className="w-5 h-5 text-white" />

          </div>

          <span className="font-bold text-slate-800 text-sm">语音采集管理系统</span>

        </div>

        <div className="flex items-center gap-3">

          <span className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">管理员</span>

          <span className="text-sm text-slate-600">{user.username ?? 'admin'}</span>

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

              <button key={item.view} onClick={() => setView(item.view)}

                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-r-2 ${isActive

                  ? 'bg-violet-50 text-violet-700 border-violet-600 font-semibold'

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



export default Manager;

export { DailyWorkView, StatsDetailPage, DialectStatsView };

