import { useState, useEffect } from 'react';
import { getApiKeys, generateKey, revokeKey, deleteKey } from '../api/client';
import type { ApiKey, KeyGenerateResponse } from '../types';
import { Key, Plus, Trash2, Copy, Check, Search } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [search, setSearch] = useState('');
  const filtered = search ? keys.filter(k => k.label.toLowerCase().includes(search.toLowerCase()) || k.key_id.toLowerCase().includes(search.toLowerCase()) || (k.host+':'+k.port).includes(search)) : keys;
  const [showGen, setShowGen] = useState(false);
  const [generated, setGenerated] = useState<KeyGenerateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState('remote4.vpnmurahjogja.my.id');
  const [port, setPort] = useState(5886);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState('full');
  const [days, setDays] = useState(365);

  const fetchKeys = async () => { try { const data = await getApiKeys(); setKeys(data.keys); } catch {} };
  useEffect(() => { fetchKeys(); }, []);

  const handleGenerate = async () => {
    try {
      setError(null);
      const result = await generateKey({ host: host || 'localhost', port, label: label || 'Unnamed', role, expired_days: days });
      setGenerated(result); setShowGen(false); fetchKeys();
    } catch (err: any) { setError(err.response?.data?.error || 'Gagal generate key'); }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API Key?')) return;
    try { await revokeKey(keyId); fetchKeys(); } catch {}
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm('Permanently delete this API Key?')) return;
    try { await deleteKey(keyId); fetchKeys(); } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">API Keys</h2>
          <p className="text-sm text-base-content/60 mt-1">Manage access keys for external services</p>
        </div>
        <button onClick={() => { setShowGen(true); setGenerated(null); }}
          className="btn btn-primary">
          <Plus size={18} /> Generate Key
        </button>
      </div>

      {generated && (
        <div className="card bg-primary/5 border border-primary/20 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Key className="text-primary" size={18} />
            <span className="text-primary font-semibold text-sm">New Key Generated!</span>
          </div>
          <div className="bg-base-100 rounded-lg p-3 font-mono text-xs text-primary break-all mb-3 max-h-24 overflow-auto border border-primary/20">
            {generated.smart_key}
          </div>
          <div className="flex gap-2">
            <button onClick={() => copyToClipboard(generated.smart_key)}
              className="btn btn-primary">
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied!' : 'Copy Key'}
            </button>
            <button onClick={() => setGenerated(null)}
              className="btn btn-ghost btn-xs">Dismiss</button>
          </div>
        </div>
      )}

      {error && <div className="text-error text-sm">{error}</div>}

      {showGen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 p-6 w-[450px] max-w-[90%] shadow-md">
            <h3 className="text-lg font-semibold text-base-content mb-5">Generate API Key</h3>
            <div className="mb-4">
              <label className="block text-sm text-base-content/60 mb-1">HOST</label>
              <input value={host} onChange={e => setHost(e.target.value)}
                className="input input-bordered w-full" />
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-sm text-base-content/60 mb-1">PORT</label>
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                  className="input input-bordered w-full" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-base-content/60 mb-1">DAYS</label>
                <input type="number" value={days} onChange={e => setDays(Number(e.target.value))}
                  className="input input-bordered w-full" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-base-content/60 mb-1">LABEL</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. HP Zaki"
                className="input input-bordered w-full" />
            </div>
            <div className="mb-6">
              <label className="block text-sm text-base-content/60 mb-1">ROLE</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="select select-bordered w-full">
                <option value="full">Full Access</option>
                <option value="read-only">Read Only</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={handleGenerate}
                className="btn btn-primary flex-1">Generate</button>
              <button onClick={() => setShowGen(false)}
                className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-base-200">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-base-content/60 shrink-0" />
              <input placeholder="Cari API key..." value={search} onChange={e => setSearch(e.target.value)}
                className="input input-bordered w-full max-w-sm" />
            </div>
          </div>
        <table className="table w-full">
          <thead>
            <tr className="bg-base-200/50">
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Key ID</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Label</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Host:Port</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Role</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((key) => (
              <tr key={key.id} className="hover:bg-base-200/30 transition-colors">
                <td className="px-4 py-3 text-sm text-base-content font-mono">{key.key_id.substring(0, 20)}...</td>
                <td className="px-4 py-3 text-sm text-base-content">{key.label}</td>
                <td className="px-4 py-3 text-sm text-base-content/60">{key.host}:{key.port}</td>
                <td className="px-4 py-3 text-sm text-base-content/60">{key.role}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${key.active ? 'badge-success' : 'badge-error'}`}>{key.active ? 'Active' : 'Revoked'}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {key.active && (
                      <button onClick={() => handleRevoke(key.key_id)}
                        className="btn btn-ghost btn-xs text-error"><Trash2 size={14} /> Revoke</button>
                    )}
                    {!key.active && (
                      <button onClick={() => handleDelete(key.key_id)}
                        className="btn btn-ghost btn-xs">Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-center py-10 text-sm text-base-content/60">No API keys yet. Generate one!</div>}
      </div>
    </div>
  );
}
