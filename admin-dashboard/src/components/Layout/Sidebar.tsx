import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Key, Users, ScrollText, Folder,
  LogOut, Server, Wrench, Sliders
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/files', icon: Folder, label: 'Files' },
  { to: '/keys', icon: Key, label: 'API Keys' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/tools', icon: Wrench, label: 'Tools' },
  { to: '/settings', icon: Sliders, label: 'Settings' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
];

interface Props {
  username: string;
  onLogout: () => void;
}

export default function Sidebar({ username, onLogout }: Props) {
  return (
    <aside style={{
      width: 240, height: '100vh', background: '#13131A',
      borderRight: '1px solid #2A2A3C', display: 'flex',
      flexDirection: 'column', position: 'fixed', left: 0, top: 0
    }}>
      <div style={{ padding: '24px 20px', borderBottom: '1px solid #2A2A3C' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Server color="#00F0FF" size={24} />
          <div>
            <div style={{ color: '#00F0FF', fontWeight: 'bold', fontSize: 16 }}>ZDT API</div>
            <div style={{ color: '#6B6B80', fontSize: 11 }}>Admin Dashboard</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 8, marginBottom: 2,
              textDecoration: 'none', fontSize: 14,
              color: isActive ? '#00F0FF' : '#6B6B80',
              background: isActive ? '#1F1F2C' : 'transparent',
              transition: 'all 0.15s',
            })}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '12px 8px', borderTop: '1px solid #2A2A3C' }}>
        <div style={{ padding: '8px 14px', color: '#6B6B80', fontSize: 12 }}>
          {username}
        </div>
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '10px 14px', borderRadius: 8, border: 'none',
            background: 'transparent', color: '#FF003C', fontSize: 14,
            cursor: 'pointer'
          }}
        >
          <LogOut size={18} /> Logout
        </button>
      </div>
    </aside>
  );
}
