import { useState, useEffect } from 'react';
import { getDashboard } from '../api/client';
import type { DashboardData } from '../types';
import { Cpu, HardDrive, Wifi, Clock, Activity } from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div style={{
      background: '#13131A', borderRadius: 12, padding: 20,
      border: '1px solid #2A2A3C', flex: 1, minWidth: 200
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ padding: 8, borderRadius: 8, background: '#1F1F2C' }}>
          <Icon color={color || '#00F0FF'} size={20} />
        </div>
        <span style={{ color: '#6B6B80', fontSize: 13 }}>{label}</span>
      </div>
      <div style={{ color: '#E0E0FF', fontSize: 28, fontWeight: 'bold' }}>{value}</div>
      {sub && <div style={{ color: '#6B6B80', fontSize: 12, marginTop: 4 }}>{sub}</div>}
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
  const diskUsedPercent = data.disk.total > 0
    ? Math.round((data.disk.used / data.disk.total) * 100) : 0;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 24, color: '#E0E0FF' }}>
        Dashboard
        <span style={{ color: '#6B6B80', fontSize: 13, marginLeft: 12, fontWeight: 'normal' }}>
          v{data.version}
        </span>
      </h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard
          icon={Cpu} label="CPU Load" value={data.cpu.load_1m.toFixed(2)}
          sub={`5m: ${data.cpu.load_5m.toFixed(2)} · 15m: ${data.cpu.load_15m.toFixed(2)}`}
          color="#00F0FF"
        />
        <StatCard
          icon={Activity} label="Memory"
          value={`${memUsed.toFixed(1)} / ${data.memory.total_gb} GB`}
          sub={`${data.memory.available_gb.toFixed(1)} GB available`}
          color="#FCE205"
        />
        <StatCard
          icon={HardDrive} label="Disk"
          value={`${data.disk.used} / ${data.disk.total} GB`}
          sub={`${diskUsedPercent}% used · ${data.disk.free} GB free`}
          color="#FF003C"
        />
        <StatCard
          icon={Clock} label="Uptime"
          value={`${Math.floor(data.uptime_hours / 24)}d ${Math.floor(data.uptime_hours % 24)}h`}
          color="#00F0FF"
        />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Services */}
        <div style={{
          flex: 1, minWidth: 300, background: '#13131A', borderRadius: 12,
          padding: 20, border: '1px solid #2A2A3C'
        }}>
          <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: '0 0 16px' }}>Services</h3>
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
            <Wifi color={data.vpn.connected ? '#00F0FF' : '#FF003C'} size={20} />
            <h3 style={{ color: '#E0E0FF', fontSize: 14, margin: 0 }}>VPN Connection</h3>
          </div>
          <div style={{
            padding: '10px 0', borderBottom: '1px solid #1F1F2C'
          }}>
            <span style={{ color: '#6B6B80', fontSize: 13 }}>Status</span>
            <span style={{
              float: 'right',
              color: data.vpn.connected ? '#00F0FF' : '#FF003C', fontSize: 13
            }}>
              {data.vpn.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {data.vpn.ip && (
            <div style={{ padding: '10px 0' }}>
              <span style={{ color: '#6B6B80', fontSize: 13 }}>IP</span>
              <span style={{ float: 'right', color: '#E0E0FF', fontSize: 13 }}>
                {data.vpn.ip}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
