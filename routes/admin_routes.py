from flask import Blueprint, request, jsonify, g
import os
import shutil
import subprocess
import hashlib
import logging
import importlib.util
import signal
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from werkzeug.security import generate_password_hash

from auth import requires_admin
from database import (
    get_all_api_keys, generate_api_key, revoke_api_key, delete_api_key,
    get_all_users, create_user, delete_user,
    get_activity_logs, get_smart_api_key_string, get_connection,
    log_vpn_event
)
from config import config

logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__)


# === API KEY MANAGEMENT ===

@admin_bp.route('/api/admin/keys', methods=['GET'])
@requires_admin
def list_keys():
    keys = get_all_api_keys()
    for k in keys:
        k.pop('secret', None)
    return jsonify({'keys': keys})


@admin_bp.route('/api/admin/keys', methods=['POST'])
@requires_admin
def create_key():
    try:
        data = request.get_json(silent=True) or {}
        host = data.get('host', 'localhost')
        port = int(data.get('port', 2000))
        label = data.get('label', '')
        role = data.get('role', 'full')
        expired_days = int(data.get('expired_days', 0))
        
        if not host:
            return jsonify({'error': 'Host is required'}), 400
        
        user_id = g.user.get('user_id', 0) if hasattr(g, 'user') else 0
        
        key_id, secret = generate_api_key(host, port, label, role, expired_days, user_id)
        
        # Get expired_at from database
        conn = get_connection()
        row = conn.execute('SELECT * FROM api_keys WHERE key_id = ?', (key_id,)).fetchone()
        expired_at = dict(row)['expired_at'] if row else None
        
        # Generate Smart API Key
        smart_key = get_smart_api_key_string(key_id, secret, host, port, label, role, expired_at)
        
        return jsonify({
            'success': True,
            'smart_key': smart_key,
            'key_id': key_id,
            'label': label,
            'host': host,
            'port': port,
            'role': role,
            'expired_at': expired_at
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/keys/<key_id>', methods=['DELETE'])
@requires_admin
def delete_key(key_id):
    hard = request.args.get('hard', '').lower() == 'true'
    if hard:
        delete_api_key(key_id)
        return jsonify({'success': True, 'message': 'API Key permanently deleted'})
    revoke_api_key(key_id)
    return jsonify({'success': True, 'message': 'API Key revoked'})


# === USER MANAGEMENT ===

@admin_bp.route('/api/admin/users', methods=['GET'])
@requires_admin
def list_users():
    users = get_all_users()
    return jsonify({'users': users})


@admin_bp.route('/api/admin/users', methods=['POST'])
@requires_admin
def add_user():
    try:
        data = request.get_json(silent=True) or {}
        username = data.get('username', '')
        password = data.get('password', '')
        role = data.get('role', 'operator')
        label = data.get('label', '')
        
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        if len(password) < 4:
            return jsonify({'error': 'Password must be at least 4 characters'}), 400
        
        user_id = create_user(username, password, role, label)
        return jsonify({'success': True, 'user_id': user_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@requires_admin
def update_user(user_id):
    """Update user fields (username, password, role, label, active)."""
    try:
        data = request.get_json(silent=True) or {}
        updates = []
        params = []
        
        if 'username' in data and data['username']:
            updates.append('username = ?')
            params.append(data['username'].strip())
        if 'role' in data and data['role']:
            if data['role'] not in ['admin', 'operator', 'full']:
                return jsonify({'error': 'Role harus admin, operator, atau full'}), 400
            updates.append('role = ?')
            params.append(data['role'].strip())
        if 'label' in data:
            updates.append('label = ?')
            params.append(data['label'].strip())
        if 'active' in data:
            updates.append('active = ?')
            params.append(1 if data['active'] else 0)
        if 'password' in data and data['password']:
            if len(data['password']) < 4:
                return jsonify({'error': 'Password minimal 4 karakter'}), 400
            pw_hash = generate_password_hash(data['password'])
            updates.append('password_hash = ?')
            params.append(pw_hash)
        
        if not updates:
            return jsonify({'error': 'Tidak ada field yang diupdate'}), 400
        
        conn = get_connection()
        params.append(user_id)
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        return jsonify({'success': True, 'message': 'User updated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@requires_admin
def remove_user(user_id):
    delete_user(user_id)
    return jsonify({'success': True})


# === SYSTEM ===

# Cache for file count (refresh every 30s)
_file_count_cache = {'count': 0, 'ts': 0}
_FILE_COUNT_TTL = 30

def _count_cached(target_dir):
    global _file_count_cache
    now = time.time()
    if now - _file_count_cache['ts'] < _FILE_COUNT_TTL:
        return _file_count_cache['count']
    media_exts = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}
    count = 0
    try:
        if os.path.exists(target_dir):
            for root, _, files in os.walk(target_dir):
                for f in files:
                    if os.path.splitext(f)[1].lower() in media_exts:
                        count += 1
    except Exception:
        pass
    _file_count_cache = {'count': count, 'ts': now}
    return count

def _subproc(cmd, timeout=2):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except Exception:
        return None

@admin_bp.route('/api/admin/dashboard', methods=['GET'])
@requires_admin
def admin_dashboard():
    try:
        cpu = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
        
        mem = {}
        try:
            with open('/proc/meminfo') as f:
                for line in f:
                    if 'MemTotal' in line:
                        mem['total'] = round(int(line.split()[1]) / 1024 / 1024, 1)
                    elif 'MemAvailable' in line:
                        mem['available'] = round(int(line.split()[1]) / 1024 / 1024, 1)
        except Exception as e:
            logger.warning(f"Failed to read meminfo: {e}")
        
        target_dir = config.get_target_dir()
        disk = {'total': 0, 'free': 0, 'used': 0}
        try:
            if target_dir and os.path.exists(target_dir):
                stat = os.statvfs(target_dir)
                disk['total'] = round(stat.f_blocks * stat.f_frsize / (1024**3), 1)
                disk['free'] = round(stat.f_bavail * stat.f_frsize / (1024**3), 1)
                disk['used'] = round(disk['total'] - disk['free'], 1)
            else:
                disk['note'] = 'Target directory not found'
        except Exception as e:
            disk['note'] = f'Disk error: {str(e)}'
        
        uptime = 0
        try:
            with open('/proc/uptime') as f:
                uptime = round(float(f.read().split()[0]) / 3600, 1)
        except Exception as e:
            logger.warning(f"Failed to read uptime: {e}")
        
        # Parallel subprocess calls (timeout 2s each)
        net = {}
        services = {}
        all_ips = []
        svc_names = ['zdt-watch.py', 'zdt-telegram.py', 'zdt-scheduler.py']
        
        with ThreadPoolExecutor(max_workers=4) as pool:
            fut_vpn = pool.submit(_subproc, ['ip', '-4', 'addr', 'show', 'ppp0'])
            fut_ips = pool.submit(_subproc, ['ip', '-4', 'addr', 'show'])
            fut_services = {s: pool.submit(_subproc, ['pgrep', '-f', s]) for s in svc_names}
            
            for s, fut in fut_services.items():
                r = fut.result()
                services[s.replace('.py', '')] = r is not None and r.returncode == 0
            
            r = fut_vpn.result()
            if r and r.returncode == 0:
                for line in r.stdout.split('\n'):
                    if 'inet ' in line:
                        net['vpn_ip'] = line.strip().split()[1]
            
            r = fut_ips.result()
            if r and r.returncode == 0:
                for line in r.stdout.split('\n'):
                    parts = line.strip().split()
                    if 'inet' in parts:
                        idx = parts.index('inet')
                        ip = parts[idx + 1].split('/')[0]
                        if ip != '127.0.0.1':
                            all_ips.append(ip)
        
        if not all_ips:
            all_ips.append('N/A')
        
        file_count = _count_cached(target_dir)
        
        import platform as _platform
        hostname = _platform.node()
        arch = _platform.machine()
        pyver = _platform.python_version()
        
        return jsonify({
            'cpu': {'load_1m': cpu[0], 'load_5m': cpu[1], 'load_15m': cpu[2]},
            'memory': {'total_gb': mem.get('total', 0), 'available_gb': mem.get('available', 0)},
            'disk': disk,
            'uptime_hours': uptime,
            'services': services,
            'vpn': {'connected': 'vpn_ip' in net, 'ip': net.get('vpn_ip', '')},
            'version': config.get_version(),
            'target_dir': target_dir,
            'file_count': file_count,
            'hostname': hostname,
            'arch': arch,
            'python': pyver,
            'ips': all_ips,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/config', methods=['GET'])
@requires_admin
def get_config():
    config_path = config.config_path
    result = {}
    if config_path and os.path.exists(config_path):
        with open(config_path) as f:
            for line in f:
                line = line.strip()
                if line and '=' in line:
                    key, val = line.split('=', 1)
                    if any(k in key.upper() for k in ['PASS', 'SECRET', 'TOKEN', 'KEY']):
                        val = '********'
                    result[key.strip()] = val.strip().strip('"').strip("'")
    if not result:
        result['_info'] = 'Tidak ada konfigurasi. Buat config.env atau tambah key/value baru.'
    return jsonify({'config': result})


@admin_bp.route('/api/admin/config', methods=['POST'])
@requires_admin
def update_config():
    try:
        data = request.get_json(silent=True) or {}
        key = data.get('key', '')
        value = data.get('value', '')
        if not key:
            return jsonify({'error': 'Key is required'}), 400
        config.update_config(key, value)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/notifications/last-seen', methods=['GET'])
@requires_admin
def get_last_seen():
    """Get the user's last seen notification ID (persisted across sessions)."""
    from database import get_last_seen_notif_id
    user_id = g.user.get('user_id', 0) if hasattr(g, 'user') else 0
    last_id = get_last_seen_notif_id(user_id)
    return jsonify({'last_seen_id': last_id})


@admin_bp.route('/api/admin/notifications/last-seen', methods=['POST'])
@requires_admin
def set_last_seen():
    """Save the user's last seen notification ID."""
    try:
        data = request.get_json(silent=True) or {}
        notif_id = int(data.get('last_seen_id', 0))
        from database import set_last_seen_notif_id
        user_id = g.user.get('user_id', 0) if hasattr(g, 'user') else 0
        set_last_seen_notif_id(user_id, notif_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/notifications/settings', methods=['GET'])
@requires_admin
def get_notif_settings():
    """Get notification preferences (sound, desktop)."""
    from database import get_notification_settings
    settings = get_notification_settings()
    return jsonify({
        'sound': settings.get('notif_sound', 'true') == 'true',
        'desktop': settings.get('notif_desktop', 'true') == 'true'
    })


@admin_bp.route('/api/admin/notifications/settings', methods=['POST'])
@requires_admin
def save_notif_settings():
    """Save notification preferences (sound, desktop)."""
    try:
        data = request.get_json(silent=True) or {}
        from database import save_notification_settings
        save_data = {}
        if 'sound' in data:
            save_data['notif_sound'] = data['sound']
        if 'desktop' in data:
            save_data['notif_desktop'] = data['desktop']
        save_notification_settings(save_data)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/notifications', methods=['GET'])
@requires_admin
def notifications():
    """Dedicated endpoint for important notifications with unread count.
    
    Returns only important activities (errors, mutations to critical endpoints)
    plus a since_id param for client-side unread tracking.
    """
    limit = request.args.get('limit', 20, type=int)
    limit = min(limit, 100)
    since_id = request.args.get('since_id', 0, type=int)
    
    logs = get_activity_logs(limit)
    
    # Filter important activities (same logic as frontend isImportant)
    important = []
    max_id = 0
    unread_count = 0
    critical_paths = ['/api/files', '/api/upload', '/api/settings',
        '/api/admin/config', '/api/download', '/api/admin/users',
        '/api/login', '/api/profile', '/api/admin/vpn',
        '/api/admin/services', '/api/admin/system', '/api/daemon',
        '/api/admin/dependencies', '/api/tools', '/api/admin/keys',
        '/api/settings/ai-keys', '/api/notify']
    
    for log in logs:
        lid = log.get('id', 0)
        if lid > max_id:
            max_id = lid
        status = log.get('status_code', 200)
        ep = (log.get('endpoint') or '').lower()
        method = (log.get('method') or '').upper()
        
        is_imp = status >= 400 or (
            method in ('POST', 'PUT', 'DELETE')
            and any(cp in ep for cp in critical_paths)
        )
        if is_imp:
            if lid > since_id:
                unread_count += 1
            important.append(log)
    
    return jsonify({
        'notifications': important[:limit],
        'unread_count': unread_count,
        'max_id': max_id
    })


@admin_bp.route('/api/admin/activity/clear', methods=['POST'])
@requires_admin
def clear_activity():
    """Delete all activity logs from the database."""
    try:
        conn = get_connection()
        conn.execute('DELETE FROM activity_logs')
        conn.commit()
        return jsonify({'success': True, 'message': 'All activity logs cleared'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/activity', methods=['GET'])
@requires_admin
def activity_logs():
    limit = request.args.get('limit', 50, type=int)
    limit = min(limit, 500)
    logs = get_activity_logs(limit)
    return jsonify({'logs': logs})


@admin_bp.route('/api/admin/system/restart', methods=['POST'])
@requires_admin
def restart_api():
    try:
        subprocess.Popen(['systemctl', 'restart', 'zdt-api', '--no-block'], start_new_session=True)
        return jsonify({'success': True, 'message': 'API server restart initiated (delayed)'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/system/status', methods=['GET'])
@requires_admin
def system_status():
    try:
        result = subprocess.run(
            ['sudo', 'systemctl', 'is-active', 'zdt-api'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            return jsonify({'status': result.stdout.strip()})
    except Exception:
        pass
    try:
        pg = subprocess.run(
            ['pgrep', '-f', 'gunicorn.*server:app'],
            capture_output=True, text=True, timeout=5
        )
        if pg.returncode == 0:
            return jsonify({'status': 'active'})
        pg2 = subprocess.run(
            ['pgrep', '-f', 'python.*server.py'],
            capture_output=True, text=True, timeout=5
        )
        if pg2.returncode == 0:
            return jsonify({'status': 'active (dev)'})
        return jsonify({'status': 'inactive'})
    except Exception as e:
        return jsonify({'status': 'unknown', 'error': str(e)})


# === VPN MANAGEMENT ===

SVC_VPN_UNIT = 'xl2tpd'

@admin_bp.route('/api/admin/vpn/status', methods=['GET'])
@requires_admin
def vpn_status():
    try:
        # Check ppp0 interface (tidak perlu sudo)
        ppp = subprocess.run(['ip', '-4', 'addr', 'show', 'ppp0'],
                             capture_output=True, text=True, timeout=5)
        connected = ppp.returncode == 0
        vpn_ip = ''
        if connected:
            for line in ppp.stdout.split('\n'):
                if 'inet ' in line:
                    vpn_ip = line.strip().split()[1]

        # Check service status
        service_active = False
        service_enabled = False
        try:
            svc = subprocess.run(
                ['systemctl', 'is-active', SVC_VPN_UNIT],
                capture_output=True, text=True, timeout=3
            )
            service_active = svc.stdout.strip() == 'active'
        except Exception:
            pass
        try:
            enabled = subprocess.run(
                ['systemctl', 'is-enabled', SVC_VPN_UNIT],
                capture_output=True, text=True, timeout=3
            )
            service_enabled = enabled.stdout.strip() == 'enabled'
        except Exception:
            # Fallback: check symlink di /etc/systemd/system
            service_enabled = os.path.islink(f'/etc/systemd/system/multi-user.target.wants/{SVC_VPN_UNIT}.service')

        return jsonify({
            'connected': connected,
            'ip': vpn_ip,
            'interface': 'ppp0',
            'service_active': service_active,
            'service_enabled': service_enabled,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


L2TP_CONTROL = '/var/run/xl2tpd/l2tp-control'
VPN_LAC = 'zdtvpn'

def _vpn_write_l2tp(cmd: str) -> tuple[bool, str]:
    """Write command to xl2tpd control socket. Falls back to sudo if direct write fails."""
    if not os.path.exists(L2TP_CONTROL):
        return False, f'Control socket {L2TP_CONTROL} not found'
    # Try direct write
    try:
        with open(L2TP_CONTROL, 'w') as f:
            f.write(f'{cmd} {VPN_LAC}\n')
        return True, ''
    except PermissionError:
        pass
    except OSError as e:
        return False, str(e)
    # Fallback: use sudo via shell script
    script = '/usr/local/bin/zdt-vpn.sh'
    action = {'c': 'connect', 'd': 'disconnect'}.get(cmd)
    if action and os.path.exists(script):
        try:
            subprocess.run(['sudo', script, action], capture_output=True, timeout=15)
            return True, ''
        except Exception as e:
            return False, str(e)
    return False, 'Permission denied and no sudo fallback available'

def _vpn_wait_ppp(timeout: int, expect_up: bool) -> bool:
    """Wait for ppp0 to appear (expect_up=True) or disappear (expect_up=False)."""
    import time
    for _ in range(timeout):
        time.sleep(1)
        r = subprocess.run(['ip', '-4', 'addr', 'show', 'ppp0'],
                           capture_output=True, text=True, timeout=5)
        up = r.returncode == 0
        if up == expect_up:
            return True
    return False

def _vpn_ensure_xl2tpd() -> tuple[bool, str]:
    """Make sure xl2tpd service is running."""
    try:
        r = subprocess.run(['pgrep', '-x', 'xl2tpd'], capture_output=True, timeout=3)
        if r.returncode == 0:
            return True, ''
    except Exception:
        pass
    # Try systemctl start (may fail with NoNewPrivs, but worth a shot)
    try:
        subprocess.run(['systemctl', 'start', 'xl2tpd'], capture_output=True, timeout=10)
    except Exception:
        pass
    time.sleep(1)
    try:
        r = subprocess.run(['pgrep', '-x', 'xl2tpd'], capture_output=True, timeout=3)
        if r.returncode == 0:
            return True, ''
    except Exception:
        pass
    return False, 'xl2tpd service not running and could not be started (try: sudo systemctl start xl2tpd)'


@admin_bp.route('/api/admin/vpn/connect', methods=['POST'])
@requires_admin
def vpn_connect():
    try:
        import time
        # If already connected, return success
        r = subprocess.run(['ip', '-4', 'addr', 'show', 'ppp0'],
                           capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            return jsonify({'success': True, 'message': 'Already connected'})

        ok, err = _vpn_ensure_xl2tpd()
        if not ok:
            log_vpn_event('connect', 'failed', err)
            return jsonify({'error': err}), 500

        # Disconnect first to clear stale session
        _vpn_write_l2tp('d')
        time.sleep(1)

        ok, err = _vpn_write_l2tp('c')
        if not ok:
            log_vpn_event('connect', 'failed', err)
            return jsonify({'error': err}), 500

        if _vpn_wait_ppp(15, True):
            log_vpn_event('connect', 'success', 'VPN connected')
            return jsonify({'success': True, 'message': 'VPN connected'})

        log_vpn_event('connect', 'failed', 'ppp0 did not appear after 15s')
        return jsonify({'error': 'ppp0 interface did not appear after 15 seconds'}), 500
    except Exception as e:
        log_vpn_event('connect', 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/disconnect', methods=['POST'])
@requires_admin
def vpn_disconnect():
    try:
        ok, err = _vpn_write_l2tp('d')
        if not ok:
            log_vpn_event('disconnect', 'failed', err)
            return jsonify({'error': err}), 500

        # Also kill pppd directly
        subprocess.run(['pkill', '-x', 'pppd'], capture_output=True, timeout=3)
        # Also try pppd pid file
        try:
            with open('/var/run/ppp0.pid') as pf:
                pid = int(pf.read().strip())
                os.kill(pid, 15)
        except Exception:
            pass

        if _vpn_wait_ppp(10, False):
            log_vpn_event('disconnect', 'success', 'VPN disconnected')
            return jsonify({'success': True, 'message': 'VPN disconnected'})

        log_vpn_event('disconnect', 'failed', 'ppp0 still present after 10s')
        return jsonify({'error': 'ppp0 interface still present after 10 seconds'}), 500
    except Exception as e:
        log_vpn_event('disconnect', 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/restart', methods=['POST'])
@requires_admin
def vpn_restart():
    try:
        import time
        ok, err = _vpn_write_l2tp('d')
        if not ok:
            logger.warning(f'VPN restart disconnect: {err}')
        subprocess.run(['pkill', '-x', 'pppd'], capture_output=True, timeout=3)
        time.sleep(2)

        ok, err = _vpn_ensure_xl2tpd()
        if not ok:
            log_vpn_event('restart', 'failed', err)
            return jsonify({'error': err}), 500

        ok, err = _vpn_write_l2tp('c')
        if not ok:
            log_vpn_event('restart', 'failed', err)
            return jsonify({'error': err}), 500

        if _vpn_wait_ppp(15, True):
            log_vpn_event('restart', 'success', 'VPN restarted')
            return jsonify({'success': True, 'message': 'VPN restarted'})

        log_vpn_event('restart', 'failed', 'ppp0 did not appear after restart')
        return jsonify({'error': 'ppp0 did not appear after restart'}), 500
    except Exception as e:
        log_vpn_event('restart', 'failed', str(e))
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/config', methods=['GET'])
@requires_admin
def vpn_get_config():
    try:
        return jsonify({
            'success': True,
            'server': config.get('VPN_SERVER', 'remote4.vpnmurahjogja.my.id'),
            'username': config.get('VPN_USERNAME', 'gemini'),
            'password': '********' if config.get('VPN_PASSWORD') else '',
            'enabled': config.get('VPN_AUTOSTART', 'false'),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/config', methods=['POST'])
@requires_admin
def vpn_set_config():
    try:
        data = request.get_json(silent=True) or {}
        
        # Mapping lowercase payload keys to uppercase config keys
        key_mapping = {
            'server': 'VPN_SERVER',
            'username': 'VPN_USERNAME',
            'password': 'VPN_PASSWORD',
            'enabled': 'VPN_AUTOSTART'
        }
        
        mapped_data = {}
        for k, v in data.items():
            if k in key_mapping:
                mapped_data[key_mapping[k]] = v
            else:
                mapped_data[k] = v
                
        # Validate VPN_SERVER
        if 'VPN_SERVER' in mapped_data:
            import re
            val = str(mapped_data['VPN_SERVER']).strip()
            if not val:
                return jsonify({
                    'success': False,
                    'error': 'INVALID_VPN_CONFIG',
                    'message': 'VPN Server cannot be empty'
                }), 400
            hostname_pattern = re.compile(
                r'^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
            )
            ip_pattern = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
            if not hostname_pattern.match(val) and not ip_pattern.match(val):
                return jsonify({
                    'success': False,
                    'error': 'INVALID_VPN_CONFIG',
                    'message': 'VPN Server must be a valid hostname or IP address'
                }), 400
                
        # Update config
        for key in ['VPN_SERVER', 'VPN_USERNAME', 'VPN_PASSWORD', 'VPN_AUTOSTART']:
            if key in mapped_data:
                config.update_config(key, mapped_data[key])
                
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@admin_bp.route('/api/update-check', methods=['GET'])
@requires_admin
def check_update():
    """Placeholder — update check removed."""
    import json as _ju
    return _ju.dumps({"has_update": False, "current": "v" + config.get_version(), "latest": ""}), 200, {"Content-Type": "application/json"}


# === SERVICE MANAGEMENT ===

ZDT_SERVICES = [
    'zdt-api', 'zdt-web', 'zdt-scheduler', 'zdt-telegram', 'zdt-watch'
]

@admin_bp.route('/api/admin/services', methods=['GET'])
@requires_admin
def list_services():
    try:
        services = []
        for name in ZDT_SERVICES:
            unit = name + '.service'
            active_res = subprocess.run(['systemctl', 'is-active', unit],
                                        capture_output=True, text=True, timeout=5)
            enabled_res = subprocess.run(['systemctl', 'is-enabled', unit],
                                         capture_output=True, text=True, timeout=5)
            active = active_res.stdout.strip()
            enabled = enabled_res.stdout.strip()
            scripts_map = {
                'zdt-watch': 'zdt-watch.py',
                'zdt-telegram': 'zdt-telegram.py',
                'zdt-scheduler': 'zdt-scheduler.py',
                'zdt-web': 'zdt-web.py',
                'zdt-api': 'server.py',
            }
            script = scripts_map.get(name, f'{name}.py')
            pg = subprocess.run(['pgrep', '-f', script],
                                capture_output=True, text=True, timeout=3)
            if enabled not in ('enabled', 'disabled'):
                enabled = 'unknown'
                if name == 'zdt-watch':
                    enabled = 'enabled' if config.get('WATCH_AUTOSTART') == 'true' else 'disabled'
            if active != 'active':
                active = 'active' if pg.returncode == 0 else 'inactive'
            services.append({
                'name': name,
                'active': active or 'inactive',
                'enabled': enabled,
            })
        return jsonify({'services': services})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/system/shutdown', methods=['POST'])
@requires_admin
def shutdown_server():
    try:
        subprocess.Popen(['sudo', 'systemctl', 'poweroff'], start_new_session=True)
        return jsonify({'success': True, 'message': 'Server shutdown initiated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _is_process_running(script_name):
    try:
        r = subprocess.run(['pgrep', '-f', script_name], capture_output=True, text=True, timeout=5)
        return r.returncode == 0
    except Exception as e:
        logger.warning(f"Failed to check process {script_name}: {e}")
        return False

def _kill_process(script_name):
    try:
        r = subprocess.run(['pgrep', '-f', script_name], capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            for pid in r.stdout.strip().split('\n'):
                if pid:
                    try: os.kill(int(pid), signal.SIGTERM)
                    except Exception as e:
                        logger.warning(f"Failed to SIGTERM {pid} for {script_name}: {e}")
            time.sleep(1)
            for pid in r.stdout.strip().split('\n'):
                if pid:
                    try: os.kill(int(pid), signal.SIGKILL)
                    except Exception as e:
                        logger.warning(f"Failed to SIGKILL {pid} for {script_name}: {e}")
    except Exception as e:
        logger.warning(f"Failed to kill process {script_name}: {e}")

SCRIPTS_MAP = {
    'zdt-watch': 'zdt-watch.py',
    'zdt-telegram': 'zdt-telegram.py',
    'zdt-scheduler': 'zdt-scheduler.py',
    'zdt-web': 'zdt-web.py',
    'zdt-api': 'server.py',
}

def _manage_direct(name, action):
    """Manage a service directly by starting/stopping its Python script."""
    script = SCRIPTS_MAP.get(name, f'{name}.py')
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_path = os.path.join(base, script)
    python = shutil.which('python3') or 'python3'

    if action == 'stop':
        _kill_process(script)
        return {'success': True, 'message': f'{name} stopped'}

    if action == 'start':
        if _is_process_running(script):
            return {'success': True, 'message': f'{name} already running'}
        if not os.path.exists(script_path):
            return {'success': False, 'error': f'Script not found: {script_path}'}
        subprocess.Popen([python, script_path], start_new_session=True, close_fds=True)
        return {'success': True, 'message': f'{name} started'}

    if action == 'restart':
        _kill_process(script)
        time.sleep(1)
        if not os.path.exists(script_path):
            return {'success': False, 'error': f'Script not found: {script_path}'}
        subprocess.Popen([python, script_path], start_new_session=True, close_fds=True)
        return {'success': True, 'message': f'{name} restarted'}

    return {'success': False, 'error': 'Unknown action'}


@admin_bp.route('/api/admin/services/<name>/<action>', methods=['POST'])
@requires_admin
def manage_service(name, action):
    try:
        if name not in ZDT_SERVICES:
            return jsonify({'error': f'Unknown service: {name}'}), 400
        if action not in ('start', 'stop', 'restart', 'enable', 'disable'):
            return jsonify({'error': f'Invalid action: {action}'}), 400

        # Handle start/stop/restart via direct process management
        if action in ('start', 'stop', 'restart'):
            result = _manage_direct(name, action)
            if result['success']:
                return jsonify(result)
            return jsonify(result), 500

        # Handle enable/disable: try systemctl first, fall back to config
        unit = name + '.service'
        sys_result = subprocess.run(['systemctl', action, unit],
                                    capture_output=True, text=True, timeout=15)
        if sys_result.returncode == 0:
            return jsonify({'success': True, 'message': f'{name} {action} berhasil'})

        # systemctl failed — fall back to config-based for known services
        if name == 'zdt-watch':
            config.update_config('WATCH_AUTOSTART', 'true' if action == 'enable' else 'false')
            return jsonify({'success': True, 'message': f'{name} {action} (config)'})
        if name == 'zdt-api':
            config.update_config('API_AUTOSTART', 'true' if action == 'enable' else 'false')
            return jsonify({'success': True, 'message': f'{name} {action} (config)'})

        return jsonify({'error': sys_result.stderr.strip() or f'Gagal {action} {name}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === DEPENDENCY MANAGEMENT ===

_ZDT_VENV_DIR = os.path.expanduser('~/.local/share/zdt/venv')
_ZDT_DEMUCS_BIN = os.path.expanduser('~/.local/share/zdt/demucs_venv/bin/demucs')

def _check_binary(name):
    path = shutil.which(name)
    if not path:
        return {'name': name, 'type': 'binary', 'installed': False, 'version': None}
    try:
        ver = subprocess.run([name, '--version'], capture_output=True, text=True, timeout=10)
        v = ver.stdout.strip().split('\n')[0] or ver.stderr.strip().split('\n')[0]
        return {'name': name, 'type': 'binary', 'installed': True, 'version': v or 'ok', 'path': path}
    except Exception:
        return {'name': name, 'type': 'binary', 'installed': True, 'version': 'ok', 'path': path}

def _check_pip_module(name, venv_dir=None):
    spec = importlib.util.find_spec(name)
    if spec:
        r = subprocess.run([sys.executable, '-c', f'import {name}'],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return {'name': name, 'type': 'pip', 'installed': True, 'version': 'ok', 'path': spec.origin}
    if venv_dir:
        py = os.path.join(venv_dir, 'bin', 'python')
        if os.path.isfile(py):
            r = subprocess.run([py, '-c', f'import {name}'],
                               capture_output=True, text=True, timeout=10)
            if r.returncode == 0:
                v = subprocess.run([py, '-c', f'import {name}; v=getattr({name}, "__version__", None); print(v or "ok")'],
                                   capture_output=True, text=True, timeout=10)
                version = v.stdout.strip() if v.returncode == 0 else 'ok'
                return {'name': name, 'type': 'pip', 'installed': True, 'version': version or 'ok'}
    return {'name': name, 'type': 'pip', 'installed': False, 'version': None}

def _check_pip_binary(name, venv_dir):
    bin_path = os.path.join(venv_dir, 'bin', name)
    if os.path.isfile(bin_path):
        try:
            r = subprocess.run([bin_path, '--version'], capture_output=True, text=True, timeout=10)
            v = r.stdout.strip().split('\n')[0] or r.stderr.strip().split('\n')[0]
            return {'name': name, 'type': 'pip', 'installed': True, 'version': v or 'ok', 'path': bin_path}
        except Exception:
            return {'name': name, 'type': 'pip', 'installed': True, 'version': 'ok', 'path': bin_path}
    return None

@admin_bp.route('/api/admin/dependencies', methods=['GET'])
@requires_admin
def check_dependencies():
    deps = []
    def _best_binary(*names):
        for name in names:
            result = _check_binary(name)
            if result.get('installed'):
                return result
        return _check_binary(names[0]) or {'installed': False}
        
    deps.append({'_key': 'python3', '_label': 'Python 3', '_group': 'core',
                 **_best_binary('python3', 'python')})
    deps.append({'_key': 'ffmpeg', '_label': 'FFmpeg', '_group': 'system',
                 **(_check_binary('ffmpeg') or {'installed': False})})
    deps.append({'_key': 'nodejs', '_label': 'Node.js', '_group': 'system',
                 **_best_binary('nodejs', 'node')})
    deps.append({'_key': 'npm', '_label': 'npm', '_group': 'system',
                 **(_check_binary('npm') or {'installed': False})})

    for mod in [('flask', None), ('gunicorn', None), ('syncedlyrics', None), ('mutagen', None),
                ('watchdog', None), ('pyTelegramBotAPI', 'telebot')]:
        name, import_as = mod[0], mod[1] or mod[0]
        deps.append({'_key': name, '_label': name, '_group': 'pip',
                     **(_check_pip_module(import_as, _ZDT_VENV_DIR) or {'installed': False})})

    for bin_name in ['yt-dlp', 'spotdl']:
        r = _check_pip_binary(bin_name, _ZDT_VENV_DIR)
        if r:
            r['_key'] = bin_name
            r['_label'] = bin_name
            r['_group'] = 'tool'
            deps.append(r)
        else:
            deps.append({'_key': bin_name, '_label': bin_name, '_group': 'tool',
                         **(_check_pip_module(bin_name) or {'installed': False})})

    demucs_path = _ZDT_DEMUCS_BIN
    if os.path.isfile(demucs_path):
        try:
            r = subprocess.run([demucs_path, '--version'], capture_output=True, text=True, timeout=15)
            v = r.stdout.strip() or r.stderr.strip() or 'ok'
            deps.append({'_key': 'demucs', '_label': 'Demucs (AI)', '_group': 'tool',
                         'installed': True, 'version': v, 'path': demucs_path})
        except Exception:
            deps.append({'_key': 'demucs', '_label': 'Demucs (AI)', '_group': 'tool',
                         'installed': True, 'version': 'ok', 'path': demucs_path})
    else:
        deps.append({'_key': 'demucs', '_label': 'Demucs (AI)', '_group': 'tool',
                     'installed': False, 'version': None})

    return jsonify({'dependencies': deps})


@admin_bp.route('/api/admin/dependencies/install', methods=['POST'])
@requires_admin
def install_dependencies():
    setup_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'zdt-modules', 'setup.sh')
    setup_script = os.path.abspath(setup_script)
    if not os.path.isfile(setup_script):
        return jsonify({'error': 'setup.sh tidak ditemukan'}), 500

    try:
        result = subprocess.run(
            ['bash', setup_script, '--install-missing'],
            capture_output=True, text=True, timeout=600
        )
        return jsonify({
            'success': result.returncode == 0,
            'message': 'Instalasi selesai' if result.returncode == 0 else 'Instalasi gagal',
            'stdout': result.stdout[-2000:],
            'stderr': result.stderr[-2000:]
        })
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Instalasi timeout (>10 menit)'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500
