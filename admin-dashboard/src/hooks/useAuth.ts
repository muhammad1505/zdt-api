import { useState, useCallback } from 'react';
import { login as apiLogin } from '../api/client';

interface AuthUser {
  id: number;
  username: string;
  role: string;
  label?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('zdt_admin_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('zdt_admin_token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiLogin(username, password);
      localStorage.setItem('zdt_admin_token', data.token);
      localStorage.setItem('zdt_admin_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      // Redirect to saved path after login (from 401/403 interceptor)
      const savedPath = sessionStorage.getItem('zdt_redirect_path');
      if (savedPath) {
        sessionStorage.removeItem('zdt_redirect_path');
        // Use setTimeout to ensure state is updated before redirect
        setTimeout(() => { window.location.href = savedPath; }, 100);
      }
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login gagal');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('zdt_admin_token');
    localStorage.removeItem('zdt_admin_user');
    setToken(null);
    setUser(null);
  }, []);

  return { user, token, loading, error, isAuthenticated: !!token && !!user, login, logout };
}
