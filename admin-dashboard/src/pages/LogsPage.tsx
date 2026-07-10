import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getActivityLogs, clearActivityLogs } from '../api/client';
import { RefreshCw, Trash2, Download, Search, ChevronDown } from 'lucide-react';
import { fmtTime } from '../utils/notifications';
import Swal from 'sweetalert2';

type LogFilter = 'all' | 'errors' | 'success';

const FILTERS: { key: LogFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'badge badge-ghost' },
  { key: 'errors', label: '⚠ Errors', color: 'badge badge-error' },
  { key: 'success', label: '✓ Success', color: 'badge badge-success' },
];

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit, setLimit] = useState(100);
  const [totalLogs, setTotalLogs] = useState(0);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Filtered logs: combine status filter + search filter
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter === 'errors') result = result.filter(l => l.status_code >= 400);
    else if (filter === 'success') result = result.filter(l => l.status_code < 400);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        l.endpoint?.toLowerCase().includes(q) ||
        l.method?.toLowerCase().includes(q) ||
        String(l.status_code).includes(q) ||
        l.ip_address?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, filter, searchQuery]);

  // Track scroll position for "Go to top" button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs(limit);
      setLogs(data.logs || []);
      setTotalLogs(data.total || data.logs?.length || 0);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [limit]);

  const loadMore = async () => {
    setLoadingMore(true);
    const newLimit = limit + 100;
    try {
      const data = await getActivityLogs(newLimit);
      setLogs(data.logs || []);
      setTotalLogs(data.total || data.logs?.length || 0);
      setLimit(newLimit);
    } catch {}
    setLoadingMore(false);
  };

  // Real-time polling: 5s interval, pauses when tab is hidden
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setLiveConnected(true);
    pollRef.current = setInterval(() => {
      if (document.hidden) return;
      getActivityLogs(10).then(data => {
        const newLogs = data.logs || [];
        if (newLogs.length > 0) {
          let uniqueCount = 0;
          setLogs(prev => {
            const existingIds = new Set(prev.map((l: any) => l.id || l.created_at));
            const unique = newLogs.filter((l: any) => !existingIds.has(l.id || l.created_at));
            uniqueCount = unique.length;
            return [...unique, ...prev];
          });
          setTotalLogs(prev => prev + uniqueCount);
        }
      }).catch(() => {
        setLiveConnected(false);
      });
    }, 5000);
  }, []);

  useEffect(() => {
    startPolling();
    const handleVis = () => {
      if (!document.hidden) {
        setLiveConnected(true);
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [startPolling]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Activity Logs</h2>
          <p className="text-sm text-base-content/60 mt-1">Track API requests and system activity</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} disabled={loading}
            className="btn btn-ghost gap-2">
            <RefreshCw size={16} /> Refresh
          </button>
          {!loading && logs.length > 0 && (
            <>
              <button
                onClick={() => {
                  // Export as CSV
                  const headers = ['Time', 'Relative', 'Method', 'Endpoint', 'Status', 'IP Address'];
                  const rows = logs.map((l: any) => [
                    new Date(l.created_at).toISOString(),
                    fmtTime(l.created_at),
                    l.method,
                    l.endpoint,
                    l.status_code,
                    l.ip_address || '-'
                  ]);
                  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `zdt-logs-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="btn btn-ghost btn-sm gap-1.5"
                title="Export as CSV"
              >
                <Download size={14} />
                <span className="hidden sm:inline text-xs">Export</span>
              </button>
              <button
                onClick={async () => {
                  const res = await Swal.fire({
                    title: 'Clear all logs?',
                    text: 'This action cannot be undone',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#f04438',
                    cancelButtonColor: '#667085',
                    confirmButtonText: 'Clear',
                    background: 'var(--b1)',
                    color: '#1d2939',
                  });
                  if (!res.isConfirmed) return;
                  try {
                    await clearActivityLogs();
                    setLogs([]);
                    Swal.fire({ icon: 'success', title: 'Logs cleared', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, background: 'var(--b1)', color: 'var(--bc)' });
                  } catch {}
                }}
                className="btn btn-ghost btn-sm gap-1.5"
                title="Clear all activity logs"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline text-xs">Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter chips + Search + Live indicator */}
      {!loading && logs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border-none transition-all ${
                filter === f.key
                  ? f.color
                  : 'btn btn-ghost btn-sm'
              }`}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({logs.filter(l => f.key === 'errors' ? l.status_code >= 400 : l.status_code < 400).length})
                </span>
              )}
            </button>
          ))}
          {/* Search input */}
          <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/60 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search endpoint, method, IP..."
              className="input input-bordered w-full pl-8 pr-3 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/60 hover:text-base-content bg-transparent border-none cursor-pointer p-0 text-xs"
              >✕</button>
            )}
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-[10px] text-base-content/60">
            <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? 'bg-success animate-pulse' : 'bg-error'}`} />
            {liveConnected ? 'Live' : 'Disconnected'}
            <span className="text-base-content/60">·</span>
            <span>{totalLogs} total</span>
          </div>
        </div>
      )}

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            {/* Skeleton header */}
            <div className="flex gap-4 px-4 py-3 border-b border-base-200/50 bg-base-200/50">
              {[120, 70, 200, 60, 120].map((w, i) => (
                <div key={i} className="h-3 bg-base-300 rounded" style={{ width: w }} />
              ))}
            </div>
            {/* Skeleton rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-base-200/50">
                <div className="h-3 bg-base-200 rounded" style={{ width: 120 }} />
                <div className="h-3 bg-base-200 rounded" style={{ width: 70 }} />
                <div className="h-3 flex-1 bg-base-200 rounded" />
                <div className="h-3 bg-base-200 rounded" style={{ width: 60 }} />
                <div className="h-3 bg-base-200 rounded" style={{ width: 120 }} />
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            {searchQuery ? 'No results matching your search' : filter === 'errors' ? 'No errors found' : filter === 'success' ? 'No successful requests found' : 'No activity yet'}
          </div>
        ) : (
          <div className="overflow-x-auto" ref={logsContainerRef}>
            <table className="table w-full">
              <thead>
                <tr className="bg-base-200/50">
                  <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Time</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Method</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Endpoint</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider text-right">Status</th>
                  <th className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">IP Address</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-base-200/50 transition-colors">
                    <td className="text-xs whitespace-nowrap">
                      <span className="text-base-content/60 font-mono">{fmtTime(log.created_at)}</span>
                      <span className="text-[10px] text-base-content/60 ml-1.5 font-mono">{new Date(log.created_at + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td>
                      <span className={`badge badge-sm font-mono ${
                        log.status_code >= 400 ? 'badge-error' : 'badge-primary'
                      }`}>{log.method}</span>
                    </td>
                    <td className="text-xs text-base-content font-mono">{log.endpoint}</td>
                    <td className={`text-right text-xs font-mono font-medium ${
                      log.status_code >= 400 ? 'text-error' : 'text-success'
                    }`}>{log.status_code}</td>
                    <td className="text-xs text-base-content/60 font-mono">{log.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Load more button */}
            {filteredLogs.length >= 100 && (
              <div className="px-4 py-3 border-t border-base-200/50 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn btn-ghost gap-1.5 text-xs"
                >
                  <ChevronDown size={14} />
                  {loadingMore ? 'Loading...' : `Load more (showing ${filteredLogs.length} of ${totalLogs})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Scroll to top button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="btn btn-primary btn-circle fixed bottom-6 right-6 z-50 shadow-lg"
          title="Go to top"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
    </div>
  );
}
