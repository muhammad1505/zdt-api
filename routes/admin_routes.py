from flask import Blueprint, request, jsonify
import os
import subprocess

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
        
        user_id = getattr(request, 'g', None)
        user_id = getattr(user_id, 'user', {}).get('user_id', 0) if hasattr(request, 'g') else 0
        
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
        disk = {}
        if os.path.exists(target_dir):
            stat = os.statvfs(target_dir)
            disk['total'] = round(stat.f_blocks * stat.f_frsize / (1024**3), 1)
            disk['free'] = round(stat.f_bavail * stat.f_frsize / (1024**3), 1)
            disk['used'] = round(disk['total'] - disk['free'], 1)
        
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
    if not os.path.exists(config_path):
        return jsonify({'config': {}})
    result = {}
    with open(config_path) as f:
        for line in f:
            line = line.strip()
            if line and '=' in line:
                key, val = line.split('=', 1)
                if any(k in key.upper() for k in ['PASS', 'SECRET', 'TOKEN', 'KEY']):
                    val = '********'
                result[key.strip()] = val.strip().strip('"').strip("'")
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
        subprocess.Popen(['systemctl', 'restart', 'zdt-api'], start_new_session=True)
        return jsonify({'success': True, 'message': 'API server restart initiated'})
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
