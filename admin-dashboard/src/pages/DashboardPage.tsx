import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard, getDependencies, installDependencies, getServices } from '../api/client';
import type { DashboardData, DependencyInfo } from '../types';
import { Cpu, HardDrive, Clock, Activity, Folder, Server, Globe, Package, CheckCircle, XCircle, Download, ChevronDown, ChevronRight, ArrowUp, X, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deps, setDeps] = useState<DependencyInfo[] | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [depsOpen, setDepsOpen] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [allServices, setAllServices] = useState<any[] | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const fetch = async () => {
      try {
        const d = await getDashboard();
        setData(d);
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

  useEffect(() => {
    getDependencies().then(r => setDeps(r.dependencies)).catch(() => {});
  }, []);

  const handleInstall = async () => {
    setInstalling(true); setInstallMsg(null);
    try {
      const r = await installDependencies();
      setInstallMsg(r.success ? 'Instalasi berhasil!' : 'Instalasi gagal');
      const fresh = await getDependencies();
      setDeps(fresh.dependencies);
    } catch (err: any) { setInstallMsg(err.response?.data?.error || 'Gagal install'); }
    setInstalling(false);
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Dashboard</h2>
          <p className="text-sm text-base-content/60 mt-1">
            v{data.version} · {data.hostname} · {data.arch}
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const d = await getDashboard();
              setData(d);
            } catch {}
          }}
          className="btn btn-ghost btn-sm"
          title="Refresh dashboard data"
        >
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md hover:border-primary/30 transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-base-200 rounded-xl">
            <Cpu className="text-primary size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-base-content/60">CPU Load</span>
              <h4 className="mt-2 font-bold text-base-content text-[30px] leading-[38px]">{data.cpu.load_1m.toFixed(2)}</h4>
            </div>
            <span className="badge badge-success gap-1">
              <ArrowUp className="size-3.5" /> 1m avg
            </span>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(cpuAvg * 10, 100)}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2">5m: {data.cpu.load_5m.toFixed(2)} · 15m: {data.cpu.load_15m.toFixed(2)}</p>
        </div>

        <div className="group card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md hover:border-warning/30 transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-base-200 rounded-xl group-hover:scale-110 transition-transform">
            <Activity className="text-warning size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-base-content/60">Memory</span>
              <h4 className="mt-2 font-bold text-base-content text-[30px] leading-[38px]">{memUsed.toFixed(1)} <span className="text-base font-normal text-base-content/60">/ {data.memory.total_gb} GB</span></h4>
            </div>
            <span className="badge badge-warning gap-1">
              {memPct}% used
            </span>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-warning transition-all duration-500" style={{ width: `${memPct}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2">{data.memory.available_gb.toFixed(1)} GB available</p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-base-200 rounded-xl">
            <HardDrive className={`size-6 ${diskPct > 80 ? 'text-error' : diskPct > 50 ? 'text-warning' : 'text-success'}`} />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-base-content/60">Disk</span>
              <h4 className="mt-2 font-bold text-base-content text-[30px] leading-[38px]">{data.disk?.used || 0} <span className="text-base font-normal text-base-content/60">/ {data.disk?.total || 0} GB</span></h4>
            </div>
            <span className={`badge gap-1 ${
              diskPct > 80 ? 'badge-error'
              : diskPct > 50 ? 'badge-warning'
              : 'badge-success'
            }`}>
              {diskPct}%
            </span>
          </div>
          <div className="w-full h-2 bg-base-200 rounded-full mt-4 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${
              diskPct > 80 ? 'bg-error' : diskPct > 50 ? 'bg-warning' : 'bg-success'
            }`} style={{ width: `${diskPct}%` }} />
          </div>
          <p className="text-xs text-base-content/60 mt-2">{data.disk?.free || 0} GB free</p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6 hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-base-200 rounded-xl">
            <Clock className="text-primary size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-base-content/60">Uptime</span>
              <h4 className="mt-2 font-bold text-base-content text-[30px] leading-[38px]">
                {Math.floor(data.uptime_hours / 24)}d {Math.floor(data.uptime_hours % 24)}h
              </h4>
            </div>
          </div>
          <p className="text-xs text-base-content/60 mt-6">Python {data.python} · {data.arch}</p>
        </div>
      </div>

      {/* System Info + Storage */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
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
              { label: 'IP Addresses', value: data.ips?.join(', ') || 'N/A' },
            ].map(item => (
              <div key={item.label} className="flex justify-between py-2.5 border-b border-base-200 last:border-0">
                <span className="text-sm text-base-content/60">{item.label}</span>
                <span className="text-sm text-base-content font-mono text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <h3 className="text-base font-medium text-base-content mb-4 flex items-center gap-2">
            <Folder className="text-warning size-5" /> Storage
          </h3>
          <div className="mb-4">
            <span className="text-sm text-base-content/60">Target Directory</span>
            <code className="block mt-1 text-sm font-mono text-base-content bg-base-200 p-3 rounded-lg border border-base-200 break-all">
              {data.target_dir}
            </code>
          </div>
          <div className="flex gap-6">
            <div>
              <span className="text-xs text-base-content/60">Files</span>
              <div className="text-xl font-bold text-base-content">{data.file_count}</div>
            </div>
            <div>
              <span className="text-xs text-base-content/60">Free Space</span>
              <div className="text-xl font-bold text-success">{data.disk?.free || 0} GB</div>
            </div>
          </div>
        </div>
      </div>

      {/* Services + VPN */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="text-primary size-5" />
            <h3 className="text-base font-medium text-base-content flex-1">Services</h3>
            <button onClick={async () => {
              setShowAllServices(true);
              try { const r = await getServices(); setAllServices(r.services || []); } catch { setAllServices([]); }
            }}
              className="btn btn-ghost btn-xs">
              Show all
            </button>
          </div>
          {Object.entries(data.services).map(([name, running]) => {
            const isWatch = name.includes('watch');
            return (
              <div key={name} className={`flex justify-between py-2.5 border-b border-base-200 last:border-0 ${isWatch ? 'bg-warning/5 -mx-5 px-5' : ''}`}>
                <span className="flex items-center gap-2 text-sm text-base-content">
                  {name.replace('zdt-', '').replace('.py', '')}
                  {isWatch && (
                    <span className={`badge ${running ? 'badge-success' : 'badge-error'} text-[10px]`}>WATCH</span>
                  )}
                </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${running ? 'text-success' : 'text-error'}`}>
                  {running ? <><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Running</> : <><span className="w-1.5 h-1.5 rounded-full bg-error" /> Stopped</>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className={data.vpn?.connected ? 'text-success size-5' : 'text-error size-5'} />
            <h3 className="text-base font-medium text-base-content">VPN</h3>
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
          {data.ips && data.ips.length > 0 && (
            <div className="py-2.5 flex justify-between">
              <span className="text-sm text-base-content/60">Local IPs</span>
              <div className="text-right">
                {data.ips.map((ip: string) => (
                  <div key={ip} className="text-sm text-base-content font-mono">{ip}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dependencies */}
      <div className="card bg-base-100 border border-base-200 p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="text-primary size-5" />
          <h3 className="text-base font-medium text-base-content flex-1">Dependencies</h3>
          <div className="flex items-center gap-2">
            {installMsg && (
              <span className={`text-xs ${installMsg.includes('berhasil') ? 'text-success' : 'text-error'}`}>
                {installMsg}
              </span>
            )}
            <button
              onClick={handleInstall}
              disabled={installing}
              className="btn btn-primary btn-xs gap-1.5"
            >
              <Download size={14} /> {installing ? 'Installing...' : 'Install All'}
            </button>
            <button
              onClick={() => setDepsOpen(!depsOpen)}
              className="btn btn-ghost btn-xs"
            >
              {depsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
        {deps === null ? (
          <div className="text-sm text-base-content/60">Loading dependencies...</div>
        ) : (
          <>
            {(() => {
              const mainKeys = new Set(['ffmpeg', 'yt-dlp', 'spotdl', 'mutagen', 'syncedlyrics', 'demucs']);
              const filtered = deps.filter(d => mainKeys.has(d._key));
              const hidden = deps.filter(d => !mainKeys.has(d._key) && d._group !== 'core');
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {filtered.map(d => (
                      <div key={d._key} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                        d.installed ? 'bg-success/5 border-success/20' : 'bg-error/5 border-error/20'
                      }`}>
                        {d.installed
                          ? <CheckCircle size={16} className="text-success shrink-0" />
                          : <XCircle size={16} className="text-error shrink-0" />
                        }
                        <span className="text-sm text-base-content flex-1">{d._label}</span>
                        <span className={`text-xs font-mono ${d.installed ? 'text-success' : 'text-error'}`}>
                          {d.installed ? (d.version || 'installed') : 'missing'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {hidden.length > 0 && (
                    <>
                      {depsOpen && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                          {hidden.map(d => (
                            <div key={d._key} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                              d.installed ? 'bg-success/5 border-success/20' : 'bg-error/5 border-error/20'
                            }`}>
                              {d.installed
                                ? <CheckCircle size={16} className="text-success shrink-0" />
                                : <XCircle size={16} className="text-error shrink-0" />
                              }
                              <span className="text-sm text-base-content flex-1">{d._label}</span>
                              <span className={`text-xs font-mono ${d.installed ? 'text-success' : 'text-error'}`}>
                                {d.installed ? (d.version || 'installed') : 'missing'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setDepsOpen(!depsOpen)}
                        className="btn btn-ghost btn-xs w-full mt-2"
                      >
                        {depsOpen ? 'Hide ' + hidden.length + ' others' : 'Show all (' + (filtered.length + hidden.length) + ' deps)'}
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>

      {/* All Services Modal */}
      {showAllServices && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] animate-fadeIn" onClick={() => { setShowAllServices(false); setAllServices(null); }}>
          <div className="card bg-base-100 border border-base-200 w-[500px] max-w-[95vw] max-h-[85vh] shadow-md p-6 overflow-y-auto animate-scaleIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-base-content">All Services</h3>
              <button onClick={() => { setShowAllServices(false); setAllServices(null); }}
                className="btn btn-ghost btn-xs">
                <X size={16} />
              </button>
            </div>
            {allServices === null ? (
              <div className="text-center py-8 text-sm text-base-content/60">Loading...</div>
            ) : allServices.length === 0 ? (
              <div className="text-center py-8 text-sm text-base-content/60">No services found</div>
            ) : (
              <div className="space-y-2">
                {allServices.map(svc => (
                  <div key={svc.name} className={`flex justify-between items-center py-3 px-4 rounded-lg border ${svc.active === 'active' || svc.active === true ? 'border-success/20 bg-success/5' : 'border-base-200 bg-base-100'}`}>
                    <div>
                      <div className="text-sm font-medium text-base-content">{svc.label || svc.name.replace('zdt-', '')}</div>
                      <div className="text-[11px] text-base-content/60 font-mono mt-0.5">{svc.name}.service</div>
                    </div>
                    <span className={`text-xs font-medium ${svc.active === 'active' || svc.active === true ? 'text-success' : 'text-error'}`}>
                      {svc.active === 'active' || svc.active === true ? '● Running' : '○ Stopped'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 text-center">
              <span className="text-xs text-base-content/60">Manage services in <Link to="/settings?tab=services" className="text-primary hover:underline">Settings → Services</Link></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
