import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  updateStoragePath, getVpnStatus, vpnConnect, vpnDisconnect, getVpnConfig, setVpnConfig,
  getServices, manageService, restartApi, shutdownServer, getSystemStatus,
  getTelegramConfig, setTelegramConfig, testTelegram,
  getAiKeys, setAiKeys,
  getConfig, updateConfig,
  getSchedulerStatus, getSchedulerPlaylists, saveSchedulerPlaylist,
} from '../api/client';
import {
  Wifi, WifiOff, Settings, Save,
  Server, Square, RotateCw, ToggleLeft, ToggleRight, Activity, Power,
  MessageCircle, Send, Key, Folder, RefreshCw, Play,
  Clock, Trash2, Plus,
} from 'lucide-react';
import FileBrowser from '../components/FileBrowser';

interface VpnSt { connected: boolean; ip: string; interface: string; service_active: boolean; service_enabled: boolean; }
interface Svc { name: string; active: string; enabled: string; }

const TABS = [
  { key: 'services', label: 'Services', icon: Server },
  { key: 'vpn', label: 'VPN', icon: Wifi },
  { key: 'telegram', label: 'Telegram', icon: MessageCircle },
  { key: 'scheduler', label: 'Scheduler', icon: Clock },
  { key: 'ai', label: 'AI Keys', icon: Key },
  { key: 'config', label: 'Config', icon: Settings },
];

const SERVICE_LABELS: Record<string, string> = {
  'zdt-api': 'API Server', 'zdt-web': 'Web UI', 'zdt-telegram': 'Telegram Bot',
  'zdt-scheduler': 'Scheduler', 'zdt-watch': 'File Watcher', 'zdt-tunnel': 'Tunnel',
};

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'services';

  const toast = (icon: 'success' | 'error' | 'info', title: string) => {
    Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, background: '#ffffff', color: '#1d2939', customClass: { container: '!z-[999999]' } });
  };

  const setTab = (t: string) => setSearchParams({ tab: t });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage server configuration</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-none bg-transparent text-sm cursor-pointer transition-all border-b-2 ${
                active ? 'text-brand-600 dark:text-brand-400 font-semibold border-brand-500' : 'text-gray-500 dark:text-gray-400 font-normal border-transparent hover:text-gray-700 dark:hover:text-gray-300'
              }`}>
              <t.icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'services' && <ServicesTab toast={toast} />}
      {tab === 'vpn' && <VpnTab toast={toast} />}
      {tab === 'telegram' && <TelegramTab toast={toast} />}
      {tab === 'ai' && <AiKeysTab toast={toast} />}
      {tab === 'scheduler' && <SchedulerTab toast={toast} />}
      {tab === 'config' && <ConfigTab toast={toast} />}
    </div>
  );
}

function ServicesTab({ toast }: { toast: any }) {
  const [services, setServices] = useState<Svc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    try { const d = await getServices(); setServices(d.services || []); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleAction = async (name: string, action: string) => {
    const key = name + ':' + action;
    setActionLoading(key);
    try {
      const res = await manageService(name, action);
      toast('success', res.message || `${name} ${action} berhasil`);
      setServices(prev => prev.map(s =>
        s.name === name
          ? {
              ...s,
              active: action === 'start' ? 'active' : action === 'stop' ? 'inactive' : s.active,
              enabled: action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : s.enabled,
            }
          : s
      ));
      setTimeout(fetch, 1500);
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal ' + action); }
    setActionLoading(null);
  };

  const handleRestart = async () => {
    const res = await Swal.fire({ title: 'Restart API Server?', text: 'Koneksi akan terputus sementara', icon: 'warning', showCancelButton: true, confirmButtonColor: '#f04438', cancelButtonColor: '#667085', confirmButtonText: 'Restart', background: '#ffffff', color: '#1d2939' });
    if (!res.isConfirmed) return;
    setActionLoading('restart-api');
    try { const d = await restartApi(); setServerStatus(d.message); toast('success', 'Restart initiated'); }
    catch (e: any) { toast('error', e.response?.data?.error || 'Gagal'); }
    setActionLoading(null);
  };

  const handleShutdown = async () => {
    const res = await Swal.fire({ title: 'Matikan Server?', text: 'Server akan dimatikan total!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#f04438', cancelButtonColor: '#667085', confirmButtonText: 'Shutdown', background: '#ffffff', color: '#1d2939' });
    if (!res.isConfirmed) return;
    try { await shutdownServer(); toast('info', 'Shutdown initiated'); } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal'); }
  };

  const handleCheckStatus = async () => {
    try { const d = await getSystemStatus(); setServerStatus('API Server: ' + d.status); toast('info', 'API Server: ' + d.status); }
    catch { setServerStatus('Gagal cek status'); }
  };

  const isActive = (v: string) => v === 'active';
  const isEnabled = (v: string) => v === 'enabled';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Activity className="text-brand-500" size={20} />
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">API Server</h3>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={handleCheckStatus}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-transparent cursor-pointer"><RefreshCw size={14} /> Check Status</button>
          <button onClick={handleRestart} disabled={actionLoading === 'restart-api'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-warning-600 dark:text-warning-500 text-sm font-medium hover:bg-warning-50 dark:hover:bg-warning-500/5 transition-colors bg-transparent cursor-pointer disabled:opacity-50"><RotateCw size={14} /> Restart</button>
          <button onClick={handleShutdown}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-error-600 dark:text-error-500 text-sm font-medium hover:bg-error-50 dark:hover:bg-error-500/5 transition-colors bg-transparent cursor-pointer"><Power size={14} /> Shutdown</button>
        </div>
        {serverStatus && <div className="mt-3 text-sm p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-white/90 border border-gray-100 dark:border-gray-700">{serverStatus}</div>}
      </div>

      {loading ? <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      : (
        <>
          {services.map(svc => (
        <div key={svc.name} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="text-base font-medium text-gray-800 dark:text-white/90">{SERVICE_LABELS[svc.name] || svc.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{svc.name}.service</div>
            </div>
            <div className="flex gap-2">
              <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${isActive(svc.active) ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'}`}>
                {isActive(svc.active) ? 'Running' : 'Stopped'}
              </span>
              <span className={`px-2.5 py-0.5 rounded text-xs font-medium ${isEnabled(svc.enabled) ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                {isEnabled(svc.enabled) ? 'Auto' : 'Manual'}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => handleAction(svc.name, isActive(svc.active) ? 'stop' : 'start')} disabled={actionLoading?.startsWith(svc.name)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs cursor-pointer border border-gray-200 dark:border-gray-700 bg-transparent disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                isActive(svc.active) ? 'text-error-600 dark:text-error-500' : 'text-success-600 dark:text-success-500'
              }`}>
              {isActive(svc.active) ? <Square size={12} /> : <Play size={12} />} {isActive(svc.active) ? 'Stop' : 'Start'}
            </button>
            <button onClick={() => handleAction(svc.name, 'restart')} disabled={actionLoading?.startsWith(svc.name)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs cursor-pointer border border-gray-200 dark:border-gray-700 bg-transparent text-warning-600 dark:text-warning-500 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"><RotateCw size={12} /> Restart</button>
            <button onClick={() => handleAction(svc.name, isEnabled(svc.enabled) ? 'disable' : 'enable')} disabled={actionLoading?.startsWith(svc.name)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs cursor-pointer border border-gray-200 dark:border-gray-700 bg-transparent disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                isEnabled(svc.enabled) ? 'text-error-600 dark:text-error-500' : 'text-brand-600 dark:text-brand-400'
              }`}>
              {isEnabled(svc.enabled) ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {isEnabled(svc.enabled) ? 'Disable' : 'Enable'}
            </button>
            {actionLoading?.startsWith(svc.name) && <span className="text-xs text-warning-600 dark:text-warning-500 self-center">Processing...</span>}
          </div>
          </div>
        ))}
        </>
      )}
    </div>
  );
}

function VpnTab({ toast }: { toast: any }) {
  const [status, setStatus] = useState<VpnSt | null>(null);
  const [loading, setLoading] = useState(true);
  const [al, setAl] = useState<string | null>(null);
  const [s, setS] = useState(''); const [u, setU] = useState(''); const [pw, setPw] = useState(''); const [auto, setAuto] = useState('false');

  const fetch = async () => {
    setLoading(true);
    try {
      const [st, c] = await Promise.all([getVpnStatus(), getVpnConfig()]);
      setStatus(st); setS(c.server); setU(c.username); setPw(''); setAuto(c.enabled);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const act = async (label: string, fn: () => Promise<any>) => {
    setAl(label);
    try { const r = await fn(); toast('success', r.message || label + ' berhasil'); fetch(); }
    catch (e: any) { toast('error', e.response?.data?.error || 'Gagal ' + label); }
    setAl(null);
  };

  const saveConfig = async () => {
    setAl('save');
    try {
      const d: Record<string,string> = { VPN_SERVER: s, VPN_USERNAME: u, VPN_AUTOSTART: auto };
      if (pw) d.VPN_PASSWORD = pw;
      await setVpnConfig(d); toast('success', 'Config saved'); fetch();
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal simpan'); }
    setAl(null);
  };

  if (loading) return <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
        <div className="flex items-center gap-3 mb-5">
          {status?.connected ? <Wifi className="text-success-500" size={28} /> : <WifiOff className="text-error-500" size={28} />}
          <div>
            <div className="text-lg font-semibold text-gray-800 dark:text-white/90">{status?.connected ? 'Connected' : 'Disconnected'}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{status?.interface} {status?.ip && '· ' + status.ip}</div>
          </div>
        </div>
        <div className="flex gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Service</div>
            <span className={`px-3 py-1 rounded text-xs font-medium ${status?.service_active ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'}`}>
              {status?.service_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Auto Start</div>
            <span className={`px-3 py-1 rounded text-xs font-medium ${status?.service_enabled ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
              {status?.service_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => act(status?.connected ? 'disconnect' : 'connect', status?.connected ? vpnDisconnect : vpnConnect)} disabled={al !== null}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none transition-all hover:brightness-110 disabled:opacity-50 ${
              status?.connected ? 'bg-error-500 text-white' : 'bg-success-500 text-white'
            }`}>
            {status?.connected ? <Square size={16} /> : <Play size={16} />}
            {status?.connected ? 'Disconnect' : 'Connect'}
          </button>
          <button onClick={() => act('refresh', fetch)} disabled={al !== null}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm cursor-pointer bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <Settings className="text-warning-500" size={20} />
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">VPN Config</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">SERVER</label><input value={s} onChange={e => setS(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" /></div>
          <div><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">USERNAME</label><input value={u} onChange={e => setU(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" /></div>
          <div><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">PASSWORD</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" placeholder="Kosongkan jika tidak diganti" /></div>
          <div><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">AUTO START</label><select value={auto} onChange={e => setAuto(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors"><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
        </div>
        <button onClick={saveConfig} disabled={al !== null}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none mt-4 cursor-pointer disabled:opacity-50"><Save size={16} /> Save</button>
      </div>
    </div>
  );
}

function TelegramTab({ toast }: { toast: any }) {
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try { const d = await getTelegramConfig(); setBotToken(''); setChatId(''); setEnabled(d.enabled || false); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, string | boolean> = { enabled };
      if (botToken) data.bot_token = botToken;
      if (chatId) data.chat_id = chatId;
      await setTelegramConfig(data); toast('success', 'Telegram config saved');
      setBotToken(''); setChatId('');
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal simpan'); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try { const r = await testTelegram(); toast('success', r.message || 'Test message sent!'); }
    catch (e: any) { toast('error', e.response?.data?.message || 'Gagal kirim test'); }
    setTesting(false);
  };

  if (loading) return <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <MessageCircle size={20} className="text-brand-500" />
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">Telegram Bot</h3>
        <span className={`ml-auto px-3 py-1 rounded text-xs font-medium ${enabled ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <div className="mb-4"><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">BOT TOKEN</label><input value={botToken} onChange={e => setBotToken(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" placeholder="Kosongkan jika tidak diganti" type="password" /></div>
      <div className="mb-4"><label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CHAT ID</label><input value={chatId} onChange={e => setChatId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" placeholder="Kosongkan jika tidak diganti" /></div>
      <div className="mb-5 flex items-center gap-3">
        <label className="text-sm text-gray-500 dark:text-gray-400">ENABLED</label>
        <button onClick={() => setEnabled(!enabled)}
          className={`px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer border-none transition-all ${
            enabled ? 'bg-success-500 text-white' : 'bg-gray-300 dark:bg-gray-600 text-white'
          }`}>{enabled ? 'ON' : 'OFF'}</button>
      </div>
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50"><Save size={16} /> {saving ? 'Saving...' : 'Save'}</button>
        <button onClick={handleTest} disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-transparent cursor-pointer disabled:opacity-50"><Send size={16} /> {testing ? 'Sending...' : 'Test'}</button>
      </div>
    </div>
  );
}

function AiKeysTab({ toast }: { toast: any }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const AI_KEY_LABELS: Record<string, string> = { gemini: 'Google Gemini', openrouter: 'OpenRouter', openai: 'OpenAI' };
  const AI_KEY_HELP: Record<string, string> = { gemini: 'https://aistudio.google.com/app/apikey', openrouter: 'https://openrouter.ai/keys', openai: 'https://platform.openai.com/api-keys' };

  const fetch = async () => {
    setLoading(true);
    try { const d = await getAiKeys(); setKeys(d.keys || {}); } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      for (const k of Object.keys(keys)) { if (keys[k]) data[k] = keys[k]; }
      await setAiKeys(data); toast('success', 'AI keys saved'); fetch();
    } catch { toast('error', 'Gagal simpan'); }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <Key className="text-brand-500" size={20} />
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">AI API Keys</h3>
      </div>
      {Object.keys(AI_KEY_LABELS).map(name => (
        <div key={name} className="mb-4">
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
            {AI_KEY_LABELS[name]}
            <a href={AI_KEY_HELP[name]} target="_blank" rel="noopener noreferrer" className="ml-2 text-brand-600 dark:text-brand-400 text-xs no-underline hover:underline">(get key)</a>
          </label>
          <input type="password" value={keys[name] || ''} onChange={e => setKeys(prev => ({ ...prev, [name]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border" placeholder="********" />
        </div>
      ))}
      <button onClick={handleSave} disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50"><Save size={16} /> {saving ? 'Saving...' : 'Save All'}</button>
    </div>
  );
}

function SchedulerTab({ toast }: { toast: any }) {
  const [status, setStatus] = useState<{ running: boolean } | null>(null);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newInterval, setNewInterval] = useState('24');

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [st, pl] = await Promise.all([
        getSchedulerStatus(),
        getSchedulerPlaylists(),
      ]);
      setStatus(st);
      setPlaylists(pl.playlists || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { fetchAll(); }, []);

  const toggleScheduler = async () => {
    try {
      const action = status?.running ? 'stop' : 'start';
      const { manageDaemon } = await import('../api/client');
      await manageDaemon('scheduler', action);
      toast('success', `Scheduler ${action === 'start' ? 'started' : 'stopped'}`);
      setTimeout(fetchAll, 1000);
    } catch (e: any) {
      toast('error', e.response?.data?.error || 'Gagal toggle scheduler');
    }
  };

  const addPlaylist = async () => {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const updated = [...playlists, {
        url: newUrl.trim(),
        name: newName.trim() || 'Untitled',
        interval: parseInt(newInterval),
        last_sync: null,
      }];
      await saveSchedulerPlaylist({ playlists: updated });
      setPlaylists(updated);
      setNewUrl('');
      setNewName('');
      toast('success', 'Playlist added');
    } catch (e: any) {
      toast('error', e.response?.data?.error || 'Gagal add playlist');
    }
    setSaving(false);
  };

  const removePlaylist = async (index: number) => {
    try {
      const updated = playlists.filter((_, i) => i !== index);
      await saveSchedulerPlaylist({ playlists: updated });
      setPlaylists(updated);
      toast('success', 'Playlist removed');
    } catch (e: any) {
      toast('error', e.response?.data?.error || 'Gagal remove playlist');
    }
  };

  const intervalLabels: Record<number, string> = {
    6: '6 Jam', 12: '12 Jam', 24: '24 Jam (Harian)',
    48: '2 Hari', 72: '3 Hari', 168: '1 Minggu',
  };

  return (
    <div className="space-y-4">
      {/* Scheduler Status */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className={status?.running ? 'text-success-500' : 'text-gray-400'} size={24} />
          <div>
            <div className="text-base font-semibold text-gray-800 dark:text-white/90">
              Scheduler {status?.running ? 'Running' : 'Stopped'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Menjalankan sinkronisasi playlist secara periodik
            </div>
          </div>
          <button onClick={toggleScheduler} disabled={loading}
            className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border-none transition-all hover:brightness-110 disabled:opacity-50 ${
              status?.running ? 'bg-error-500 text-white' : 'bg-success-500 text-white'
            }`}>
            {status?.running ? 'Stop' : 'Start'}
          </button>
        </div>
        {loading && <div className="text-xs text-gray-400">Loading...</div>}
      </div>

      {/* Add Playlist */}
      {status?.running && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-4 flex items-center gap-2">
            <Plus size={16} className="text-brand-500" /> Add Scheduled Playlist
          </h3>
          <div className="flex gap-3 flex-wrap">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border"
              placeholder="Nama playlist" />
            <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
              className="flex-[2] min-w-[200px] px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border"
              placeholder="https://open.spotify.com/playlist/..." />
            <select value={newInterval} onChange={e => setNewInterval(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white/90 text-sm outline-none">
              {[6, 12, 24, 48, 72, 168].map(h => (
                <option key={h} value={h}>{intervalLabels[h] || h + ' Jam'}</option>
              ))}
            </select>
            <button onClick={addPlaylist} disabled={saving || !newUrl.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer disabled:opacity-50">
              <Plus size={16} /> Add
            </button>
          </div>
        </div>
      )}

      {/* Playlist List */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Clock size={16} className="text-brand-500" />
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90 m-0">Scheduled Playlists</h3>
          <span className="ml-auto text-xs text-gray-400">{playlists.length} active</span>
        </div>
        {playlists.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {status?.running ? 'Belum ada playlist. Tambah playlist di atas.' : 'Start scheduler untuk mengelola playlist.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {playlists.map((pl: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-white/90 truncate">
                    {pl.name || 'Untitled'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {pl.url}
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {intervalLabels[pl.interval] || pl.interval + ' Jam'}
                </span>
                {pl.last_sync && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(pl.last_sync).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                <button onClick={() => removePlaylist(i)}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-error-500 hover:border-error-300 transition-colors bg-transparent cursor-pointer">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigTab({ toast }: { toast: any }) {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [targetDir, setTargetDir] = useState('');

  useEffect(() => {
    getConfig().then(d => { setCfg(d.config); if (d.config?.TARGET_DIR) setTargetDir(d.config.TARGET_DIR); }).catch(() => {});
  }, []);

  const handleSave = async (key: string) => {
    try { await updateConfig(key, editVal); setCfg(prev => ({ ...prev, [key]: editVal })); setEditKey(null); toast('success', 'Config updated'); }
    catch { toast('error', 'Gagal update'); }
  };

  const handleDirSelected = (_files: string[], folder: string) => {
    setShowDirPicker(false);
    if (folder) { updateStoragePath(folder); setTargetDir(folder); setCfg(prev => ({ ...prev, TARGET_DIR: folder })); toast('success', 'Target directory updated'); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Folder size={20} className="text-warning-500" />
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">Target Directory</h3>
        </div>
        <div className="flex items-center gap-3">
          <code className="flex-1 text-sm text-gray-800 dark:text-white/90 font-mono px-3.5 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
            {targetDir || 'Not set'}
          </code>
          <button onClick={() => setShowDirPicker(true)}
            className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors border-none cursor-pointer">Browse</button>
        </div>
      </div>

      {showDirPicker && (
        <FileBrowser title="Pilih Target Directory" onSelect={handleDirSelected} onCancel={() => setShowDirPicker(false)} folderPicker />
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <Settings className="text-brand-500" size={20} />
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 m-0">All Config</h3>
        </div>
        {Object.keys(cfg).length === 0 ? (
          <div className="py-5 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada konfigurasi.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Object.entries(cfg).map(([key, value]) => (
              <div key={key} className="flex items-center py-3 gap-3">
                <code className="text-sm text-brand-600 dark:text-brand-400 min-w-[200px] font-mono">{key}</code>
                {editKey === key ? (
                  <>
                    <input value={editVal} onChange={e => setEditVal(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded bg-gray-50 dark:bg-gray-800 border border-brand-300 dark:border-brand-700 text-gray-800 dark:text-white/90 text-sm outline-none box-border" />
                    <button onClick={() => handleSave(key)}
                      className="p-1.5 rounded bg-brand-500 text-white border-none cursor-pointer hover:bg-brand-600 transition-colors"><Save size={14} /></button>
                    <button onClick={() => setEditKey(null)}
                      className="px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-800 dark:text-white/90 font-mono">{value}</span>
                    <button onClick={() => { setEditKey(key); setEditVal(value); }}
                      className="px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">Edit</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
