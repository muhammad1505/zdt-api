import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { RefreshCw, Cpu, HardDrive, MemoryStick as Memory, Activity } from 'lucide-react';

function pct(val: number) { return val != null ? val.toFixed(1) + '%' : '-'; }

function fmtTime(t: string) {
  if (!t) return '';
  const d = new Date(t + 'Z');
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

const COLORS = { cpu: '#465fff', memory: '#12b76a', disk: '#f79009' };

function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1); const min = Math.min(...data, 0); const range = max - min || 1;
  const w = 100;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-full">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} className="opacity-80" />
    </svg>
  );
}

function avg(arr: number[]) { return arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '0'; }

export default function MetricsPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  const fetchMetrics = useCallback(async (h: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/metrics/history?hours=${h}`);
      setHistory(res.data.metrics || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchMetrics(hours); }, [hours, fetchMetrics]);

  const latest = history[history.length - 1] || {};
  const cpuData = history.map(h => h.cpu_load_1m ?? 0);
  const memPct = history.map(h => {
    if (!h.mem_total_gb) return 0;
    const used = h.mem_total_gb - (h.mem_available_gb ?? 0);
    return (used / h.mem_total_gb) * 100;
  });
  const diskPct = history.map(h => {
    if (!h.disk_total_gb) return 0;
    return ((h.disk_used_gb ?? 0) / h.disk_total_gb) * 100;
  });
  const labels = history.map(h => fmtTime(h.timestamp));

  const latestMemPct = latest.mem_total_gb
    ? (((latest.mem_total_gb - (latest.mem_available_gb ?? 0)) / latest.mem_total_gb) * 100).toFixed(1)
    : '-';
  const latestDiskPct = latest.disk_total_gb
    ? (((latest.disk_used_gb ?? 0) / latest.disk_total_gb) * 100).toFixed(1)
    : '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Metrics History</h2>
          <p className="text-sm text-base-content/60 mt-1">CPU, memory, and disk usage over time</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="select select-bordered select-sm text-xs">
            <option value={1}>Last hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          <button onClick={() => fetchMetrics(hours)} className="btn btn-ghost btn-sm gap-1">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Cpu, label: 'CPU Load', value: latest.cpu_load_1m != null ? `${latest.cpu_load_1m}%` : '-', avg: `${avg(cpuData)}%`, data: cpuData, color: COLORS.cpu },
          { icon: Memory, label: 'Memory', value: `${latestMemPct}%`, avg: `${avg(memPct)}%`, data: memPct, color: COLORS.memory },
          { icon: HardDrive, label: 'Disk', value: `${latestDiskPct}%`, avg: `${avg(diskPct)}%`, data: diskPct, color: COLORS.disk },
        ].map(m => (
          <div key={m.label} className="card bg-base-100 border border-base-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <m.icon size={18} style={{ color: m.color }} />
                <span className="text-sm font-medium text-base-content">{m.label}</span>
              </div>
              <span className="text-xs text-base-content/60">{m.avg} avg</span>
            </div>
            <div className="text-2xl font-bold text-base-content mb-1">{m.value}</div>
            <div className="h-10"><MiniSparkline data={m.data} color={m.color} /></div>
            <div className="flex justify-between text-[10px] text-base-content/40 mt-1">
              <span>{labels[0] || ''}</span><span>{labels[labels.length - 1] || ''}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-base-200">
          <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
            <Activity size={16} className="text-primary" /> Raw Data ({history.length} data points)
          </h3>
        </div>
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-base-200 rounded" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            <Activity size={40} className="mx-auto mb-3 opacity-40" />
            No metrics data yet. Data dikumpulkan tiap 60 detik.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50 sticky top-0">
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Time</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">CPU</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Mem Used</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Mem Total</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Disk Used</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Disk Total</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((h: any, i: number) => (
                  <tr key={i} className="hover:bg-base-200/50 transition-colors">
                    <td className="text-xs text-base-content/60 whitespace-nowrap">{fmtTime(h.timestamp)}</td>
                    <td className="text-xs font-mono">{pct(h.cpu_load_1m)}</td>
                    <td className="text-xs font-mono">{h.mem_total_gb ? `${(h.mem_total_gb - (h.mem_available_gb ?? 0)).toFixed(1)} GB` : '-'}</td>
                    <td className="text-xs font-mono">{h.mem_total_gb ? `${h.mem_total_gb} GB` : '-'}</td>
                    <td className="text-xs font-mono">{h.disk_used_gb ? `${h.disk_used_gb} GB` : '-'}</td>
                    <td className="text-xs font-mono">{h.disk_total_gb ? `${h.disk_total_gb} GB` : '-'}</td>
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
