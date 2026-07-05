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
    if (err.response?.status === 401) {
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

export const getActivityLogs = async (limit = 50) => {
  const res = await api.get(`/api/admin/activity?limit=${limit}`);
  return res.data;
};
