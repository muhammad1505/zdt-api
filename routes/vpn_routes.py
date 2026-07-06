from flask import Blueprint, request, jsonify
import subprocess
import os
from auth import requires_auth, requires_admin
from config import config
import database

vpn_bp = Blueprint('vpn', __name__)


@vpn_bp.route('/api/vpn/status', methods=['GET'])
@requires_auth
def vpn_status():
    try:
        ppp = subprocess.run(['ip', '-4', 'addr', 'show', 'ppp0'],
                             capture_output=True, text=True, timeout=5)
        connected = ppp.returncode == 0
        vpn_ip = ''
        if connected:
            for line in ppp.stdout.split('\n'):
                if 'inet ' in line:
                    vpn_ip = line.strip().split()[1]
        return jsonify({
            'success': True,
            'connected': connected,
            'ip': vpn_ip,
        })
    except Exception:
        return jsonify({'success': True, 'connected': False, 'ip': ''})


@vpn_bp.route('/api/admin/vpn/log', methods=['GET'])
@requires_admin
def vpn_logs():
    try:
        limit = request.args.get('limit', 100, type=int)
        limit = min(limit, 500)
        logs = database.get_vpn_logs(limit)
        return jsonify({'success': True, 'logs': logs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@vpn_bp.route('/api/admin/vpn/auto-reconnect', methods=['POST'])
@requires_admin
def vpn_auto_reconnect():
    try:
        data = request.get_json(silent=True) or {}
        enabled = data.get('enabled', False)
        interval = data.get('interval_seconds', 0)

        if not isinstance(enabled, bool):
            return jsonify({'success': False, 'error': 'enabled must be a boolean'}), 400
        if not isinstance(interval, int) or interval < 10:
            return jsonify({'success': False, 'error': 'interval_seconds must be >= 10'}), 400

        config.update_config('VPN_AUTO_RECONNECT', 'true' if enabled else 'false')
        config.update_config('VPN_RECONNECT_INTERVAL', str(interval))

        return jsonify({'success': True, 'message': 'Auto-reconnect configured'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
