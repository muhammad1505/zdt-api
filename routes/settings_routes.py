from flask import Blueprint, request, jsonify
import os
import subprocess
import secrets

from auth import requires_auth
from config import config
from flask import g

settings_bp = Blueprint('settings', __name__)


@settings_bp.route('/api/settings/storage', methods=['POST'])
@requires_auth
def update_storage():
    """Update target directory."""
    try:
        data = request.get_json(silent=True) or {}
        target_dir = data.get('target_dir', '')
        
        if not target_dir:
            return jsonify({'error': 'Target directory required'}), 400
        
        target_dir = os.path.expanduser(target_dir)
        if not os.path.isabs(target_dir):
            return jsonify({'error': 'Path must be absolute'}), 400
        
        os.makedirs(target_dir, exist_ok=True)
        config.update_config('TARGET_DIR', target_dir)
        
        return jsonify({'success': True, 'target_dir': target_dir})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@settings_bp.route('/api/csrf-token', methods=['GET'])
@requires_auth
def get_csrf_token():
    """Generate and return a CSRF token."""
    token = secrets.token_hex(32)
    g.csrf_token = token
    return jsonify({'csrf_token': token})


@settings_bp.route('/api/download', methods=['POST'])
@requires_auth
def trigger_download():
    """Queue a download task using yt-dlp or spotdl."""
    try:
        data = request.get_json(silent=True) or {}
        url = data.get('url', '')
        format_type = data.get('format', 'auto')
        
        if not url:
            return jsonify({'error': 'URL required'}), 400
        
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'Invalid URL'}), 400
        
        is_spotify = 'spotify.com' in url.lower()
        log_path = '/tmp/zdt_api_task.log'
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        
        if is_spotify:
            cmd = ['spotdl', url, '--output', config.get_target_dir()]
        else:
            cmd = ['yt-dlp', url, '-o', os.path.join(config.get_target_dir(), '%(title)s.%(ext)s')]
            if format_type == 'audio':
                cmd.extend(['-x', '--audio-format', 'mp3', '--audio-quality', '0'])
            elif format_type == 'video':
                cmd.extend(['-f', 'best[height<=1080]'])
        
        subprocess.Popen(
            cmd,
            stdout=open(log_path, 'a'),
            stderr=subprocess.STDOUT,
            start_new_session=True
        )
        
        return jsonify({'success': True, 'message': 'Download task started', 'url': url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
