import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';
import Swal from 'sweetalert2';
import { ListTodo, Play, XCircle, Trash2, RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2, Activity } from 'lucide-react';

const STATUS_ICONS: Record<string, any> = {
  queued: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
  cancelled: XCircle,
};

const STATUS_BADGES: Record<string, string> = {
  queued: 'badge badge-warning',
  running: 'badge badge-info',
  completed: 'badge badge-success',
  failed: 'badge badge-error',
  cancelled: 'badge badge-ghost',
};

const TASK_TYPES = [
  { value: 'download_audio', label: 'Download Audio', color: '#465fff' },
  { value: 'download_video', label: 'Download Video', color: '#12b76a' },
  { value: 'demucs', label: 'Pisah Vokal', color: '#ee46bc' },
  { value: 'sync_lirik', label: 'Sync Lirik', color: '#f79009' },
  { value: 'kompres', label: 'Kompres', color: '#f97066' },
];

function fmtTime(t: string) {
  if (!t) return '-';
  const d = new Date(t + 'Z');
  return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
}

export default function TaskQueuePage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [streamConnected, setStreamConnected] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ type: 'download_audio', url: '', format: 'best' });
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = filter ? `?status=${filter}` : '';
      const res = await api.get(`/api/tasks${params}`);
      setTasks(res.data.tasks || []);
      setStats(res.data.stats || {});
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const connectSSE = useCallback(() => {
    const token = localStorage.getItem('zdt_admin_token');
    const url = `/api/tasks/stream?token=${encodeURIComponent(token || '')}`;
    const es = new EventSource(url);
    es.onopen = () => setStreamConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'task_update') fetchTasks();
      } catch {}
    };
    es.onerror = () => { setStreamConnected(false); es.close(); setTimeout(connectSSE, 3000); };
    eventSourceRef.current = es;
  }, [fetchTasks]);

  useEffect(() => {
    connectSSE();
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, [connectSSE]);

  const cancelTask = async (id: number) => {
    try {
      await api.post(`/api/tasks/${id}/cancel`);
      toast('success', 'Task dibatalkan');
      fetchTasks();
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal cancel'); }
  };

  const deleteTask = async (id: number) => {
    const res = await Swal.fire({ title: 'Hapus task?', text: 'Task akan dihapus dari history', icon: 'warning', showCancelButton: true, confirmButtonColor: '#f04438', confirmButtonText: 'Hapus', background: 'var(--b1)', color: 'var(--bc)' });
    if (!res.isConfirmed) return;
    try {
      await api.delete(`/api/tasks/${id}`);
      toast('success', 'Task dihapus');
      fetchTasks();
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal hapus'); }
  };

  const createTask = async () => {
    if (!form.url.trim()) { toast('error', 'URL harus diisi'); return; }
    setCreating(true);
    try {
      await api.post('/api/tasks', { type: form.type, url: form.url, format: form.format, source: 'web' });
      toast('success', 'Task ditambahkan ke antrian');
      setShowCreate(false);
      setForm({ type: 'download_audio', url: '', format: 'best' });
      fetchTasks();
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal buat task'); }
    setCreating(false);
  };

  const getTypeInfo = (type: string) => TASK_TYPES.find(t => t.value === type) || { value: type, label: type, color: '#667085' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Task Queue</h2>
          <p className="text-sm text-base-content/60 mt-1">Manage download and processing tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="btn btn-primary gap-2">
            <Play size={16} /> New Task
          </button>
          <button onClick={fetchTasks} className="btn btn-ghost gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { key: 'queued', label: 'Queued', color: 'text-warning', bg: 'bg-warning/10' },
            { key: 'running', label: 'Running', color: 'text-primary', bg: 'bg-primary/10' },
            { key: 'completed', label: 'Completed', color: 'text-success', bg: 'bg-success/10' },
            { key: 'failed', label: 'Failed', color: 'text-error', bg: 'bg-error/10' },
            { key: 'total', label: 'Total', color: 'text-base-content', bg: 'bg-base-200' },
          ].map(s => (
            <div key={s.key} className={`card border border-base-200 p-4 ${s.bg}`}>
              <div className="text-2xl font-bold text-base-content">{stats[s.key] || 0}</div>
              <div className={`text-xs font-medium mt-1 ${s.color}`}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {['', 'queued', 'running', 'completed', 'failed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none transition-all ${filter === s ? 'badge badge-primary' : 'btn btn-ghost btn-sm'}`}>
            {s || 'All'}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-auto text-[10px] text-base-content/60">
          <span className={`w-1.5 h-1.5 rounded-full ${streamConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
          {streamConnected ? 'Live' : 'Reconnecting...'}
        </div>
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-base-200 rounded" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            <ListTodo size={40} className="mx-auto mb-3 opacity-40" />
            {filter ? `No tasks with status "${filter}"` : 'No tasks yet'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50">
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Type</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">URL</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Status</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Progress</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Created</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const typeInfo = getTypeInfo(task.type);
                  const StatusIcon = STATUS_ICONS[task.status] || Activity;
                  return (
                    <tr key={task.id} className="hover:bg-base-200/50 transition-colors">
                      <td>
                        <span className="badge badge-sm font-mono" style={{ background: typeInfo.color + '20', color: typeInfo.color }}>{typeInfo.label}</span>
                      </td>
                      <td className="text-xs text-base-content/80 max-w-[250px] truncate font-mono">{task.url || '-'}</td>
                      <td>
                        <span className={`gap-1 ${STATUS_BADGES[task.status] || 'badge-ghost'} badge-sm`}>
                          <StatusIcon size={10} className={task.status === 'running' ? 'animate-spin' : ''} />
                          {task.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <progress className="progress w-20" value={task.progress || 0} max="100" />
                          <span className="text-xs text-base-content/60">{task.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="text-xs text-base-content/60 whitespace-nowrap">{fmtTime(task.created_at)}</td>
                      <td>
                        <div className="flex gap-1">
                          {(task.status === 'queued' || task.status === 'running') && (
                            <button onClick={() => cancelTask(task.id)} className="btn btn-ghost btn-xs text-warning" title="Cancel">
                              <XCircle size={14} />
                            </button>
                          )}
                          {task.status !== 'running' && (
                            <button onClick={() => deleteTask(task.id)} className="btn btn-ghost btn-xs text-error" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
          <div className="card bg-base-100 border border-base-200 p-6 w-[480px] max-w-[90%] shadow-md">
            <h3 className="text-base font-semibold text-base-content mb-4">New Task</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-base-content/60 block mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="select select-bordered w-full text-sm">
                  {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-base-content/60 block mb-1">URL</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://youtube.com/watch?v=..." className="input input-bordered w-full text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-base-content/60 block mb-1">Format</label>
                <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))} className="select select-bordered w-full text-sm">
                  <option value="best">Best</option>
                  <option value="audio">Audio only</option>
                  <option value="video">Video</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-sm">Batal</button>
              <button onClick={createTask} disabled={creating} className="btn btn-primary btn-sm">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {creating ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
