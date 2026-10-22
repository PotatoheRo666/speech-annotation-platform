import React, { useState, useEffect } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { getApiUrl, apiFetch } from '../config/api';
import { useParams } from 'react-router-dom';

// 简单的 Markdown 转 HTML
const markdownToHtml = (markdown: string): string => {
  if (!markdown) return '';

  let html = markdown
    // 标题
    .replace(/^### (.*?)$/gm, '<h3 class="text-xl font-bold mt-4 mb-2 text-slate-800">$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2 class="text-2xl font-bold mt-5 mb-3 text-slate-800">$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1 class="text-3xl font-bold mt-6 mb-4 text-slate-900">$1</h1>')
    // 加粗
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/__(.*?)__/g, '<strong class="font-bold">$1</strong>')
    // 斜体
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
    // 链接
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">$1</a>')
    // 列表
    .replace(/^\* (.*?)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/^- (.*?)$/gm, '<li class="ml-4 mb-1">$1</li>')
    .replace(/^(\d+)\. (.*?)$/gm, '<li class="ml-4 mb-1">$1. $2</li>')
    // 代码块
    .replace(/```(.*?)```/gs, '<pre class="bg-slate-100 p-3 rounded mb-3 overflow-x-auto"><code>$1</code></pre>')
    // 行内代码
    .replace(/`(.*?)`/g, '<code class="bg-slate-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
    // 引用
    .replace(/^> (.*?)$/gm, '<blockquote class="border-l-4 border-blue-400 pl-4 my-2 text-slate-600 italic">$1</blockquote>')
    // 分隔线
    .replace(/^---$/gm, '<hr class="my-4 border-slate-300" />')
    // 段落
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/^(?!<[a-z])/gm, '<p class="mb-4">');

  // 包装在容器中
  html = '<div class="prose prose-sm max-w-none">' + html + '</p></div>';

  return html;
};

const Terms: React.FC = () => {
  const { type } = useParams<{ type: 'user-agreement' | 'privacy-policy' }>();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');

  useEffect(() => {
    const fetchTerms = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(getApiUrl('/login-terms'));
        const data = await res.json();

        if (res.ok && data.data) {
          if (type === 'user-agreement') {
            setTitle('用户协议');
            setContent(data.data.service_terms || '暂无用户协议');
          } else {
            setTitle('隐私政策');
            setContent(data.data.privacy_policy || '暂无隐私政策');
          }
        }
      } catch {
        setContent('加载失败，请刷新页面重试');
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, [type]);

  const htmlContent = markdownToHtml(content);

  return (
    <div className="w-full min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-8 prose prose-sm max-w-none">
            <div
              className="text-slate-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-slate-400 text-xs border-t border-slate-200">
        <p>© 2026 语音语料采集系统</p>
      </footer>
    </div>
  );
};

export default Terms;
