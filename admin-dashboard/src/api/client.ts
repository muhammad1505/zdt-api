import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:2000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('zdt_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem('zdt_admin_token');
      localStorage.removeItem('zdt_admin_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

export const login = async (username: string, password: string) => {
  const res = await api.post('/api/login', { username, password });
  return res.data;
};

export const getDashboard = async () => {
  const res = await api.get('/api/admin/dashboard');
  return res.data;
};

export const getApiKeys = async () => {
  const res = await api.get('/api/admin/keys');
  return res.data;
};

export const generateKey = async (data: {
  host: string; port: number; label: string; role: string; expired_days: number;
}) => {
  const res = await api.post('/api/admin/keys', data);
  return res.data;
};

export const revokeKey = async (keyId: string) => {
  const res = await api.delete(`/api/admin/keys/${keyId}`);
  return res.data;
};

export const getUsers = async () => {
  const res = await api.get('/api/admin/users');
  return res.data;
};

export const createUser = async (data: { username: string; password: string; role: string; label: string }) => {
  const res = await api.post('/api/admin/users', data);
  return res.data;
};

export const deleteUser = async (userId: number) => {
  const res = await api.delete(`/api/admin/users/${userId}`);
  return res.data;
};

export const getConfig = async () => {
  const res = await api.get('/api/admin/config');
  return res.data;
};

export const updateConfig = async (key: string, value: string) => {
  const res = await api.post('/api/admin/config', { key, value });
  return res.data;
};


export const updateUser = async (userId: number, data: Record<string, any>) => {
  const res = await api.put(`/api/admin/users/${userId}`, data);
  return res.data;
};

export const executeTool = async (action: string) => {
  const res = await api.post('/api/tools', { action });
  return res.data;
};

export const restartApi = async () => {
  const res = await api.post('/api/admin/system/restart');
  return res.data;
};

export const shutdownServer = async () => {
  const res = await api.post('/api/admin/system/shutdown');
  return res.data;
};

export const getSystemStatus = async () => {
  const res = await api.get('/api/admin/system/status');
  return res.data;
};

export const clearLogs = async () => {
  const res = await api.post('/api/logs/clear');
  return res.data;
};

export const getServerStatus = async () => {
  const res = await api.get('/api/status');
  return res.data;
};

export const getServerStats = async () => {
  const res = await api.get('/api/stats');
  return res.data;
};
export const getActivityLogs = async (limit = 50) => {
  const res = await api.get(`/api/admin/activity?limit=${limit}`);
  return res.data;
};

// === VPN MANAGEMENT ===

export const getVpnStatus = async () => {
  const res = await api.get('/api/admin/vpn/status');
  return res.data;
};

export const vpnConnect = async () => {
  const res = await api.post('/api/admin/vpn/connect');
  return res.data;
};

export const vpnDisconnect = async () => {
  const res = await api.post('/api/admin/vpn/disconnect');
  return res.data;
};

export const getVpnConfig = async () => {
  const res = await api.get('/api/admin/vpn/config');
  return res.data;
};

export const setVpnConfig = async (data: Record<string, string>) => {
  const res = await api.post('/api/admin/vpn/config', data);
  return res.data;
};

// === SERVICE MANAGEMENT ===

export const getServices = async () => {
  const res = await api.get('/api/admin/services');
  return res.data;
};

export const manageService = async (name: string, action: string) => {
  const res = await api.post(`/api/admin/services/${name}/${action}`);
  return res.data;
};

export const getFiles = async () => {
  const res = await api.get('/api/files');
  return res.data;
};

export const getStreamUrl = (filename: string) => {
  return `${API_BASE}/api/stream/${encodeURIComponent(filename)}`;
};

export const getDownloadUrl = (filename: string) => {
  return `${API_BASE}/api/dl/${encodeURIComponent(filename)}`;
};

export const uploadFile = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const updateStoragePath = async (target_dir: string) => {
  const res = await api.post('/api/settings/storage', { target_dir });
  return res.data;
};
