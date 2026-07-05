from flask import Blueprint, request, jsonify
import os
import subprocess

from auth import requires_auth
from config import config

dashboard_bp = Blueprint('dashboard', __name__)


@dashboard_bp.route('/api/stats', methods=['GET'])
@requires_auth
def get_stats():
    """Get download statistics from database."""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        page = max(1, page)
        per_page = max(5, min(100, per_page))
        offset = (page - 1) * per_page
        
        db_path = os.path.join(config.modules_dir, 'zdt_db.py')
        if os.path.exists(db_path):
            result = subprocess.run(
                ['python3', db_path, config.config_path, 'get_stats', str(per_page), str(offset)],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                import json
                return jsonify(json.loads(result.stdout))
        
        return jsonify({'downloads': [], 'total': 0, 'page': page, 'per_page': per_page})
    except Exception as e:
        return jsonify({'error': 'Gagal memuat statistik', 'message': str(e)}), 500


@dashboard_bp.route('/api/status', methods=['GET'])
@requires_auth
def get_status():
    """Get server and system status."""
    try:
        target_dir = config.get_target_dir()
        
        storage_free = 0
        if os.path.exists(target_dir):
            stat = os.statvfs(target_dir)
            storage_free = round(stat.f_bavail * stat.f_frsize / (1024**3), 2)
        
        media_extensions = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}
        file_count = 0
        if os.path.exists(target_dir):
            for root, _, files in os.walk(target_dir):
                for f in files:
                    if os.path.splitext(f)[1].lower() in media_extensions:
                        file_count += 1
        
        watcher_running = _is_process_running('zdt-watch.py')
        telegram_running = _is_process_running('zdt-telegram.py')
        
        return jsonify({
            'target_dir': target_dir,
            'storage_free': storage_free,
            'file_count': file_count,
            'version': config.get_version(),
            'watcher': watcher_running,
            'telegram': telegram_running
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _is_process_running(process_name):
    try:
        result = subprocess.run(
            ['pgrep', '-f', process_name],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False
