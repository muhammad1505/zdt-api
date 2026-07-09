export interface Activity {
  id: number;
  endpoint: string;
  method: string;
  ip_address: string;
  status_code: number;
  created_at: string;
}

export function fmtTime(ts: string): string {
  // Normalize SQLite datetime format (space-separated) to ISO 8601 for Safari compatibility
  const normalized = ts.replace(' ', 'T') + (ts.includes('Z') || ts.includes('+') ? '' : 'Z');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function extractName(a: Activity): string {
  const parts = a.endpoint.split('/');
  const last = parts[parts.length - 1];
  if (last && !last.startsWith('api') && !['rename', 'config', 'test', 'status', 'install', 'upload', 'activity', 'logs', 'stream', 'password'].includes(last)) {
    return decodeURIComponent(last);
  }
  return '';
}

export function eventLabel(a: Activity): string {
  const ep = a.endpoint.toLowerCase();
  const ok = a.status_code < 400;
  const name = extractName(a);

  if (ep.includes('/api/upload')) return ok ? 'Upload berhasil' : 'Upload gagal';
  if (ep.includes('/api/files/rename')) return ok ? `File renamed${name ? ': ' + name : ''}` : 'File rename gagal';
  if (ep.includes('/api/files')) {
    if (a.method === 'DELETE') return ok ? `File dihapus: ${name || 'unknown'}` : `Gagal hapus file: ${name || 'unknown'}`;
    return ok ? `File diubah${name ? ': ' + name : ''}` : `Gagal ubah file${name ? ': ' + name : ''}`;
  }
  if (ep.includes('/api/download')) {
    if (a.method === 'POST') return ok ? (name ? `Download: ${name}` : 'Download ditambahkan') : 'Download gagal';
    return ok ? 'Download diperbarui' : 'Download error';
  }
  if (ep.includes('/api/settings') || ep.includes('/api/admin/config')) return ok ? 'Pengaturan berhasil diubah' : 'Gagal ubah pengaturan';
  if (ep.includes('/api/admin/users')) {
    if (a.method === 'POST') return ok ? (name ? `User ditambahkan: ${name}` : 'User baru') : 'Gagal tambah user';
    if (a.method === 'DELETE') return ok ? (name ? `User dihapus: ${name}` : 'User dihapus') : 'Gagal hapus user';
    return ok ? (name ? `User diupdate: ${name}` : 'User diupdate') : 'Gagal update user';
  }
  if (ep.includes('/api/profile/password')) return ok ? 'Password diganti' : 'Gagal ganti password';
  if (ep.includes('/api/profile')) return a.method === 'PUT' ? (ok ? 'Profile updated' : 'Gagal update profile') : (ok ? 'Profile dilihat' : 'Gagal lihat profile');
  if (ep.includes('/api/login')) return ok ? 'Login berhasil' : 'Login gagal';
  if (ep.includes('/api/admin/vpn')) {
    if (ep.includes('disconnect')) return ok ? 'VPN disconnected' : 'VPN disconnect gagal';
    if (ep.includes('connect')) return ok ? 'VPN connected' : 'VPN connect gagal';
    return ok ? 'VPN config berhasil' : 'VPN config gagal';
  }
  if (ep.includes('/api/admin/services')) {
    const svcName = extractName(a);
    return ok ? `Service ${svcName || ''} berhasil ${a.method === 'POST' ? 'diubah' : 'diperiksa'}` : `Service ${svcName || ''} gagal`;
  }
  if (ep.includes('/api/admin/system')) return ok ? 'System action berhasil' : 'System action gagal';
  if (ep.includes('/api/daemon')) return ok ? 'Daemon berhasil diatur' : 'Daemon gagal';
  if (ep.includes('/api/admin/dependencies')) return a.method === 'POST' ? (ok ? 'Dependencies installed' : 'Install dependencies gagal') : 'Dependencies OK';
  if (ep.includes('/api/admin/keys')) {
    if (a.method === 'POST') return ok ? (name ? `API key dibuat: ${name}` : 'API key baru') : 'Gagal buat API key';
    if (a.method === 'DELETE') return ok ? (name ? `API key dihapus: ${name}` : 'API key dihapus') : 'Gagal hapus API key';
    return ok ? (name ? `API key diubah: ${name}` : 'API key diubah') : 'Gagal ubah API key';
  }
  if (ep.includes('/api/settings/ai-keys')) return ok ? 'AI keys berhasil disimpan' : 'Gagal simpan AI keys';
  if (ep.includes('/api/notify')) return ok ? 'Notifikasi diubah' : 'Gagal ubah notifikasi';
  if (ep.includes('/api/tools')) return ok ? `Tool berhasil${name ? ': ' + name : ''}` : `Tool gagal${name ? ': ' + name : ''}`;
  return ok ? `${a.method} ${a.endpoint} berhasil` : `${a.method} ${a.endpoint} gagal (${a.status_code})`;
}

export function notifGroupKey(a: Activity): string {
  if (a.status_code >= 400) return 'errors';
  const ep = a.endpoint.toLowerCase();
  if (ep.includes('/api/download')) return 'downloads';
  if (ep.includes('/api/files') || ep.includes('/api/upload')) return 'files';
  if (ep.includes('/api/settings') || ep.includes('/api/admin/config')) return 'settings';
  if (ep.includes('/api/admin/users')) return 'users';
  if (ep.includes('/api/admin/vpn')) return 'vpn';
  if (ep.includes('/api/admin/services') || ep.includes('/api/admin/system')) return 'services';
  if (ep.includes('/api/tools')) return 'tools';
  if (ep.includes('/api/admin/keys') || ep.includes('/api/settings/ai-keys')) return 'keys';
  if (ep.includes('/api/login') || ep.includes('/api/profile')) return 'auth';
  return 'other';
}

export function notifGroupLabel(key: string): string {
  const labels: Record<string, string> = {
    errors: '⚠ Errors', downloads: 'Downloads', files: 'Files',
    settings: 'Settings', users: 'Users', vpn: 'VPN',
    services: 'Services', tools: 'Tools', keys: 'API Keys',
    auth: 'Auth', other: 'Other',
  };
  return labels[key] || 'Other';
}

export function notifGroupIcon(key: string): string {
  if (key === 'errors') return '🔴';
  if (key === 'downloads') return '⬇';
  if (key === 'files') return '📁';
  if (key === 'users') return '👤';
  if (key === 'vpn') return '🔒';
  if (key === 'services') return '⚙';
  if (key === 'keys') return '🔑';
  if (key === 'tools') return '🛠';
  if (key === 'auth') return '🔐';
  return '•';
}

export function isImportant(a: Activity): boolean {
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

export const CATEGORIES = [
  'errors', 'downloads', 'files', 'settings', 'users', 'vpn',
  'services', 'tools', 'keys', 'auth', 'other',
] as const;

export type NotifCategory = (typeof CATEGORIES)[number];

export const SOUND_PROFILES: Record<string, { freq: number; type: OscillatorType; duration: number; gain: number }> = {
  errors: { freq: 220, type: 'sawtooth', duration: 0.5, gain: 0.15 },
  downloads: { freq: 660, type: 'sine', duration: 0.35, gain: 0.1 },
  files: { freq: 880, type: 'sine', duration: 0.3, gain: 0.12 },
  settings: { freq: 520, type: 'triangle', duration: 0.3, gain: 0.1 },
  users: { freq: 440, type: 'triangle', duration: 0.3, gain: 0.1 },
  vpn: { freq: 550, type: 'triangle', duration: 0.3, gain: 0.1 },
  services: { freq: 600, type: 'sine', duration: 0.3, gain: 0.1 },
  keys: { freq: 770, type: 'sine', duration: 0.3, gain: 0.1 },
  auth: { freq: 700, type: 'sine', duration: 0.3, gain: 0.1 },
  tools: { freq: 500, type: 'triangle', duration: 0.35, gain: 0.1 },
  other: { freq: 660, type: 'sine', duration: 0.3, gain: 0.1 },
};

export const NOTIF_FILTERS = [
  { key: 'all', label: 'All', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  { key: 'errors', label: '⚠ Errors', color: 'bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-500' },
  { key: 'downloads', label: '⬇ Downloads', color: 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  { key: 'files', label: '📁 Files', color: 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' },
  { key: 'settings', label: '⚙ Settings', color: 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-500' },
  { key: 'users', label: '👤 Users', color: 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  { key: 'vpn', label: '🔒 VPN', color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  { key: 'services', label: '⚡ Services', color: 'bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-500' },
  { key: 'tools', label: '🛠 Tools', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
  { key: 'keys', label: '🔑 Keys', color: 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' },
  { key: 'auth', label: '🔐 Auth', color: 'bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-500' },
];

export function playCategorySound(category: string): void {
  try {
    const profile = SOUND_PROFILES[category] || SOUND_PROFILES.other;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = profile.freq;
    osc.type = profile.type;
    gain.gain.setValueAtTime(profile.gain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + profile.duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + profile.duration);
    // Clean up AudioContext to prevent memory leak
    osc.onended = () => ctx.close();
  } catch { /* Audio not supported */ }
}
