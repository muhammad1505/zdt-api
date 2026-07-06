import { useState, useEffect } from 'react';
import { getActivityLogs } from '../api/client';
import { ScrollText, RefreshCw } from 'lucide-react';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs(100);
      setLogs(data.logs || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  // Auto-refresh every 10 seconds
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0, color: '#E0E0FF' }}>
          <ScrollText size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Activity Logs
        </h2>
        <button onClick={fetchLogs} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#1F1F2C', color: '#6B6B80', border: '1px solid #2A2A3C', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{
        background: '#0a0a0f', borderRadius: 12, border: '1px solid #2A2A3C',
        fontFamily: 'monospace', fontSize: 12, maxHeight: 600, overflow: 'auto', padding: 16
      }}>
        {loading ? (
          <div style={{ color: '#6B6B80', textAlign: 'center', padding: 20 }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ color: '#6B6B80', textAlign: 'center', padding: 20 }}>No activity yet</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '4px 0',
              borderBottom: '1px solid #1a1a2a'
            }}>
              <span style={{ color: '#6B6B80', minWidth: 80 }}>
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span style={{
                color: log.status_code >= 400 ? '#FF003C' : '#00F0FF',
                minWidth: 40
              }}>
                {log.method}
              </span>
              <span style={{ color: log.status_code >= 400 ? '#FF003C' : '#E0E0FF', flex: 1 }}>
                {log.endpoint}
              </span>
              <span style={{ color: log.status_code >= 400 ? '#FF003C' : '#6B6B80', minWidth: 30 }}>
                {log.status_code}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
