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

  if (error) return <div className="text-error-500 p-10 text-center">{error}</div>;

  if (!data) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl" />
              <div className="mt-5 space-y-2">
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-800 rounded" />
                <div className="h-8 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-transparent cursor-pointer"
          title="Refresh dashboard data"
        >
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6 hover:shadow-theme-md hover:border-brand-200 dark:hover:border-brand-500/30 transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <Cpu className="text-brand-500 size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">CPU Load</span>
              <h4 className="mt-2 font-bold text-gray-800 dark:text-white/90 text-[30px] leading-[38px]">{data.cpu.load_1m.toFixed(2)}</h4>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 dark:bg-success-500/10 px-2 py-0.5 text-xs font-medium text-success-600 dark:text-success-500">
              <ArrowUp className="size-3.5" /> 1m avg
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${Math.min(cpuAvg * 10, 100)}%` }} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">5m: {data.cpu.load_5m.toFixed(2)} · 15m: {data.cpu.load_15m.toFixed(2)}</p>
        </div>

        <div className="group rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6 hover:shadow-theme-md hover:border-warning-200 dark:hover:border-warning-500/30 transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl group-hover:scale-110 transition-transform">
            <Activity className="text-warning-500 size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">Memory</span>
              <h4 className="mt-2 font-bold text-gray-800 dark:text-white/90 text-[30px] leading-[38px]">{memUsed.toFixed(1)} <span className="text-base font-normal text-gray-500 dark:text-gray-400">/ {data.memory.total_gb} GB</span></h4>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 dark:bg-warning-500/10 px-2 py-0.5 text-xs font-medium text-warning-600 dark:text-warning-500">
              {memPct}% used
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mt-4 overflow-hidden">
            <div className="h-full rounded-full bg-warning-500 transition-all duration-500" style={{ width: `${memPct}%` }} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{data.memory.available_gb.toFixed(1)} GB available</p>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6 hover:shadow-theme-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <HardDrive className={`size-6 ${diskPct > 80 ? 'text-error-500' : diskPct > 50 ? 'text-warning-500' : 'text-success-500'}`} />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">Disk</span>
              <h4 className="mt-2 font-bold text-gray-800 dark:text-white/90 text-[30px] leading-[38px]">{data.disk?.used || 0} <span className="text-base font-normal text-gray-500 dark:text-gray-400">/ {data.disk?.total || 0} GB</span></h4>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              diskPct > 80 ? 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'
              : diskPct > 50 ? 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-500'
              : 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500'
            }`}>
              {diskPct}%
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mt-4 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${
              diskPct > 80 ? 'bg-error-500' : diskPct > 50 ? 'bg-warning-500' : 'bg-success-500'
            }`} style={{ width: `${diskPct}%` }} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{data.disk?.free || 0} GB free</p>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6 hover:shadow-theme-md transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <Clock className="text-brand-500 size-6" />
          </div>
          <div className="flex items-end justify-between mt-5">
            <div>
              <span className="text-sm text-gray-500 dark:text-gray-400">Uptime</span>
              <h4 className="mt-2 font-bold text-gray-800 dark:text-white/90 text-[30px] leading-[38px]">
                {Math.floor(data.uptime_hours / 24)}d {Math.floor(data.uptime_hours % 24)}h
              </h4>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">Python {data.python} · {data.arch}</p>
        </div>
      </div>

      {/* System Info + Storage */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 mb-4 flex items-center gap-2">
            <Server className="text-brand-500 size-5" /> System Info
          </h3>
          <div className="space-y-0">
            {[
              { label: 'Hostname', value: data.hostname },
              { label: 'Architecture', value: data.arch },
              { label: 'Python', value: data.python },
              { label: 'Version', value: data.version },
              { label: 'IP Addresses', value: data.ips?.join(', ') || 'N/A' },
            ].map(item => (
              <div key={item.label} className="flex justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <span className="text-sm text-gray-500 dark:text-gray-400">{item.label}</span>
                <span className="text-sm text-gray-800 dark:text-white/90 font-mono text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 mb-4 flex items-center gap-2">
            <Folder className="text-warning-500 size-5" /> Storage
          </h3>
          <div className="mb-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">Target Directory</span>
            <code className="block mt-1 text-sm font-mono text-gray-800 dark:text-white/90 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 break-all">
              {data.target_dir}
            </code>
          </div>
          <div className="flex gap-6">
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Files</span>
              <div className="text-xl font-bold text-gray-800 dark:text-white/90">{data.file_count}</div>
            </div>
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Free Space</span>
              <div className="text-xl font-bold text-success-600 dark:text-success-500">{data.disk?.free || 0} GB</div>
            </div>
          </div>
        </div>
      </div>

      {/* Services + VPN */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="text-brand-500 size-5" />
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90 flex-1">Services</h3>
            <button onClick={async () => {
              setShowAllServices(true);
              try { const r = await getServices(); setAllServices(r.services || []); } catch { setAllServices([]); }
            }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">
              Show all
            </button>
          </div>
          {Object.entries(data.services).map(([name, running]) => {
            const isWatch = name.includes('watch');
            return (
              <div key={name} className={`flex justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 ${isWatch ? 'bg-warning-50 dark:bg-warning-500/5 -mx-5 px-5' : ''}`}>
                <span className="flex items-center gap-2 text-sm text-gray-800 dark:text-white/90">
                  {name.replace('zdt-', '').replace('.py', '')}
                  {isWatch && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${running ? 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' : 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'}`}>WATCH</span>
                  )}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${running ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
                  {running ? <><span className="w-1.5 h-1.5 rounded-full bg-success-500 animate-pulse" /> Running</> : <><span className="w-1.5 h-1.5 rounded-full bg-error-500" /> Stopped</>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className={data.vpn?.connected ? 'text-success-500 size-5' : 'text-error-500 size-5'} />
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">VPN</h3>
          </div>
          <div className="py-2.5 border-b border-gray-100 dark:border-gray-800 flex justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Status</span>
            <span className={`text-sm font-semibold ${data.vpn?.connected ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
              {data.vpn?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {data.vpn.ip && (
            <div className="py-2.5 border-b border-gray-100 dark:border-gray-800 flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">VPN IP</span>
              <span className="text-sm text-gray-800 dark:text-white/90 font-mono">{data.vpn.ip}</span>
            </div>
          )}
          {data.ips && data.ips.length > 0 && (
            <div className="py-2.5 flex justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Local IPs</span>
              <div className="text-right">
                {data.ips.map((ip: string) => (
                  <div key={ip} className="text-sm text-gray-800 dark:text-white/90 font-mono">{ip}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dependencies */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package className="text-brand-500 size-5" />
          <h3 className="text-base font-medium text-gray-800 dark:text-white/90 flex-1">Dependencies</h3>
          <div className="flex items-center gap-2">
            {installMsg && (
              <span className={`text-xs ${installMsg.includes('berhasil') ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
                {installMsg}
              </span>
            )}
            <button
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              <Download size={14} /> {installing ? 'Installing...' : 'Install All'}
            </button>
            <button
              onClick={() => setDepsOpen(!depsOpen)}
              className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {depsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>
        {deps === null ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading dependencies...</div>
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
                        d.installed ? 'bg-success-50 dark:bg-success-500/5 border-success-200 dark:border-success-500/20' : 'bg-error-50 dark:bg-error-500/5 border-error-200 dark:border-error-500/20'
                      }`}>
                        {d.installed
                          ? <CheckCircle size={16} className="text-success-600 dark:text-success-500 shrink-0" />
                          : <XCircle size={16} className="text-error-600 dark:text-error-500 shrink-0" />
                        }
                        <span className="text-sm text-gray-800 dark:text-white/90 flex-1">{d._label}</span>
                        <span className={`text-xs font-mono ${d.installed ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
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
                              d.installed ? 'bg-success-50 dark:bg-success-500/5 border-success-200 dark:border-success-500/20' : 'bg-error-50 dark:bg-error-500/5 border-error-200 dark:border-error-500/20'
                            }`}>
                              {d.installed
                                ? <CheckCircle size={16} className="text-success-600 dark:text-success-500 shrink-0" />
                                : <XCircle size={16} className="text-error-600 dark:text-error-500 shrink-0" />
                              }
                              <span className="text-sm text-gray-800 dark:text-white/90 flex-1">{d._label}</span>
                              <span className={`text-xs font-mono ${d.installed ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
                                {d.installed ? (d.version || 'installed') : 'missing'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setDepsOpen(!depsOpen)}
                        className="mt-2 w-full text-center px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]" onClick={() => { setShowAllServices(false); setAllServices(null); }}>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 w-[500px] max-w-[95vw] max-h-[85vh] shadow-theme-md p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">All Services</h3>
              <button onClick={() => { setShowAllServices(false); setAllServices(null); }}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer">
                <X size={16} />
              </button>
            </div>
            {allServices === null ? (
              <div className="text-center py-8 text-sm text-gray-400">Loading...</div>
            ) : allServices.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">No services found</div>
            ) : (
              <div className="space-y-2">
                {allServices.map(svc => (
                  <div key={svc.name} className={`flex justify-between items-center py-3 px-4 rounded-lg border ${svc.active === 'active' || svc.active === true ? 'border-success-200 dark:border-success-500/20 bg-success-50 dark:bg-success-500/5' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-white/90">{svc.label || svc.name.replace('zdt-', '')}</div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">{svc.name}.service</div>
                    </div>
                    <span className={`text-xs font-medium ${svc.active === 'active' || svc.active === true ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}`}>
                      {svc.active === 'active' || svc.active === true ? '● Running' : '○ Stopped'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 text-center">
              <span className="text-xs text-gray-400">Manage services in <Link to="/settings?tab=services" className="text-brand-500 hover:underline">Settings → Services</Link></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
