import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  getFiles, getStreamUrl, getDownloadUrl, uploadFile, updateStoragePath,
  getVpnStatus, vpnConnect, vpnDisconnect, getVpnConfig, setVpnConfig,
  getServices, manageService, restartApi, shutdownServer, getSystemStatus,
  getConfig, updateConfig,
} from '../api/client';
import {
  Folder, Search, File, Download, Play, Upload, RefreshCw,
  Wifi, WifiOff, Settings, Save,
  Server, Square, RotateCw, ToggleLeft, ToggleRight, Activity, Power,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────

interface MediaFile { name: string; path: string; size: number; type: string; modified: number; }
interface VpnSt { connected: boolean; ip: string; interface: string; service_active: boolean; service_enabled: boolean; }
interface Svc { name: string; active: string; enabled: string; }

const TABS = [
  { key: 'files', label: 'Files', icon: Folder },
  { key: 'services', label: 'Services', icon: Server },
  { key: 'vpn', label: 'VPN', icon: Wifi },
  { key: 'config', label: 'Config', icon: Settings },
];

const SERVICE_LABELS: Record<string, string> = {
  'zdt-api': 'API Server', 'zdt-web': 'Web UI', 'zdt-telegram': 'Telegram Bot',
  'zdt-scheduler': 'Scheduler', 'zdt-watch': 'File Watcher', 'zdt-tunnel': 'Tunnel',
};

function fmtSize(b: number): string {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ─── Component ───────────────────────────────────────

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'services';

  const toast = (icon: 'success' | 'error' | 'info', title: string) => {
    Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, background: '#13131A', color: '#E0E0FF' });
  };

  const setTab = (t: string) => setSearchParams({ tab: t });

  const input = { width: '100%', padding: '10px 14px', borderRadius: 8, background: '#09090E', border: '1px solid #2A2A3C', color: '#E0E0FF', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20, color: '#E0E0FF' }}>
        <Settings size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        Settings
      </h2>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #2A2A3C', paddingBottom: 0 }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
                border: 'none', borderBottom: active ? '2px solid #00F0FF' : '2px solid transparent',
                background: 'transparent', color: active ? '#00F0FF' : '#6B6B80',
                fontWeight: active ? 'bold' : 'normal', fontSize: 14, cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
              <t.icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'files' && <FilesTab input={input} toast={toast} />}
      {tab === 'services' && <ServicesTab toast={toast} />}
      {tab === 'vpn' && <VpnTab input={input} toast={toast} />}
      {tab === 'config' && <ConfigTab toast={toast} />}
    </div>
  );
}

// ═══════════════════ FILES TAB ═══════════════════════

function FilesTab({ input, toast }: { input: any; toast: any }) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [targetDir, setTargetDir] = useState('');
  const [editingDir, setEditingDir] = useState(false);
  const [dirInput, setDirInput] = useState('');
  const [dirSaving, setDirSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const d = await getFiles();
      setFiles(d.files || []);
      if (d.target_dir) setTargetDir(d.target_dir);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);

  const handleSaveDir = async () => {
    if (!dirInput.trim()) return;
    setDirSaving(true);
    try {
      await updateStoragePath(dirInput.trim());
      setTargetDir(dirInput.trim());
      setEditingDir(false);
      toast('success', 'Storage path updated');
    } catch { toast('error', 'Gagal update path'); }
    setDirSaving(false);
  };

  const filtered = search ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : files;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file);
      toast('success', 'File uploaded');
      fetch();
    } catch { toast('error', 'Upload failed'); }
    setUploading(false);
    if (ref.current) ref.current.value = '';
  };

  const card = { background: '#13131A', borderRadius: 12, padding: 16, marginBottom: 8, border: '1px solid #2A2A3C', display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center' as const };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Search size={16} color="#6B6B80" />
        <input placeholder="Search files..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, flex: 1, maxWidth: 400, marginBottom: 0 }} />
        <span style={{ color: '#6B6B80', fontSize: 13 }}>{files.length} files</span>
        <button onClick={() => ref.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 8, fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>
          <Upload size={16} /> Upload
        </button>
        <input ref={ref} type="file" hidden onChange={handleUpload} />
        <button onClick={fetch} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Storage Path Config */}
      <div style={{ background: '#13131A', borderRadius: 12, padding: '12px 16px', border: '1px solid #2A2A3C', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Folder size={16} color="#FCE205" />
        {editingDir ? (
          <>
            <input value={dirInput} onChange={e => setDirInput(e.target.value)} style={{ ...input, flex: 1, marginBottom: 0 }} />
            <button onClick={handleSaveDir} disabled={dirSaving} style={{ padding: '6px 14px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>{dirSaving ? '...' : 'Save'}</button>
            <button onClick={() => setEditingDir(false)} style={{ padding: '6px 14px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ flex: 1, color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>{targetDir || 'Not set'}</span>
            <button onClick={() => { setDirInput(targetDir); setEditingDir(true); }} style={{ padding: '4px 12px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Edit</button>
          </>
        )}
      </div>

      {uploading && <div style={{ ...card, borderColor: '#FCE205', color: '#FCE205', fontSize: 13, marginBottom: 12 }}>Uploading...</div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Loading...</div>
      : filtered.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>{search ? 'No matches' : 'No files'}</div>
      : filtered.map(f => (
        <div key={f.path} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ padding: 8, borderRadius: 8, background: '#1F1F2C' }}><File color="#00F0FF" size={18} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#E0E0FF', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
              <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 2 }}>{f.type.toUpperCase()} · {fmtSize(f.size)} · {new Date(f.modified * 1000).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {['mp4', 'mkv', 'webm', 'mp3', 'm4a', 'flac', 'wav', 'ogg', 'opus'].includes(f.type) && (
              <button onClick={() => setPreviewUrl(getStreamUrl(f.path))}
                style={{ padding: '6px 10px', background: '#00F0FF20', color: '#00F0FF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                <Play size={14} />
              </button>
            )}
            <a href={getDownloadUrl(f.path)} download
              style={{ padding: '6px 10px', background: '#00FF8820', color: '#00FF88', border: 'none', borderRadius: 6, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex' }}>
              <Download size={14} />
            </a>
          </div>
        </div>
      ))}

      {previewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPreviewUrl(null)}>
          <div onClick={e => e.stopPropagation()}>
            {previewUrl.match(/\.(mp4|mkv|webm)/i) ? (
              <video src={previewUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }} />
            ) : (
              <audio src={previewUrl} controls autoPlay style={{ width: 400 }} />
            )}
            <button onClick={() => setPreviewUrl(null)} style={{ display: 'block', margin: '16px auto 0', padding: '8px 20px', background: '#1F1F2C', color: '#E0E0FF', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════ SERVICES TAB ══════════════════════

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
      setTimeout(fetch, 1000);
    } catch (e: any) {
      toast('error', e.response?.data?.error || 'Gagal ' + action);
    }
    setActionLoading(null);
  };

  const handleRestart = async () => {
    const res = await Swal.fire({ title: 'Restart API Server?', text: 'Koneksi akan terputus sementara', icon: 'warning', showCancelButton: true, confirmButtonColor: '#FF003C', cancelButtonColor: '#6B6B80', confirmButtonText: 'Restart', background: '#13131A', color: '#E0E0FF' });
    if (!res.isConfirmed) return;
    setActionLoading('restart-api');
    try {
      const d = await restartApi();
      setServerStatus(d.message);
      toast('success', 'Restart initiated');
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal'); }
    setActionLoading(null);
  };

  const handleShutdown = async () => {
    const res = await Swal.fire({ title: 'Matikan Server?', text: 'Server akan dimatikan total!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#FF003C', cancelButtonColor: '#6B6B80', confirmButtonText: 'Shutdown', background: '#13131A', color: '#E0E0FF' });
    if (!res.isConfirmed) return;
    try {
      await shutdownServer();
      toast('info', 'Shutdown initiated');
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal'); }
  };

  const handleCheckStatus = async () => {
    try {
      const d = await getSystemStatus();
      setServerStatus('API Server: ' + d.status);
      toast('info', 'API Server: ' + d.status);
    } catch { setServerStatus('Gagal cek status'); }
  };

  const badge = (active: boolean) => ({
    padding: '3px 10px', borderRadius: 4, fontSize: 12,
    background: active ? '#00FF8820' : '#FF003C20',
    color: active ? '#00FF88' : '#FF003C',
  });
  const eBadge = (enabled: boolean) => ({
    padding: '3px 10px', borderRadius: 4, fontSize: 12,
    background: enabled ? '#00F0FF20' : '#6B6B8020',
    color: enabled ? '#00F0FF' : '#6B6B80',
  });
  const btn = (c: string) => ({ display: 'flex', alignItems: 'center' as const, gap: 4, padding: '6px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #2A2A3C', background: 'transparent', color: c, cursor: 'pointer' });

  return (
    <div>
      {/* API Server Control */}
      <div style={{ background: '#13131A', borderRadius: 12, padding: 20, border: '1px solid #2A2A3C', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Activity color="#00F0FF" size={20} />
          <h3 style={{ color: '#E0E0FF', fontSize: 15, margin: 0 }}>API Server</h3>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={handleCheckStatus} style={btn('#E0E0FF')}><RefreshCw size={14} /> Check Status</button>
          <button onClick={handleRestart} disabled={actionLoading === 'restart-api'}
            style={{ ...btn('#FCE205'), fontWeight: 'bold' }}><RotateCw size={14} /> Restart</button>
          <button onClick={handleShutdown}
            style={{ ...btn('#FF003C'), fontWeight: 'bold' }}><Power size={14} /> Shutdown</button>
        </div>
        {serverStatus && <div style={{ marginTop: 12, fontSize: 13, padding: 10, borderRadius: 8, background: '#1F1F2C', color: '#E0E0FF' }}>{serverStatus}</div>}
      </div>

      {/* Services */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Loading...</div>
      : services.map(svc => (
        <div key={svc.name} style={{ background: '#13131A', borderRadius: 12, padding: 20, border: '1px solid #2A2A3C', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ color: '#E0E0FF', fontSize: 15, fontWeight: 'bold' }}>{SERVICE_LABELS[svc.name] || svc.name}</div>
              <div style={{ color: '#6B6B80', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{svc.name}.service</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={badge(svc.active === 'active')}>{svc.active === 'active' ? 'Running' : 'Stopped'}</span>
              <span style={eBadge(svc.enabled === 'enabled')}>{svc.enabled === 'enabled' ? 'Auto' : 'Manual'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => handleAction(svc.name, svc.active === 'active' ? 'stop' : 'start')} disabled={actionLoading?.startsWith(svc.name)} style={btn(svc.active === 'active' ? '#FF003C' : '#00FF88')}>
              {svc.active === 'active' ? <Square size={12} /> : <Play size={12} />} {svc.active === 'active' ? 'Stop' : 'Start'}
            </button>
            <button onClick={() => handleAction(svc.name, 'restart')} disabled={actionLoading?.startsWith(svc.name)} style={btn('#FCE205')}><RotateCw size={12} /> Restart</button>
            <button onClick={() => handleAction(svc.name, svc.enabled === 'enabled' ? 'disable' : 'enable')} disabled={actionLoading?.startsWith(svc.name)}
              style={btn(svc.enabled === 'enabled' ? '#FF8800' : '#00F0FF')}>
              {svc.enabled === 'enabled' ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {svc.enabled === 'enabled' ? 'Disable' : 'Enable'}
            </button>
            {actionLoading?.startsWith(svc.name) && <span style={{ color: '#FCE205', fontSize: 11, alignSelf: 'center' }}>Processing...</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════ VPN TAB ════════════════════════

function VpnTab({ input, toast }: { input: any; toast: any }) {
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
    try {
      const r = await fn();
      toast('success', r.message || label + ' berhasil');
      fetch();
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal ' + label); }
    setAl(null);
  };

  const saveConfig = async () => {
    setAl('save');
    try {
      const d: Record<string,string> = { VPN_SERVER: s, VPN_USERNAME: u, VPN_AUTOSTART: auto };
      if (pw) d.VPN_PASSWORD = pw;
      await setVpnConfig(d);
      toast('success', 'Config saved');
      fetch();
    } catch (e: any) { toast('error', e.response?.data?.error || 'Gagal simpan'); }
    setAl(null);
  };

  const box = { background: '#13131A', borderRadius: 12, padding: 24, border: '1px solid #2A2A3C', marginBottom: 20 };
  const btn = (c: string) => ({ display: 'flex', alignItems: 'center' as const, gap: 8, padding: '8px 18px', borderRadius: 8, fontWeight: 'bold' as const, fontSize: 13, cursor: 'pointer', background: c, color: c === '#1F1F2C' ? '#E0E0FF' : '#09090E', border: c === '#1F1F2C' ? '1px solid #2A2A3C' : 'none' });

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#6B6B80' }}>Loading...</div>;

  return (
    <div>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {status?.connected ? <Wifi color="#00FF88" size={28} /> : <WifiOff color="#FF003C" size={28} />}
          <div>
            <div style={{ color: '#E0E0FF', fontSize: 18, fontWeight: 'bold' }}>{status?.connected ? 'Connected' : 'Disconnected'}</div>
            <div style={{ color: '#6B6B80', fontSize: 13 }}>{status?.interface} {status?.ip && '· ' + status.ip}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}><div style={{ color: '#6B6B80', fontSize: 12, marginBottom: 4 }}>Service</div><span style={{ padding: '4px 12px', borderRadius: 4, fontSize: 13, background: status?.service_active ? '#00FF8820' : '#FF003C20', color: status?.service_active ? '#00FF88' : '#FF003C' }}>{status?.service_active ? 'Active' : 'Inactive'}</span></div>
          <div style={{ flex: 1 }}><div style={{ color: '#6B6B80', fontSize: 12, marginBottom: 4 }}>Auto Start</div><span style={{ padding: '4px 12px', borderRadius: 4, fontSize: 13, background: status?.service_enabled ? '#00FF8820' : '#6B6B8020', color: status?.service_enabled ? '#00FF88' : '#6B6B80' }}>{status?.service_enabled ? 'Enabled' : 'Disabled'}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => act(status?.connected ? 'disconnect' : 'connect', status?.connected ? vpnDisconnect : vpnConnect)} disabled={al !== null} style={btn(status?.connected ? '#FF003C' : '#00FF88')}>
            {status?.connected ? <Square size={16} /> : <Play size={16} />} {status?.connected ? 'Disconnect' : 'Connect'}
          </button>
          <button onClick={() => act('refresh', fetch)} disabled={al !== null} style={btn('#1F1F2C')}><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Settings color="#FCE205" size={20} />
          <h3 style={{ color: '#E0E0FF', fontSize: 15, margin: 0 }}>VPN Config</h3>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>SERVER</label><input value={s} onChange={e => setS(e.target.value)} style={input} /></div>
          <div style={{ flex: 1 }}><label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>USERNAME</label><input value={u} onChange={e => setU(e.target.value)} style={input} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}><label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>PASSWORD</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} style={input} placeholder="Kosongkan jika tidak diganti" /></div>
          <div style={{ flex: 1 }}><label style={{ color: '#6B6B80', fontSize: 12, display: 'block', marginBottom: 4 }}>AUTO START</label><select value={auto} onChange={e => setAuto(e.target.value)} style={{ ...input, marginBottom: 0 }}><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
        </div>
        <button onClick={saveConfig} disabled={al !== null} style={{ ...btn('#00F0FF'), marginTop: 16 }}><Save size={16} /> Save</button>
      </div>
    </div>
  );
}

// ══════════════════ CONFIG TAB ═══════════════════════

function ConfigTab({ toast }: { toast: any }) {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  useEffect(() => { getConfig().then(d => setCfg(d.config)).catch(() => {}); }, []);

  const handleSave = async (key: string) => {
    try {
      await updateConfig(key, editVal);
      setCfg(prev => ({ ...prev, [key]: editVal }));
      setEditKey(null);
      toast('success', 'Config updated');
    } catch { toast('error', 'Gagal update'); }
  };

  return (
    <div style={{ background: '#13131A', borderRadius: 12, border: '1px solid #2A2A3C', overflow: 'hidden' }}>
      {Object.keys(cfg).length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Settings size={40} color="#2A2A3C" />
          <p style={{ color: '#6B6B80', marginTop: 12 }}>Belum ada konfigurasi.</p>
        </div>
      ) : Object.entries(cfg).map(([key, value]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #1F1F2C', gap: 12 }}>
          <code style={{ color: '#00F0FF', fontSize: 13, minWidth: 200, fontFamily: 'monospace' }}>{key}</code>
          {editKey === key ? (
            <>
              <input value={editVal} onChange={e => setEditVal(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: 4, background: '#09090E', border: '1px solid #00F0FF', color: '#E0E0FF', fontSize: 13, outline: 'none' }} />
              <button onClick={() => handleSave(key)} style={{ padding: '6px 12px', background: '#00F0FF', color: '#09090E', border: 'none', borderRadius: 4, cursor: 'pointer' }}><Save size={14} /></button>
              <button onClick={() => setEditKey(null)} style={{ padding: '6px 12px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1, color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>{value}</span>
              <button onClick={() => { setEditKey(key); setEditVal(value); }} style={{ padding: '4px 10px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Edit</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
