import { useState, useEffect } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardData } from '../types';
import { Cpu, HardDrive, Clock, Activity, Folder, Server, Globe, Monitor } from 'lucide-react';

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: '100%', height: 6, background: '#1F1F2C', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const d = await getDashboard();
        setData(d);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Gagal memuat dashboard');
      }
    };
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div style={{ color: '#FF003C', padding: 40, textAlign: 'center' }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6B6B80' }}>
        Loading dashboard...
      </div>
    );
  }

  const memUsed = data.memory.total_gb - data.memory.available_gb;
  const memPct = data.memory.total_gb > 0 ? Math.round((memUsed / data.memory.total_gb) * 100) : 0;
  const diskPct = data.disk && data.disk.total > 0
    ? Math.round((data.disk.used / data.disk.total) * 100) : 0;
  const cpuAvg = (data.cpu.load_1m + data.cpu.load_5m + data.cpu.load_15m) / 3;

  const card = { background: '#13131A', borderRadius: 12, padding: 20, border: '1px solid #2A2A3C', flex: 1, minWidth: 200 };
  const box = { background: '#13131A', borderRadius: 12, padding: 20, border: '1px solid #2A2A3C', flex: 1, minWidth: 300 };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24, color: '#E0E0FF' }}>
        Dashboard
        <span style={{ color: '#6B6B80', fontSize: 13, marginLeft: 12, fontWeight: 'normal' }}>
          v{data.version} · {data.hostname} · {data.arch}
        </span>
      </h2>

      {/* Row 1: System Stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Cpu color="#00F0FF" size={20} />
            <span style={{ color: '#6B6B80', fontSize: 13 }}>CPU Load</span>
          </div>
          <div style={{ color: '#E0E0FF', fontSize: 28, fontWeight: 'bold' }}>{data.cpu.load_1m.toFixed(2)}</div>
          <div style={{ color: '#6B6B80', fontSize: 12, marginTop: 4 }}>1m avg</div>
          <ProgressBar pct={Math.min(cpuAvg * 10, 100)} color="#00F0FF" />
          <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 4 }}>5m: {data.cpu.load_5m.toFixed(2)} · 15m: {data.cpu.load_15m.toFixed(2)}</div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Activity color="#FCE205" size={20} />
            <span style={{ color: '#6B6B80', fontSize: 13 }}>Memory</span>
          </div>
          <div style={{ color: '#E0E0FF', fontSize: 28, fontWeight: 'bold' }}>{memUsed.toFixed(1)} <span style={{ fontSize: 14, fontWeight: 'normal', color: '#6B6B80' }}>/ {data.memory.total_gb} GB</span></div>
          <ProgressBar pct={memPct} color="#FCE205" />
          <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 4 }}>{data.memory.available_gb.toFixed(1)} GB available · {memPct}% used</div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <HardDrive color="#FF003C" size={20} />
            <span style={{ color: '#6B6B80', fontSize: 13 }}>Disk</span>
          </div>
          <div style={{ color: '#E0E0FF', fontSize: 28, fontWeight: 'bold' }}>{data.disk?.used || 0} <span style={{ fontSize: 14, fontWeight: 'normal', color: '#6B6B80' }}>/ {data.disk?.total || 0} GB</span></div>
          <ProgressBar pct={diskPct} color={diskPct > 80 ? '#FF003C' : diskPct > 50 ? '#FCE205' : '#00FF88'} />
          <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 4 }}>{data.disk?.free || 0} GB free · {diskPct}% used</div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Clock color="#00F0FF" size={20} />
            <span style={{ color: '#6B6B80', fontSize: 13 }}>Uptime</span>
          </div>
          <div style={{ color: '#E0E0FF', fontSize: 28, fontWeight: 'bold' }}>
            {Math.floor(data.uptime_hours / 24)}d {Math.floor(data.uptime_hours % 24)}h
          </div>
          <div style={{ color: '#6B6B80', fontSize: 11, marginTop: 4 }}>
            Python {data.python} · {data.arch}
          </div>
        </div>
      </div>

      {/* Row 2: Info */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* System Info */}
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Monitor color="#00F0FF" size={20} />
            <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: 0 }}>System Info</h3>
          </div>
          {[
            { label: 'Hostname', value: data.hostname },
            { label: 'Architecture', value: data.arch },
            { label: 'Python', value: data.python },
            { label: 'Version', value: data.version },
            { label: 'IP Addresses', value: data.ips?.join(', ') || 'N/A' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1F1F2C', fontSize: 13 }}>
              <span style={{ color: '#6B6B80' }}>{item.label}</span>
              <span style={{ color: '#E0E0FF', fontFamily: 'monospace', textAlign: 'right' }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Target Dir */}
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Folder color="#FCE205" size={20} />
            <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: 0 }}>Storage</h3>
          </div>
          <div style={{ padding: '8px 0', fontSize: 13 }}>
            <div style={{ color: '#6B6B80', marginBottom: 4 }}>Target Directory</div>
            <code style={{ color: '#E0E0FF', fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', background: '#09090E', padding: '10px 12px', borderRadius: 8, border: '1px solid #2A2A3C', marginBottom: 12 }}>
              {data.target_dir}
            </code>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ color: '#6B6B80', fontSize: 11 }}>Files</div>
                <div style={{ color: '#E0E0FF', fontSize: 20, fontWeight: 'bold' }}>{data.file_count}</div>
              </div>
              <div>
                <div style={{ color: '#6B6B80', fontSize: 11 }}>Free Space</div>
                <div style={{ color: '#00FF88', fontSize: 20, fontWeight: 'bold' }}>{data.disk?.free || 0} GB</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Services + VPN */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Services */}
        <div style={{
          flex: 1, minWidth: 300, background: '#13131A', borderRadius: 12,
          padding: 20, border: '1px solid #2A2A3C'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Server color="#00F0FF" size={20} />
            <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: 0 }}>Services</h3>
          </div>
          {Object.entries(data.services).map(([name, running]) => (
            <div key={name} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid #1F1F2C'
            }}>
              <span style={{ color: '#E0E0FF', fontSize: 13 }}>
                {name.replace('zdt-', '').replace('.py', '')}
              </span>
              <span style={{
                color: running ? '#00F0FF' : '#FF003C', fontSize: 12
              }}>
                {running ? '● Running' : '○ Stopped'}
              </span>
            </div>
          ))}
        </div>

        {/* VPN */}
        <div style={{
          flex: 1, minWidth: 300, background: '#13131A', borderRadius: 12,
          padding: 20, border: '1px solid #2A2A3C'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Globe color={data.vpn?.connected ? '#00FF88' : '#FF003C'} size={20} />
            <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: 0 }}>VPN</h3>
          </div>
          <div style={{ padding: '10px 0', borderBottom: '1px solid #1F1F2C' }}>
            <span style={{ color: '#6B6B80', fontSize: 13 }}>Status</span>
            <span style={{ float: 'right', color: data.vpn?.connected ? '#00FF88' : '#FF003C', fontSize: 13, fontWeight: 'bold' }}>
              {data.vpn?.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {data.vpn.ip && (
            <div style={{ padding: '10px 0' }}>
              <span style={{ color: '#6B6B80', fontSize: 13 }}>VPN IP</span>
              <span style={{ float: 'right', color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>{data.vpn.ip}</span>
            </div>
          )}
          {data.ips && data.ips.length > 0 && (
            <div style={{ padding: '10px 0' }}>
              <span style={{ color: '#6B6B80', fontSize: 13 }}>Local IPs</span>
              <div style={{ float: 'right', textAlign: 'right' }}>
                {data.ips.map((ip: string) => (
                  <div key={ip} style={{ color: '#E0E0FF', fontSize: 13, fontFamily: 'monospace' }}>{ip}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
