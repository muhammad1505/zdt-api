import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getDashboard } from '../api/client';
import type { DashboardData } from '../types';
import { Cpu, HardDrive, Clock, Server, Globe, ListTodo, Activity, Wrench, RefreshCw, ChevronRight } from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskStats, setTaskStats] = useState<any>({});
  const navigate = useNavigate();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const fetch = async () => {
      try {
        const [d, t] = await Promise.all([
          getDashboard(),
          api.get('/api/tasks').then(r => r.data).catch(() => ({ stats: {} })),
        ]);
        setData(d);
        setTaskStats(t.stats || {});
      } catch (err: any) {
        setError(err.response?.data?.error || 'Gagal memuat dashboard');
      }
    };
    const start = () => { fetch(); interval = setInterval(fetch, document.hidden ? 30000 : 10000); };
    const onVis = () => { clearInterval(interval); start(); };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (error) return <div className="text-error p-10 text-center">{error}</div>;

  if (!data) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-base-300 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="card bg-base-100 border border-base-200 p-5 md:p-6">
              <div className="w-12 h-12 bg-base-200 rounded-xl" />
              <div className="mt-5 space-y-2">
                <div className="h-4 w-20 bg-base-300 rounded" />
                <div className="h-8 w-24 bg-base-300 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const memUsed = data.memory.total_gb - data.memory.available_gb;
  const memPct = data.memory.total_gb > 0 ? Math.round((memUsed / data.memory.total_gb) * 100) : 0;
  const diskPct = data.disk && data.disk.total > 0 ? Math.round((data.disk.used / data.disk.total) * 100) : 0;
  const cpuAvg = (data.cpu.load_1m + data.cpu.load_5m + data.cpu.load_15m) / 3;
  const totalTasks = (taskStats.queued || 0) + (taskStats.running || 0) + (taskStats.completed || 0) + (taskStats.failed || 0) + (taskStats.cancelled || 0);

  const quickLinks = [
    { path: '/tasks', icon: ListTodo, label: 'Task Queue', desc: `${totalTasks} total tasks`, color: '#465fff', count: totalTasks },
    { path: '/files', icon: HardDrive, label: 'Files', desc: `${data.file_count} files`, color: '#12b76a', count: data.file_count },
    { path: '/tools', icon: Wrench, label: 'Tools', desc: 'Run maintenance tools', color: '#f79009' },
    { path: '/logs', icon: Activity, label: 'Logs', desc: 'Activity & system logs', color: '#ee46bc' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Dashboard</h2>
          <p className="text-sm text-base-content/60 mt-1">v{data.version} · {data.hostname} · {data.arch}</p>
        </div>
        <button onClick={async () => { try { const d = await getDashboard(); setData(d); } catch {} }} className="btn btn-ghost btn-sm">
          <RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-xl">
            <Cpu className="text-primary size-6" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-base-content/60">CPU Load</span>
            <h4 className="font-bold text-base-content text-[30px] leading-[38px]">{data.cpu.load_1m.toFixed(2)}</h4>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-3 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(cpuAvg * 10, 100)}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2">5m: {data.cpu.load_5m.toFixed(2)} · 15m: {data.cpu.load_15m.toFixed(2)}</p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-warning/10 rounded-xl">
            <Activity className="text-warning size-6" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-base-content/60">Memory</span>
            <h4 className="font-bold text-base-content text-[30px] leading-[38px]">{memUsed.toFixed(1)} <span className="text-base font-normal text-base-content/60">/ {data.memory.total_gb} GB</span></h4>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-3 overflow-hidden">
            <div className="h-full rounded-full bg-warning transition-all duration-500" style={{ width: `${memPct}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2"><span className="font-medium">{data.memory.available_gb.toFixed(1)} GB</span> available</p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: (diskPct > 80 ? '#f0443820' : diskPct > 50 ? '#f7900920' : '#12b76a20') }}>
            <HardDrive className={`size-6 ${diskPct > 80 ? 'text-error' : diskPct > 50 ? 'text-warning' : 'text-success'}`} />
          </div>
          <div className="mt-5">
            <span className="text-sm text-base-content/60">Disk</span>
            <h4 className="font-bold text-base-content text-[30px] leading-[38px]">{data.disk?.used || 0} <span className="text-base font-normal text-base-content/60">/ {data.disk?.total || 0} GB</span></h4>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${diskPct > 80 ? 'bg-error' : diskPct > 50 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${diskPct}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2"><span className="font-medium">{data.disk?.free || 0} GB</span> free</p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-base-200">
            <Clock className="text-primary size-6" />
          </div>
          <div className="mt-5">
            <span className="text-sm text-base-content/60">Uptime</span>
            <h4 className="font-bold text-base-content text-[30px] leading-[38px]">
              {Math.floor(data.uptime_hours / 24)}d {Math.floor(data.uptime_hours % 24)}h
            </h4>
          </div>
          <p className="text-xs text-base-content/60 mt-6">Python {data.python} · {data.arch}</p>
        </div>
      </div>

      {/* Task Stats Mini Dashboard */}
      <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ListTodo size={18} className="text-primary" />
          <h3 className="text-base font-medium text-base-content flex-1">Task Queue Overview</h3>
          <button onClick={() => navigate('/tasks')} className="btn btn-ghost btn-xs gap-1">
            View All <ChevronRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { key: 'queued', label: 'Queued', value: taskStats.queued || 0, color: 'text-warning', bg: 'bg-warning/10' },
            { key: 'running', label: 'Running', value: taskStats.running || 0, color: 'text-primary', bg: 'bg-primary/10' },
            { key: 'completed', label: 'Completed', value: taskStats.completed || 0, color: 'text-success', bg: 'bg-success/10' },
            { key: 'failed', label: 'Failed', value: taskStats.failed || 0, color: 'text-error', bg: 'bg-error/10' },
            { key: 'total', label: 'Total', value: totalTasks, color: 'text-base-content', bg: 'bg-base-200' },
          ].map(s => (
            <div key={s.key} className={`rounded-xl p-4 text-center ${s.bg}`}>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs font-medium text-base-content/60 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Links + System Info */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        {/* Quick Links */}
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <h3 className="text-base font-medium text-base-content mb-4 flex items-center gap-2">
            <Server className="text-primary size-5" /> Quick Access
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {quickLinks.map(link => {
              const Icon = link.icon;
              return (
                <div key={link.path} onClick={() => navigate(link.path)} className="flex items-center gap-3 p-3 rounded-xl border border-base-200 hover:border-primary/30 hover:shadow-sm cursor-pointer transition-all">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: link.color + '15' }}>
                    <Icon size={18} style={{ color: link.color }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-base-content">{link.label}</div>
                    <div className="text-xs text-base-content/60 truncate">{link.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* System Info */}
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <h3 className="text-base font-medium text-base-content mb-4 flex items-center gap-2">
            <Server className="text-primary size-5" /> System Info
          </h3>
          <div className="space-y-0">
            {[
              { label: 'Hostname', value: data.hostname },
              { label: 'Architecture', value: data.arch },
              { label: 'Python', value: data.python },
              { label: 'Version', value: data.version },
              { label: 'Target Dir', value: data.target_dir },
              { label: 'IP Addresses', value: data.ips?.join(', ') || 'N/A' },
            ].map(item => (
              <div key={item.label} className="flex justify-between py-2.5 border-b border-base-200 last:border-0">
                <span className="text-sm text-base-content/60">{item.label}</span>
                <span className="text-sm text-base-content font-mono text-right max-w-[60%] truncate">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Services + VPN */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="text-primary size-5" />
            <h3 className="text-base font-medium text-base-content flex-1">Services</h3>
            <button onClick={() => navigate('/settings?tab=services')} className="btn btn-ghost btn-xs gap-1">
              Manage <ChevronRight size={12} />
            </button>
          </div>
          {Object.entries(data.services).map(([name, running]) => (
            <div key={name} className="flex justify-between py-2.5 border-b border-base-200 last:border-0">
              <span className="flex items-center gap-2 text-sm text-base-content">
                {name.replace('zdt-', '').replace('.py', '')}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${running ? 'text-success' : 'text-error'}`}>
                {running ? <><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Running</> : <><span className="w-1.5 h-1.5 rounded-full bg-error" /> Stopped</>}
              </span>
            </div>
          ))}
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className={data.vpn?.connected ? 'text-success size-5' : 'text-error size-5'} />
            <h3 className="text-base font-medium text-base-content flex-1">VPN</h3>
            <button onClick={() => navigate('/settings?tab=vpn')} className="btn btn-ghost btn-xs gap-1">
              Manage <ChevronRight size={12} />
            </button>
          </div>
          <div className="py-2.5 border-b border-base-200 flex justify-between">
            <span className="text-sm text-base-content/60">Status</span>
            <span className={`text-sm font-semibold ${data.vpn?.connected ? 'text-success' : 'text-error'}`}>
              {data.vpn?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {data.vpn.ip && (
            <div className="py-2.5 border-b border-base-200 flex justify-between">
              <span className="text-sm text-base-content/60">VPN IP</span>
              <span className="text-sm text-base-content font-mono">{data.vpn.ip}</span>
            </div>
          )}
          <div className="py-2.5 flex justify-between">
            <span className="text-sm text-base-content/60">Server</span>
            <span className="text-sm text-base-content font-mono">{data.vpn.server || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
