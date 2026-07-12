import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import Swal from 'sweetalert2';
import { Package, Wrench, CheckCircle2, XCircle, RefreshCw, Terminal } from 'lucide-react';

const DEP_ICONS: Record<string, string> = {
  python3: '#3776AB',
  ffmpeg: '#007808',
  nodejs: '#339933',
  npm: '#CB3837',
  'yt-dlp': '#FF0000',
  spotdl: '#1DB954',
  demucs: '#8B5CF6',
};

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
}

export default function DependenciesPage() {
  const [deps, setDeps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);

  const fetchDeps = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/dependencies');
      const all = res.data.dependencies || res.data.tools || [];
      const pip = res.data.pip_packages || [];
      const allDeps = [...all, ...pip.map((p: any) => ({ ...p, is_pip: true }))];
      setDeps(allDeps);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeps(); }, [fetchDeps]);

  const installMissing = async () => {
    const res = await Swal.fire({
      title: 'Install missing dependencies?',
      text: 'Akan menjalankan setup.sh --install-missing. Bisa memakan waktu hingga 10 menit.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#465fff',
      confirmButtonText: 'Install',
      background: 'var(--b1)',
      color: 'var(--bc)',
    });
    if (!res.isConfirmed) return;
    setInstalling(true);
    setShowLog(true);
    setInstallLog(['Memulai instalasi...']);
    try {
      const resp = await api.post('/api/admin/dependencies/install', {}, { timeout: 600000 });
      if (resp.data.success) {
        setInstallLog(prev => [...prev, '✅ Instalasi selesai']);
        toast('success', 'Dependencies installed');
        fetchDeps();
      } else {
        setInstallLog(prev => [...prev, `❌ ${resp.data.message || 'Gagal'}`]);
        toast('error', resp.data.message || 'Gagal install');
      }
    } catch (e: any) {
      setInstallLog(prev => [...prev, `❌ ${e.response?.data?.message || e.message}`]);
      toast('error', e.response?.data?.message || 'Gagal install');
    }
    setInstalling(false);
  };

  const missingCount = deps.filter(d => !d.available && !d.found).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Dependencies</h2>
          <p className="text-sm text-base-content/60 mt-1">Check and install required system tools</p>
        </div>
        <div className="flex items-center gap-2">
          {missingCount > 0 && (
            <button onClick={installMissing} disabled={installing} className="btn btn-primary gap-2">
              <Terminal size={16} />
              {installing ? 'Installing...' : `Install Missing (${missingCount})`}
            </button>
          )}
          <button onClick={fetchDeps} className="btn btn-ghost gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card bg-base-100 border border-base-200 p-5 animate-pulse">
              <div className="h-4 bg-base-200 rounded w-24 mb-3" />
              <div className="h-3 bg-base-200 rounded w-32" />
            </div>
          ))
        ) : deps.length === 0 ? (
          <div className="col-span-full text-center py-10 text-sm text-base-content/60">
            <Package size={40} className="mx-auto mb-3 opacity-40" />
            No dependency data available
          </div>
        ) : deps.map((d, i) => {
          const available = d.available || d.found;
          const version = d.version || d.versions?.join(', ');
          const color = DEP_ICONS[d.name] || '#667085';
          return (
            <div key={i} className={`card border p-5 ${available ? 'bg-base-100 border-base-200' : 'bg-base-100 border-error/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wrench size={16} style={{ color }} />
                  <span className="text-sm font-medium text-base-content">{d.name}</span>
                  {d.is_pip && <span className="badge badge-ghost badge-xs">pip</span>}
                </div>
                {available
                  ? <CheckCircle2 size={18} className="text-success" />
                  : <XCircle size={18} className="text-error" />
                }
              </div>
              {version ? (
                <p className="text-xs text-base-content/60 font-mono">{version}</p>
              ) : (
                <p className="text-xs text-error">{d.is_pip ? 'Not installed' : 'Not found'}</p>
              )}
            </div>
          );
        })}
      </div>

      {showLog && (
        <div className="fixed bottom-5 right-5 z-[99999] w-[480px] max-h-80 rounded-2xl border border-base-200 overflow-hidden flex flex-col shadow-lg bg-base-100">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-base-200 shrink-0">
            <Terminal size={14} className={installing ? 'text-primary animate-pulse' : 'text-base-content/60'} />
            <span className="text-xs font-semibold flex-1 text-base-content/60">Install Log</span>
            <button onClick={() => setShowLog(false)} className="btn btn-ghost btn-xs">Close</button>
          </div>
          <div className="flex-1 p-3 overflow-auto font-mono text-xs leading-relaxed bg-base-200" style={{ maxHeight: 240 }}>
            {installLog.map((line, i) => (
              <div key={i} className={
                line.includes('✅') ? 'text-success'
                : line.includes('❌') ? 'text-error'
                : line.includes('Memulai') ? 'text-primary'
                : 'text-base-content'
              }>{line}</div>
            ))}
            {installing && <div className="text-primary animate-pulse mt-1">Processing...</div>}
          </div>
        </div>
      )}
    </div>
  );
}
