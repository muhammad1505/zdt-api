import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import Swal from 'sweetalert2';
import { Puzzle, Play, Square, RefreshCw, CheckCircle2, FileCode } from 'lucide-react';

function toast(icon: 'success' | 'error' | 'info', title: string) {
  Swal.fire({ icon, title, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: 'var(--b1)', color: 'var(--bc)', customClass: { container: '!z-[999999]' } });
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/plugins');
      setPlugins(res.data.plugins || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  const loadPlugin = async (name: string) => {
    setActionLoading(name);
    try {
      const res = await api.post(`/api/admin/plugins/${name}/load`);
      if (res.data.success) toast('success', `Plugin "${name}" loaded`);
      else toast('error', res.data.message || 'Gagal load');
      fetchPlugins();
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal load plugin'); }
    setActionLoading(null);
  };

  const unloadPlugin = async (name: string) => {
    setActionLoading(name);
    try {
      const res = await api.post(`/api/admin/plugins/${name}/unload`);
      if (res.data.success) toast('success', `Plugin "${name}" unloaded`);
      else toast('error', res.data.message || 'Gagal unload');
      fetchPlugins();
    } catch (e: any) { toast('error', e.response?.data?.message || 'Gagal unload plugin'); }
    setActionLoading(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Plugins</h2>
          <p className="text-sm text-base-content/60 mt-1">Manage hot-loadable plugins</p>
        </div>
        <button onClick={fetchPlugins} className="btn btn-ghost gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-base-200 rounded" />)}
          </div>
        ) : plugins.length === 0 ? (
          <div className="text-center py-12 text-sm">
            <Puzzle size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-base-content font-medium mb-1">No plugins found</p>
            <p className="text-base-content/60 max-w-md mx-auto mb-6">
              Letakkan file <code className="text-primary">.py</code> di folder <code className="text-primary">plugins/</code> dengan class yang mewarisi <code className="text-primary">PluginBase</code>.
            </p>
            <div className="bg-base-200 rounded-xl p-4 text-left max-w-lg mx-auto">
              <p className="text-xs font-semibold text-base-content/80 mb-2">Contoh plugin:</p>
              <pre className="text-[11px] text-base-content/70 font-mono leading-relaxed">{`from plugin_system import PluginBase

class HelloPlugin(PluginBase):
    name = 'hello'
    version = '1.0.0'
    description = 'Plugin contoh'
    hooks = ['startup', 'task_complete']

    def on_startup(self):
        print("Hello from plugin!")

    def on_task_complete(self, task):
        print(f"Task done: {task.get('id')}")`}</pre>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-base-200">
            {plugins.map((p, i) => (
              <div key={i} className="p-5 flex items-center justify-between hover:bg-base-200/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.loaded ? 'bg-success/10' : 'bg-base-200'}`}>
                    {p.loaded ? <CheckCircle2 size={20} className="text-success" /> : <FileCode size={20} className="text-base-content/40" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-base-content flex items-center gap-2">
                      {p.name}
                      <span className={`badge badge-sm ${p.loaded ? 'badge-success' : 'badge-ghost'}`}>
                        {p.loaded ? 'Loaded' : 'Unloaded'}
                      </span>
                      {p.version && <span className="text-[10px] text-base-content/40">v{p.version}</span>}
                    </div>
                    {p.description && <p className="text-xs text-base-content/60 mt-0.5">{p.description}</p>}
                    {p.file && <p className="text-[10px] text-base-content/40 mt-0.5 font-mono">{p.file}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!p.loaded ? (
                    <button onClick={() => loadPlugin(p.name)} disabled={actionLoading === p.name}
                      className="btn btn-primary btn-xs gap-1">
                      {actionLoading === p.name ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                      Load
                    </button>
                  ) : (
                    <button onClick={() => unloadPlugin(p.name)} disabled={actionLoading === p.name}
                      className="btn btn-warning btn-xs gap-1">
                      {actionLoading === p.name ? <RefreshCw size={12} className="animate-spin" /> : <Square size={12} />}
                      Unload
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
