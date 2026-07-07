import { useState, useEffect } from 'react';
import { getApiKeys, generateKey, revokeKey, deleteKey } from '../api/client';
import type { ApiKey, KeyGenerateResponse } from '../types';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">API Keys</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage access keys for external services</p>
        </div>
        <button onClick={() => { setShowGen(true); setGenerated(null); }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">
          <Plus size={18} /> Generate Key
        </button>
      </div>

      {generated && (
        <div className="rounded-2xl border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/5 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Key className="text-brand-600 dark:text-brand-400" size={18} />
            <span className="text-brand-600 dark:text-brand-400 font-semibold text-sm">New Key Generated!</span>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 font-mono text-xs text-brand-600 dark:text-brand-400 break-all mb-3 max-h-24 overflow-auto border border-brand-100 dark:border-brand-500/20">
            {generated.smart_key}
          </div>
          <div className="flex gap-2">
            <button onClick={() => copyToClipboard(generated.smart_key)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied!' : 'Copy Key'}
            </button>
            <button onClick={() => setGenerated(null)}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Dismiss</button>
          </div>
        </div>
      )}

      {error && <div className="text-error-600 dark:text-error-500 text-sm">{error}</div>}

      {showGen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 w-[450px] max-w-[90%] shadow-theme-md">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-5">Generate API Key</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">HOST</label>
              <input value={host} onChange={e => setHost(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
            </div>
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">PORT</label>
                <input type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">DAYS</label>
                <input type="number" value={days} onChange={e => setDays(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">LABEL</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. HP Zaki"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" />
            </div>
            <div className="mb-6">
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">ROLE</label>
              <select value={role} onChange={e => setRole(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors">
                <option value="full">Full Access</option>
                <option value="read-only">Read Only</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={handleGenerate}
                className="flex-1 py-3 rounded-lg bg-brand-500 text-white font-medium text-sm hover:bg-brand-600 transition-colors border-none cursor-pointer">Generate</button>
              <button onClick={() => setShowGen(false)}
                className="px-6 py-3 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {keys.map((key) => (
          <div key={key.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4 flex justify-between items-center gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Key size={14} className={key.active ? 'text-brand-500' : 'text-error-500'} />
                <span className="text-sm text-gray-800 dark:text-white/90 font-mono">{key.key_id.substring(0, 20)}...</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  key.active ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'
                }`}>{key.active ? 'Active' : 'Revoked'}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{key.label} · {key.host}:{key.port} · {key.role}</div>
            </div>
            <div className="flex gap-2">
              {key.active && (
                <button onClick={() => handleRevoke(key.key_id)}
                  className="p-2 rounded-md bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500 border-none cursor-pointer hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors"><Trash2 size={14} /></button>
              )}
              {!key.active && (
                <button onClick={() => handleDelete(key.key_id)}
                  className="px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-none cursor-pointer text-xs hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Delete</button>
              )}
            </div>
          </div>
        ))}
        {keys.length === 0 && <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">No API keys yet. Generate one!</div>}
      </div>
    </div>
  );
}
