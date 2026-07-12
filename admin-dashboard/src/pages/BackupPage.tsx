import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import Swal from 'sweetalert2';
import { HardDriveUpload, RotateCw, Database, FileText, Clock } from 'lucide-react';

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
}

function fmtSize(bytes: number) {
  if (!bytes) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function fmtTime(t: string) {
  if (!t) return '-';
  const d = new Date(t + 'Z');
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function BackupPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/backups');
      setBackups(res.data.backups || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const createBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.post('/api/admin/backup');
      if (res.data.success) {
        toast('success', 'Backup berhasil: ' + (res.data.filename || ''));
        fetchBackups();
      } else toast('error', res.data.message || 'Gagal backup');
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal backup'); }
    setBackingUp(false);
  };

  const restoreBackup = async (filename: string) => {
    const res = await Swal.fire({
      title: 'Restore backup?',
      html: `Akan merestore database dari <b>${filename}</b><br/><br/>Database saat ini akan di-backup otomatis sebelumnya.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f79009',
      confirmButtonText: 'Restore',
      cancelButtonText: 'Batal',
      background: 'var(--b1)',
      color: 'var(--bc)',
    });
    if (!res.isConfirmed) return;
    setRestoring(true);
    try {
      const resp = await api.post('/api/admin/backup/restore', { filename });
      if (resp.data.success) {
        toast('success', 'Restore berhasil');
        fetchBackups();
      } else toast('error', resp.data.message || 'Gagal restore');
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal restore'); }
    setRestoring(false);
  };

  const handleRestoreClick = (b: any) => restoreBackup(b.filename);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Backup & Restore</h2>
          <p className="text-sm text-base-content/60 mt-1">Database and configuration backups</p>
        </div>
        <button onClick={createBackup} disabled={backingUp} className="btn btn-primary gap-2">
          <HardDriveUpload size={16} />
          {backingUp ? 'Backing up...' : 'Create Backup'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Database, label: 'Database', desc: 'SQLite database (zdt_api.db)', color: '#465fff' },
          { icon: FileText, label: 'Configuration', desc: 'Config file (config.env)', color: '#f79009' },
          { icon: Clock, label: 'Auto-backup', desc: 'Backup sebelum restore', color: '#12b76a' },
        ].map(s => (
          <div key={s.label} className="card bg-base-100 border border-base-200 p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.color + '15' }}>
                <s.icon size={20} style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-sm font-medium text-base-content">{s.label}</div>
                <div className="text-xs text-base-content/60">{s.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-base-200 rounded" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            <Database size={40} className="mx-auto mb-3 opacity-40" />
            No backups yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50">
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Filename</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Size</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Created</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={i} className="hover:bg-base-200/50 transition-colors">
                    <td className="text-xs font-mono text-base-content">{b.filename}</td>
                    <td className="text-xs text-base-content/60">{fmtSize(b.size)}</td>
                    <td className="text-xs text-base-content/60 whitespace-nowrap">{fmtTime(b.created_at)}</td>
                    <td>
                      <button onClick={() => handleRestoreClick(b)} disabled={restoring} className="btn btn-ghost btn-xs gap-1 text-warning">
                        <RotateCw size={12} />
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
