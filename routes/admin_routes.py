from flask import Blueprint, request, jsonify, g
import os
import subprocess
import hashlib

from auth import requires_admin
from database import (
    get_all_api_keys, generate_api_key, revoke_api_key,
    get_all_users, create_user, delete_user,
    get_activity_logs, get_smart_api_key_string, get_connection
)
from config import config

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
            pw_hash = hashlib.sha256(data['password'].encode()).hexdigest()
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
        except:
            pass
        
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
        except:
            pass
        
        net = {}
        try:
            result = subprocess.run(
                ['ip', '-4', 'addr', 'show', 'ppp0'],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'inet ' in line:
                        net['vpn_ip'] = line.strip().split()[1]
        except:
            pass
        
        services = {}
        for s in ['zdt-watch.py', 'zdt-telegram.py', 'zdt-scheduler.py']:
            try:
                r = subprocess.run(['pgrep', '-f', s], capture_output=True, timeout=3)
                services[s.replace('.py', '')] = r.returncode == 0
            except:
                services[s.replace('.py', '')] = False
        
        return jsonify({
            'cpu': {'load_1m': cpu[0], 'load_5m': cpu[1], 'load_15m': cpu[2]},
            'memory': {'total_gb': mem.get('total', 0), 'available_gb': mem.get('available', 0)},
            'disk': disk,
            'uptime_hours': uptime,
            'services': services,
            'vpn': {'connected': 'vpn_ip' in net, 'ip': net.get('vpn_ip', '')},
            'version': config.get_version()
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
            ['systemctl', 'is-active', 'zdt-api'],
            capture_output=True, text=True, timeout=5
        )
        return jsonify({'status': result.stdout.strip()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === VPN MANAGEMENT ===

SVC_VPN_UNIT = 'xl2tpd'

@admin_bp.route('/api/admin/vpn/status', methods=['GET'])
@requires_admin
def vpn_status():
    try:
        # Check ppp0 interface
        ppp = subprocess.run(['ip', '-4', 'addr', 'show', 'ppp0'],
                             capture_output=True, text=True, timeout=5)
        connected = ppp.returncode == 0
        vpn_ip = ''
        if connected:
            for line in ppp.stdout.split('\n'):
                if 'inet ' in line:
                    vpn_ip = line.strip().split()[1]

        # Check xl2tpd service
        svc = subprocess.run(['systemctl', 'is-active', SVC_VPN_UNIT],
                             capture_output=True, text=True, timeout=5)
        service_active = svc.stdout.strip() == 'active'

        # Check if xl2tpd is enabled
        enabled = subprocess.run(['systemctl', 'is-enabled', SVC_VPN_UNIT],
                                 capture_output=True, text=True, timeout=5)
        service_enabled = enabled.stdout.strip() == 'enabled'

        return jsonify({
            'connected': connected,
            'ip': vpn_ip,
            'interface': 'ppp0',
            'service_active': service_active,
            'service_enabled': service_enabled,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/connect', methods=['POST'])
@requires_admin
def vpn_connect():
    try:
        result = subprocess.run(
            ['sudo', '/usr/local/bin/zdt-vpn.sh', 'connect'],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return jsonify({'error': 'Gagal connect VPN: ' + result.stderr.strip()}), 500
        return jsonify({'success': True, 'message': 'VPN connect initiated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/disconnect', methods=['POST'])
@requires_admin
def vpn_disconnect():
    try:
        result = subprocess.run(
            ['sudo', '/usr/local/bin/zdt-vpn.sh', 'disconnect'],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return jsonify({'error': 'Gagal disconnect VPN: ' + result.stderr.strip()}), 500
        return jsonify({'success': True, 'message': 'VPN disconnected'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/vpn/config', methods=['GET'])
@requires_admin
def vpn_get_config():
    try:
        return jsonify({
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
        for key in ['VPN_SERVER', 'VPN_USERNAME', 'VPN_PASSWORD', 'VPN_AUTOSTART']:
            if key in data:
                config.update_config(key, data[key])
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# === SERVICE MANAGEMENT ===

ZDT_SERVICES = [
    'zdt-web', 'zdt-scheduler', 'zdt-telegram', 'zdt-tunnel'
]

@admin_bp.route('/api/admin/services', methods=['GET'])
@requires_admin
def list_services():
    try:
        services = []
        for name in ZDT_SERVICES:
            unit = name + '.service'
            active = subprocess.run(['systemctl', 'is-active', unit],
                                    capture_output=True, text=True, timeout=5)
            enabled = subprocess.run(['systemctl', 'is-enabled', unit],
                                     capture_output=True, text=True, timeout=5)
            services.append({
                'name': name,
                'active': active.stdout.strip(),
                'enabled': enabled.stdout.strip(),
            })
        return jsonify({'services': services})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/system/shutdown', methods=['POST'])
@requires_admin
def shutdown_server():
    try:
        subprocess.Popen(['systemctl', 'poweroff'], start_new_session=True)
        return jsonify({'success': True, 'message': 'Server shutdown initiated'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/api/admin/services/<name>/<action>', methods=['POST'])
@requires_admin
def manage_service(name, action):
    try:
        if name not in ZDT_SERVICES:
            return jsonify({'error': f'Unknown service: {name}'}), 400
        if action not in ('start', 'stop', 'restart', 'enable', 'disable'):
            return jsonify({'error': f'Invalid action: {action}'}), 400

        unit = name + '.service'

        # Special handling for zdt-api restart (don't block)
        if name == 'zdt-api' and action == 'restart':
            subprocess.Popen(['systemctl', 'restart', unit, '--no-block'],
                             start_new_session=True)
            return jsonify({'success': True, 'message': f'{name} restart initiated (delayed)'})

        result = subprocess.run(['systemctl', action, unit],
                                capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return jsonify({'error': result.stderr.strip() or f'Gagal {action} {name}'}), 500

        msg = f'{name} {action} berhasil'
        return jsonify({'success': True, 'message': msg})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
