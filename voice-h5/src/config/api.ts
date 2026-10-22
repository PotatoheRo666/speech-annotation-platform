// API 基础 URL 配置
// 在生产环境中，使用相对路径以支持不同的部署地址
export const API_BASE_URL = '';

// API 前缀
export const API_PREFIX = '/api';

// 完整的 API URL
export const getApiUrl = (path: string) => {
  // 防止重复的 /api 前缀
  let cleanPath = path;
  
  // 移除开头的多余斜杠
  cleanPath = cleanPath.replace(/^\/+/, '');
  
  // 如果路径以 api 开头（不带斜杠），添加斜杠
  if (cleanPath.startsWith('api')) {
    cleanPath = '/' + cleanPath;
  }
  
  // 如果路径以 /api 开头，直接返回
  if (cleanPath.startsWith('/api')) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  
  // 否则添加 /api 前缀
  cleanPath = '/' + cleanPath;
  return `${API_BASE_URL}${API_PREFIX}${cleanPath}`;
};

// 获取 token
export const getToken = (): string | null => {
  return sessionStorage.getItem('token');
};

// 带 token 的 fetch 封装
export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = getToken();
  const headers = new Headers(options.headers);

  // ��在 body 不是 FormData 时设置 Content-Type
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 如果返回 401，说明 token 无效（被顶号了），清除本地存储并重定向到登录
  if (response.status === 401) {
    sessionStorage.clear();
    window.location.href = '/';
  }

  return response;
};

