import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { RefreshCw, Cpu, HardDrive, MemoryStick as Memory, Activity } from 'lucide-react';

function fmtTime(t: string) {
  if (!t) return '';
  const d = new Date(t + 'Z');
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

const CHART_COLORS = {
  cpu: '#465fff',
  memory: '#12b76a',
  disk: '#f79009',
};

function MiniSparkline({ data, color, height = 40 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-full">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} className="opacity-80" />
    </svg>
  );
}

export default function MetricsPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);
  const [current, setCurrent] = useState<any>(null);

  const fetchMetrics = useCallback(async (h: number) => {
    try {
      const res = await api.get(`/api/admin/metrics/history?hours=${h}`);
      const data = res.data;
      setHistory(data.history || []);
      setCurrent(data.current || null);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchMetrics(hours); }, [hours, fetchMetrics]);

  const cpuData = history.map((h: any) => h.cpu_load || 0);
  const memData = history.map((h: any) => {
    if (!h.memory) return 0;
    return h.memory.percent || 0;
  });
  const diskData = history.map((h: any) => {
    if (!h.disk) return 0;
    return h.disk.percent || 0;
  });
  const labels = history.map((h: any) => fmtTime(h.timestamp));

  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Metrics History</h2>
          <p className="text-sm text-base-content/60 mt-1">CPU, memory, and disk usage over time</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={hours} onChange={e => { setLoading(true); setHours(Number(e.target.value)); }} className="select select-bordered select-sm text-xs">
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
          { icon: Cpu, label: 'CPU Load', value: current?.cpu_load != null ? `${current.cpu_load}%` : '-', avg: `${avg(cpuData)}%`, data: cpuData, color: CHART_COLORS.cpu },
          { icon: Memory, label: 'Memory', value: current?.memory ? `${current.memory.percent}%` : '-', avg: `${avg(memData)}%`, data: memData, color: CHART_COLORS.memory },
          { icon: HardDrive, label: 'Disk', value: current?.disk ? `${current.disk.percent}%` : '-', avg: `${avg(diskData)}%`, data: diskData, color: CHART_COLORS.disk },
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
            <div className="h-10">
              <MiniSparkline data={m.data} color={m.color} />
            </div>
            <div className="flex justify-between text-[10px] text-base-content/40 mt-1">
              <span>{labels[0] || ''}</span>
              <span>{labels[labels.length - 1] || ''}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-base-200">
          <h3 className="text-sm font-semibold text-base-content flex items-center gap-2">
            <Activity size={16} className="text-primary" />
            Raw Data ({history.length} data points)
          </h3>
        </div>
        {loading ? (
          <div className="animate-pulse p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-base-200 rounded" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            <Activity size={40} className="mx-auto mb-3 opacity-40" />
            No metrics data yet
          </div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50 sticky top-0">
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Time</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">CPU</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Memory</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase">Disk</th>
                </tr>
              </thead>
              <tbody>
                {history.slice().reverse().map((h: any, i: number) => (
                  <tr key={i} className="hover:bg-base-200/50 transition-colors">
                    <td className="text-xs text-base-content/60 whitespace-nowrap">{fmtTime(h.timestamp)}</td>
                    <td className="text-xs font-mono">{h.cpu_load != null ? `${h.cpu_load}%` : '-'}</td>
                    <td className="text-xs font-mono">{h.memory?.percent != null ? `${h.memory.percent}%` : '-'}</td>
                    <td className="text-xs font-mono">{h.disk?.percent != null ? `${h.disk.percent}%` : '-'}</td>
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
