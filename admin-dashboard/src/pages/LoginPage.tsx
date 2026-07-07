import { useState } from 'react';
import { Server, Eye, EyeOff } from 'lucide-react';

interface Props {
  onLogin: (username: string, password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
}

export default function LoginPage({ onLogin, error, loading }: Props) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-5">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-theme-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-brand-500 flex items-center justify-center mx-auto mb-4">
            <Server size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 m-0">ZDT Admin</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Server Management Dashboard</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 focus:ring-3 focus:ring-brand-500/10 transition-colors box-border"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 focus:ring-3 focus:ring-brand-500/10 transition-colors box-border pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 text-sm text-error-600 dark:text-error-500 text-center bg-error-50 dark:bg-error-500/5 rounded-lg px-3 py-2 border border-error-100 dark:border-error-500/20">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-500 text-white font-semibold text-sm border-none cursor-pointer transition-all hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
