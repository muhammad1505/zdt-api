import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import Swal from 'sweetalert2';
import { Package, Wrench, CheckCircle2, XCircle, RefreshCw, Terminal } from 'lucide-react';

const DEP_ICONS: Record<string, string> = {
  python3: '#3776AB', ffmpeg: '#007808', nodejs: '#339933', npm: '#CB3837',
  'yt-dlp': '#FF0000', spotdl: '#1DB954', demucs: '#8B5CF6',
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
      setDeps(res.data.dependencies || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchDeps(); }, [fetchDeps]);

  const installMissing = async () => {
    const res = await Swal.fire({
      title: 'Install missing dependencies?',
      text: 'Akan menjalankan setup.sh --install-missing. Bisa memakan waktu hingga 10 menit.',
      icon: 'question', showCancelButton: true, confirmButtonColor: '#465fff',
      confirmButtonText: 'Install', background: 'var(--b1)', color: 'var(--bc)',
    });
    if (!res.isConfirmed) return;
    setInstalling(true); setShowLog(true); setInstallLog(['Memulai instalasi...']);
    try {
      const resp = await api.post('/api/admin/dependencies/install', {}, { timeout: 600000 });
      if (resp.data.success) {
        setInstallLog(prev => [...prev, '✅ Instalasi selesai']); toast('success', 'Dependencies installed');
        fetchDeps();
      } else { setInstallLog(prev => [...prev, `❌ ${resp.data.message || 'Gagal'}`]); toast('error', resp.data.message || 'Gagal install'); }
    } catch (e: any) { setInstallLog(prev => [...prev, `❌ ${e.response?.data?.message || e.message}`]); toast('error', e.response?.data?.message || 'Gagal install'); }
    setInstalling(false);
  };

  const missingCount = deps.filter(d => !d.installed).length;
  const grouped = deps.reduce((acc, d) => {
    const g = d._group || 'other';
    if (!acc[g]) acc[g] = [];
    acc[g].push(d);
    return acc;
  }, {} as Record<string, any[]>);
  const groupOrder = ['core', 'system', 'tool', 'pip'];
  const groupLabels: Record<string, string> = { core: 'Core', system: 'System Tools', tool: 'Python Tools', pip: 'Pip Modules' };

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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card bg-base-100 border border-base-200 p-5 animate-pulse">
              <div className="h-4 bg-base-200 rounded w-24 mb-3" />
              <div className="h-3 bg-base-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : deps.length === 0 ? (
        <div className="text-center py-10 text-sm text-base-content/60">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          No dependency data available
        </div>
      ) : (
        groupOrder.filter(g => grouped[g]).map(group => (
          <div key={group} className="space-y-3">
            <h3 className="text-sm font-semibold text-base-content/80">{groupLabels[group] || group}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[group].map((d: any, i: number) => {
                const color = DEP_ICONS[d._key] || '#667085';
                return (
                  <div key={i} className={`card border p-4 ${d.installed ? 'bg-base-100 border-base-200' : 'bg-base-100 border-error/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Wrench size={15} style={{ color }} />
                        <span className="text-sm font-medium text-base-content">{d._label || d._key}</span>
                      </div>
                      {d.installed ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-error" />}
                    </div>
                    {d.version ? (
                      <p className="text-xs text-base-content/60 font-mono truncate">{d.version}</p>
                    ) : (
                      <p className="text-xs text-error">Not installed</p>
                    )}
                    {d.path && d.installed && (
                      <p className="text-[10px] text-base-content/40 font-mono truncate mt-0.5">{d.path}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

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
                line.includes('✅') ? 'text-success' : line.includes('❌') ? 'text-error'
                : line.includes('Memulai') ? 'text-primary' : 'text-base-content'
              }>{line}</div>
            ))}
            {installing && <div className="text-primary animate-pulse mt-1">Processing...</div>}
          </div>
        </div>
      )}
    </div>
  );
}
