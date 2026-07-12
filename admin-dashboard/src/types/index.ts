export interface User {
  id: number;
  username: string;
  role: string;
  label: string;
  active: number;
  created_at: string;
  last_login: string | null;
}

export interface ApiKey {
  id: number;
  key_id: string;
  label: string;
  host: string;
  port: number;
  role: string;
  active: number;
  expired_at: string | null;
  created_at: string;
  last_used: string | null;
}

export interface DashboardData {
  cpu: { load_1m: number; load_5m: number; load_15m: number };
  memory: { total_gb: number; available_gb: number };
  disk: { total: number; free: number; used: number };
  uptime_hours: number;
  services: Record<string, boolean>;
  vpn: { connected: boolean; ip: string; server: string };
  version: string;
  target_dir: string;
  file_count: number;
  hostname: string;
  arch: string;
  python: string;
  ips: string[];
}

export interface DependencyInfo {
  _key: string;
  _label: string;
  _group: string;
  installed: boolean;
  version: string | null;
  path?: string;
}

export interface KeyGenerateResponse {
  success: boolean;
  smart_key: string;
  key_id: string;
  label: string;
  host: string;
  port: number;
  role: string;
  expired_at: string | null;
}
