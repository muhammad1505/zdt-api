import { useState, useEffect, useMemo } from 'react';
import { getActivityLogs } from '../api/client';
import { RefreshCw, Bell, X } from 'lucide-react';
import type { Activity } from '../utils/notifications';
import { isImportant, notifGroupKey as notifCategory, NOTIF_FILTERS as FILTERS } from '../utils/notifications';

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
  return new Date(dateStr + 'Z').toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsPage() {
  const [logs, setLogs] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

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

  // Filter by category
  const filtered = useMemo(() => {
    if (activeFilter === 'all') return logs;
    return logs.filter(l => notifCategory(l) === activeFilter);
  }, [logs, activeFilter]);

  // Group by date
  const groups: Record<string, Activity[]> = {};
  for (const log of filtered) {
    const dateKey = fmtDate(log.created_at);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(log);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-base-content">Notifications</h2>
          <p className="text-sm text-base-content/60 mt-1">
            Important activities — errors and critical mutations
          </p>
        </div>
        <button onClick={fetch} disabled={loading}
          className="btn btn-ghost gap-2">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer border-none transition-all ${
              activeFilter === f.key
                ? f.color + ' ring-1 ring-base-300'
                : 'btn btn-ghost btn-sm'
            }`}
          >
            {f.label}
            {activeFilter === f.key && activeFilter !== 'all' && (
              <X size={10} className="opacity-60" />
            )}
          </button>
        ))}
      </div>

      <div className="card bg-base-100 border border-base-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-sm text-base-content/60">Loading...</div>
        ) : Object.keys(groups).length === 0 ? (
          <div className="text-center py-10 text-sm text-base-content/60">
            <Bell size={32} className="mx-auto mb-3 text-base-content/30" />
            {activeFilter === 'all' ? 'No important notifications yet' : 'No notifications in this category'}
          </div>
        ) : (
          <div>
            {Object.entries(groups).map(([dateKey, items]) => (
              <div key={dateKey}>
                {/* Date header */}
                <div className="px-5 py-2.5 bg-base-200/80 border-b border-base-200/50">
                  <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">
                    {dateKey} · {items.length} event{items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Items */}
                <div className="divide-y divide-base-200/50">
                  {items.map((log) => (
                    <div key={log.id} className="px-5 py-3 hover:bg-base-200/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                          log.status_code >= 400 ? 'bg-error' : 'bg-success'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                              log.status_code >= 400
                                ? 'badge badge-error'
                                : 'badge badge-primary'
                            }`}>
                              {log.method}
                            </span>
                            <span className={`text-xs font-mono font-medium ${
                              log.status_code >= 400 ? 'text-error' : 'text-success'
                            }`}>
                              {log.status_code}
                            </span>
                            <span className="text-[10px] text-base-content/60 ml-auto">{fmtTime(log.created_at)}</span>
                          </div>
                          <p className="text-xs text-base-content font-mono break-all">
                            {log.endpoint}
                          </p>
                          {log.ip_address && (
                            <p className="text-[10px] text-base-content/60 mt-0.5">{log.ip_address}</p>
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
