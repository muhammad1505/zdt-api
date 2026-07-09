import { useState, useEffect } from 'react';
import { getActivityLogs } from '../api/client';
import { RefreshCw, Bell } from 'lucide-react';

interface Activity {
  id: number;
  endpoint: string;
  method: string;
  ip_address: string;
  status_code: number;
  created_at: string;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dDate.getTime() === today.getTime()) return 'Today';
  if (dDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function isImportant(a: Activity): boolean {
  if (a.status_code >= 400) return true;
  const ep = a.endpoint.toLowerCase();
  const method = a.method.toUpperCase();
  if (!['POST', 'PUT', 'DELETE'].includes(method)) return false;
  const critical = ['/api/files', '/api/upload', '/api/settings', '/api/admin/config',
    '/api/download', '/api/admin/users', '/api/login', '/api/profile', '/api/admin/vpn',
    '/api/admin/services', '/api/admin/system', '/api/daemon', '/api/admin/dependencies',
    '/api/tools', '/api/admin/keys', '/api/settings/ai-keys', '/api/notify'];
  return critical.some(c => ep.includes(c));
}

export default function NotificationsPage() {
  const [logs, setLogs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs(200);
      const items: Activity[] = (data.logs || []).filter(isImportant);
      setLogs(items);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // Group by date
  const groups: Record<string, Activity[]> = {};
  for (const log of logs) {
    const dateKey = fmtDate(log.created_at);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(log);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Notifications</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Important activities — errors and critical mutations
          </p>
        </div>
        <button onClick={fetch} disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors bg-transparent cursor-pointer disabled:opacity-50">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">Loading...</div>
        ) : Object.keys(groups).length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
            <Bell size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            No important notifications yet
          </div>
        ) : (
          <div>
            {Object.entries(groups).map(([dateKey, items]) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="px-5 py-2.5 bg-gray-50/80 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800/50">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {dateKey} · {items.length} event{items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Items */}
                <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {items.map((log) => (
                    <div key={log.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                          log.status_code >= 400 ? 'bg-error-500' : 'bg-success-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              log.status_code >= 400
                                ? 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500'
                                : 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                            }`}>
                              {log.method}
                            </span>
                            <span className={`text-xs font-mono font-medium ${
                              log.status_code >= 400 ? 'text-error-600 dark:text-error-500' : 'text-success-600 dark:text-success-500'
                            }`}>
                              {log.status_code}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-auto">{fmtTime(log.created_at)}</span>
                          </div>
                          <p className="text-xs text-gray-800 dark:text-white/90 font-mono break-all">
                            {log.endpoint}
                          </p>
                          {log.ip_address && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{log.ip_address}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
