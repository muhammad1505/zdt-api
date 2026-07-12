import { useState, useEffect, useCallback } from 'react';
import api, { apiSilent } from '../api/client';
import Swal from 'sweetalert2';
import { RefreshCw, Download, ArrowUpCircle, FileText, Loader2, CheckCircle2 } from 'lucide-react';

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 4000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
}

export default function UpdatePage() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [updateLog, setUpdateLog] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const checkUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const res = await api.get('/api/update-check');
      setUpdateInfo(res.data);
      if (res.data.update_available) {
        toast('info', `Update ${res.data.latest_version} tersedia!`);
      } else {
        toast('success', 'Already up to date');
      }
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal cek update'); }
    setChecking(false);
  }, []);

  useEffect(() => { checkUpdate(); }, [checkUpdate]);

  const fetchLog = useCallback(async () => {
    try {
      const res = await apiSilent.get('/api/update-log');
      setUpdateLog((res.data.log || '').split('\n').filter(Boolean));
    } catch {}
  }, []);

  const applyUpdate = async () => {
    const res = await Swal.fire({
      title: 'Apply update?',
      html: 'Akan menjalankan:<br/><b>git pull</b> → <b>pip install</b> → <b>restart service</b>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#465fff',
      confirmButtonText: 'Apply & Restart',
      cancelButtonText: 'Batal',
      background: 'var(--b1)',
      color: 'var(--bc)',
    });
    if (!res.isConfirmed) return;
    setApplying(true);
    setShowLog(true);
    setUpdateLog(['Memulai update...']);
    try {
      const resp = await api.post('/api/update-apply', {}, { timeout: 120000 });
      if (resp.data.success) {
        setUpdateLog(prev => [...prev, '✅ Update applied, server restarting...']);
        toast('success', 'Update applied, server restarting...');
      } else {
        setUpdateLog(prev => [...prev, `❌ ${resp.data.message || 'Gagal'}`]);
        toast('error', resp.data.message || 'Gagal update');
      }
    } catch (e: any) {
      setUpdateLog(prev => [...prev, `❌ ${e.response?.data?.message || e.message}`]);
    }
    setApplying(false);
    setTimeout(() => fetchLog(), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Update</h2>
          <p className="text-sm text-base-content/60 mt-1">Check and apply updates from GitHub</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowLog(true); fetchLog(); }} className="btn btn-ghost gap-2">
            <FileText size={16} /> View Log
          </button>
          <button onClick={checkUpdate} disabled={checking} className="btn btn-ghost gap-2">
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check'}
          </button>
        </div>
      </div>

      <div className="card bg-base-100 border border-base-200 p-6">
        {updateInfo ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-base-content/60 mb-1">Current Version</div>
                <div className="text-2xl font-bold text-base-content">{updateInfo.current_version || '-'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-base-content/60 mb-1">Latest Version</div>
                <div className="text-2xl font-bold" style={{ color: updateInfo.update_available ? '#f79009' : '#12b76a' }}>
                  {updateInfo.latest_version || '-'}
                </div>
              </div>
            </div>

            {updateInfo.update_available && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <ArrowUpCircle size={20} className="text-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-base-content">Update available: {updateInfo.latest_version}</div>
                    {updateInfo.release_url && (
                      <a href={updateInfo.release_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline block mt-1">
                        View release →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!updateInfo.update_available && (
              <div className="bg-success/10 border border-success/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-success shrink-0" />
                  <span className="text-sm text-base-content">Already up to date</span>
                </div>
              </div>
            )}

            {updateInfo.update_available && !applying && (
              <button onClick={applyUpdate} className="btn btn-primary gap-2 w-full">
                <Download size={16} /> Apply Update & Restart
              </button>
            )}
          </div>
        ) : checking ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-base-content/60">
            <ArrowUpCircle size={40} className="mx-auto mb-3 opacity-40" />
            Click check to check for updates
          </div>
        )}
      </div>

      {showLog && (
        <div className="fixed bottom-5 right-5 z-[99999] w-[520px] max-h-96 rounded-2xl border border-base-200 overflow-hidden flex flex-col shadow-lg bg-base-100">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-base-200 shrink-0">
            <FileText size={14} className="text-base-content/60" />
            <span className="text-xs font-semibold flex-1 text-base-content/60">Update Log</span>
            <button onClick={() => setShowLog(false)} className="btn btn-ghost btn-xs">Close</button>
          </div>
          <div className="flex-1 p-3 overflow-auto font-mono text-xs leading-relaxed bg-base-200" style={{ maxHeight: 300 }}>
            {updateLog.length === 0 ? (
              <span className="text-base-content/60">No log entries yet.</span>
            ) : updateLog.map((line, i) => (
              <div key={i} className={
                line.includes('✅') ? 'text-success'
                : line.includes('❌') ? 'text-error'
                : line.includes('Memulai') || line.includes('Applying') ? 'text-primary'
                : 'text-base-content'
              }>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
