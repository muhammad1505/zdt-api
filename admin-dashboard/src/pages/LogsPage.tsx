import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getActivityLogs, clearActivityLogs } from '../api/client';
import { RefreshCw, Trash2, Download, Search, ChevronDown } from 'lucide-react';
import { fmtTime } from '../utils/notifications';
import Swal from 'sweetalert2';

type LogFilter = 'all' | 'errors' | 'success';

const FILTERS: { key: LogFilter; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  { key: 'errors', label: '⚠ Errors', color: 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500' },
  { key: 'success', label: '✓ Success', color: 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' },
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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Activity Logs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track API requests and system activity</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer disabled:opacity-50">
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
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 text-sm hover:text-brand-500 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-700 transition-colors bg-transparent cursor-pointer"
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
                    background: '#ffffff',
                    color: '#1d2939',
                  });
                  if (!res.isConfirmed) return;
                  try {
                    await clearActivityLogs();
                    setLogs([]);
                    Swal.fire({ icon: 'success', title: 'Logs cleared', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, background: '#ffffff', color: '#1d2939' });
                  } catch {}
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 text-sm hover:text-error-500 dark:hover:text-error-400 hover:border-error-200 dark:hover:border-error-700 transition-colors bg-transparent cursor-pointer"
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
                  ? f.color + ' ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-gray-300 dark:ring-gray-600'
                  : 'text-gray-400 dark:text-gray-500 bg-transparent hover:text-gray-600 dark:hover:text-gray-400'
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
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search endpoint, method, IP..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-white/90 outline-none focus:border-brand-300 dark:focus:border-brand-700 transition-colors box-border"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer p-0 text-xs"
              >✕</button>
            )}
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? 'bg-success-500 animate-pulse' : 'bg-error-500'}`} />
            {liveConnected ? 'Live' : 'Disconnected'}
            <span className="text-gray-500">·</span>
            <span>{totalLogs} total</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            {/* Skeleton header */}
            <div className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              {[120, 70, 200, 60, 120].map((w, i) => (
                <div key={i} className="h-3 bg-gray-200 dark:bg-gray-700 rounded" style={{ width: w }} />
              ))}
            </div>
            {/* Skeleton rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: 120 }} />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: 70 }} />
                <div className="h-3 flex-1 bg-gray-100 dark:bg-gray-800 rounded" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: 60 }} />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded" style={{ width: 120 }} />
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
            {searchQuery ? 'No results matching your search' : filter === 'errors' ? 'No errors found' : filter === 'success' ? 'No successful requests found' : 'No activity yet'}
          </div>
        ) : (
          <div className="overflow-x-auto" ref={logsContainerRef}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Endpoint</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredLogs.map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                      <span className="text-gray-500 dark:text-gray-400 font-mono">{fmtTime(log.created_at)}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1.5 font-mono">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${
                        log.status_code >= 400 ? 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500' : 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      }`}>{log.method}</span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-gray-800 dark:text-white/90 font-mono">{log.endpoint}</td>
                    <td className={`py-2.5 px-4 text-right text-xs font-mono font-medium ${
                      log.status_code >= 400 ? 'text-error-600 dark:text-error-500' : 'text-success-600 dark:text-success-500'
                    }`}>{log.status_code}</td>
                    <td className="py-2.5 px-4 text-xs text-gray-400 dark:text-gray-500 font-mono">{log.ip_address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Load more button */}
            {filteredLogs.length >= 100 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-transparent cursor-pointer disabled:opacity-50"
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
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-brand-500 text-white shadow-lg hover:bg-brand-600 transition-all duration-200 border-none cursor-pointer flex items-center justify-center"
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
