import { useState, useEffect } from 'react';
import { getApiKeys, generateKey, revokeKey } from '../api/client';
import type { ApiKey, KeyGenerateResponse } from '../types';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showGen, setShowGen] = useState(false);
  const [generated, setGenerated] = useState<KeyGenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [host, setHost] = useState('remote4.vpnmurahjogja.my.id');
  const [port, setPort] = useState(5886);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('full');
  const [days, setDays] = useState(365);

  const fetchKeys = async () => {
    try {
      const data = await getApiKeys();
      setKeys(data.keys);
    } catch {}
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleGenerate = async () => {
    try {
      setError(null);
      const result = await generateKey({
        host: host || 'localhost', port, label: label || 'Unnamed', role, expired_days: days
      });
      setGenerated(result);
      setShowGen(false);
      fetchKeys();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal generate key');
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API Key? This cannot be undone.')) return;
    try {
      await revokeKey(keyId);
      fetchKeys();
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0, color: '#E0E0FF' }}>
          API Keys
        </h2>
        <button onClick={() => { setShowGen(true); setGenerated(null); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            background: '#00F0FF', color: '#09090E', border: 'none',
            borderRadius: 8, fontWeight: 'bold', fontSize: 14, cursor: 'pointer'
          }}
        >
          <Plus size={18} /> Generate Key
        </button>
      </div>

      {/* Generated Key Display */}
      {generated && (
        <div style={{
          background: '#1F1F2C', borderRadius: 12, padding: 20, marginBottom: 24,
          border: '1px solid #00F0FF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Key color="#00F0FF" size={18} />
            <span style={{ color: '#00F0FF', fontWeight: 'bold', fontSize: 14 }}>New Key Generated!</span>
          </div>
          <div style={{
            background: '#09090E', borderRadius: 8, padding: 12,
            fontFamily: 'monospace', fontSize: 12, color: '#00F0FF',
            wordBreak: 'break-all', marginBottom: 12,
            maxHeight: 100, overflow: 'auto'
          }}>
            {generated.smart_key}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => copyToClipboard(generated.smart_key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                background: '#00F0FF', color: '#09090E', border: 'none',
                borderRadius: 6, fontSize: 13, cursor: 'pointer'
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Key'}
            </button>
            <button onClick={() => setGenerated(null)}
              style={{ padding: '8px 16px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ color: '#FF003C', fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* Generate Form Modal */}
      {showGen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#13131A', borderRadius: 16, padding: 32,
            width: 450, maxWidth: '90%', border: '1px solid #2A2A3C'
          }}>
            <h3 style={{ color: '#E0E0FF', margin: '0 0 20px', fontSize: 18 }}>Generate API Key</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>HOST</label>
              <input value={host} onChange={e => setHost(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>PORT</label>
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                  style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>DAYS</label>
                <input type="number" value={days} onChange={e => setDays(Number(e.target.value))}
                  style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>LABEL</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. HP Zaki"
                style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>ROLE</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 6, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14 }}>
                <option value="full">Full Access</option>
                <option value="read-only">Read Only</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleGenerate}
                style={{ flex: 1, padding: 12, background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
                Generate
              </button>
              <button onClick={() => setShowGen(false)}
                style={{ padding: '12px 24px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      {keys.map((key) => (
        <div key={key.id} style={{
          background: '#13131A', borderRadius: 12, padding: 16, marginBottom: 8,
          border: '1px solid #2A2A3C', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Key size={14} color={key.active ? '#00F0FF' : '#FF003C'} />
              <span style={{ color: '#E0E0FF', fontSize: 14, fontFamily: 'monospace' }}>
                {key.key_id.substring(0, 20)}...
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11,
                background: key.active ? '#00F0FF20' : '#FF003C20',
                color: key.active ? '#00F0FF' : '#FF003C'
              }}>
                {key.active ? 'Active' : 'Revoked'}
              </span>
            </div>
            <div style={{ color: '#6B6B80', fontSize: 12 }}>
              {key.label} · {key.host}:{key.port} · {key.role}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {key.active && (
              <button onClick={() => handleRevoke(key.key_id)}
                style={{ padding: '8px 12px', background: '#FF003C20', color: '#FF003C', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      {keys.length === 0 && (
        <div style={{ color: '#6B6B80', textAlign: 'center', padding: 40 }}>
          No API keys yet. Generate one!
        </div>
      )}
    </div>
  );
}
