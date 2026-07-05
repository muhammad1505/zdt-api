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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#09090E', padding: 20
    }}>
      <div style={{
        width: 400, maxWidth: '100%', padding: 40,
        background: '#13131A', borderRadius: 16,
        border: '1px solid #2A2A3C'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Server color="#00F0FF" size={48} style={{ marginBottom: 12 }} />
          <h1 style={{ color: '#00F0FF', fontSize: 24, fontWeight: 'bold', margin: 0 }}>
            ZDT Admin
          </h1>
          <p style={{ color: '#6B6B80', fontSize: 14, marginTop: 4 }}>
            Server Management Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 6 }}>
              USERNAME
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 8,
                background: '#09090E', border: '1px solid #2A2A3C',
                color: '#E0E0FF', fontSize: 14, outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 6 }}>
              PASSWORD
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 8,
                  background: '#09090E', border: '1px solid #2A2A3C',
                  color: '#E0E0FF', fontSize: 14, outline: 'none',
                  boxSizing: 'border-box', paddingRight: 40
                }}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 12, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#6B6B80' }}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ color: '#FF003C', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8,
              background: loading ? '#1F1F2C' : '#00F0FF',
              color: loading ? '#6B6B80' : '#09090E',
              fontWeight: 'bold', fontSize: 16, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Loading...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
