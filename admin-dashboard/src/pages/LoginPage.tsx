import { useState, useEffect } from 'react';
import { Server, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface Props {
  onLogin: (username: string, password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
}

export default function LoginPage({ onLogin, error, loading }: Props) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const expired = sessionStorage.getItem('zdt_session_expired');
    if (expired) {
      sessionStorage.removeItem('zdt_session_expired');
      setSessionExpired(true);
      setTimeout(() => setSessionExpired(false), 8000);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSessionExpired(false);
    await onLogin(username, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 p-5">
      <div className="card bg-base-100 border border-base-200 p-8 w-full max-w-sm shadow-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Server size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-base-content m-0">ZDT Admin</h1>
          <p className="text-sm text-base-content/60 mt-1">Server Management Dashboard</p>
        </div>

        {sessionExpired && (
          <div className="alert alert-warning text-sm mb-5">
            <AlertTriangle size={18} className="shrink-0" />
            <span>Sesi telah berakhir. Silakan login ulang.</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="text-sm text-base-content/80 mb-1.5 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input input-bordered w-full"
            />
          </div>

          <div className="mb-6">
            <label className="text-sm text-base-content/80 mb-1.5 block">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input input-bordered w-full pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-base-content/60 hover:text-base-content/80 transition-colors p-0">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-error text-sm mb-4">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="btn btn-primary btn-block"
          >
            {loading ? 'Loading...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
