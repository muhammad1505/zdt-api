import { useState, useEffect } from 'react';
import { getActivityLogs } from '../api/client';
import { RefreshCw } from 'lucide-react';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

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
    try { const data = await getActivityLogs(100); setLogs(data.logs || []); } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      getActivityLogs(10).then(data => {
        const newLogs = data.logs || [];
        if (newLogs.length > 0) {
          setLogs(prev => {
            const existingIds = new Set(prev.map((l: any) => l.id || l.created_at));
            const unique = newLogs.filter((l: any) => !existingIds.has(l.id || l.created_at));
            return [...unique, ...prev];
          });
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Activity Logs</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track API requests and system activity</p>
        </div>
        <button onClick={fetchLogs} disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer disabled:opacity-50">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            {/* Skeleton header */}
            <div className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              {[120, 70, 200, 60].map((w, i) => (
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
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">No activity yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Endpoint</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString()}
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
                  </tr>
                ))}
              </tbody>
            </table>
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
