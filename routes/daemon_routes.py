from flask import Blueprint, request, jsonify
import subprocess
import os
import signal

from auth import requires_auth
from config import config

daemon_bp = Blueprint('daemon', __name__)

DAEMON_MAP = {
    'watch': 'zdt-watch.py',
    'telegram': 'zdt-telegram.py',
    'scheduler': 'zdt-scheduler.py'
}


def _find_python():
    """Find Python executable."""
    for cmd in ['python3', 'python']:
        try:
            result = subprocess.run(['which', cmd], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception:
            pass
    return '/usr/bin/python3'


def _is_process_running(process_name):
    """Check if a process is running."""
    try:
        result = subprocess.run(
            ['pgrep', '-f', process_name],
            capture_output=True, text=True, timeout=5
        )
        return result.returncode == 0
    except Exception:
        return False


def _stop_process(process_name):
    """Stop a process by name."""
    try:
        # Try pgrep first
        result = subprocess.run(
            ['pgrep', '-f', process_name],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                    except:
                        pass
            # Wait then force kill
            import time
            time.sleep(1)
            for pid in pids:
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                    except:
                        pass
            return True
        
        # Fallback to ps aux
        result = subprocess.run(
            ['ps', 'aux'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if process_name in line:
                parts = line.split()
                if parts:
                    try:
                        os.kill(int(parts[1]), signal.SIGTERM)
                    except:
                        pass
        return True
    except Exception:
        return False


@daemon_bp.route('/api/daemon', methods=['POST'])
@requires_auth
def manage_daemon():
    """Start or stop daemon services."""
    try:
        data = request.get_json(silent=True) or {}
        service = data.get('service', '')
        action = data.get('action', '')  # 'start' or 'stop'
        
        if service not in DAEMON_MAP:
            return jsonify({'error': f'Unknown service: {service}'}), 400
        
        script_name = DAEMON_MAP[service]
        
        if action == 'stop':
            _stop_process(script_name)
            return jsonify({'success': True, 'message': f'{service} daemon stopped'})
        
        elif action == 'start':
            if _is_process_running(script_name):
                return jsonify({'success': True, 'message': f'{service} daemon already running'})
            
            python_bin = _find_python()
            script_path = os.path.join(config.project_root, script_name)
            
            if os.path.exists(script_path):
                subprocess.Popen(
                    [python_bin, script_path],
                    start_new_session=True,
                    close_fds=True
                )
                return jsonify({'success': True, 'message': f'{service} daemon started'})
            else:
                return jsonify({'error': f'Script not found: {script_path}'}), 404
        
        else:
            return jsonify({'error': 'Invalid action. Use "start" or "stop".'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@daemon_bp.route('/api/tools', methods=['POST'])
@requires_auth
def server_tools():
    """Execute server tools (clean, compress, demucs, etc.)."""
    try:
        data = request.get_json(silent=True) or {}
        action = data.get('action', '')
        filename = data.get('filename', '')
        target_dir = config.get_target_dir()
        log_path = '/tmp/zdt_api_task.log'
        
        if action == 'clean':
            subprocess.Popen(
                ['zdt', '--bersih-nama-all'],
                stdout=open(log_path, 'a'),
                stderr=subprocess.STDOUT,
                start_new_session=True
            )
            return jsonify({'success': True, 'message': 'Clean task started'})
        
        elif action == 'playlist':
            playlist_path = os.path.join(target_dir, 'ZDT_Playlist.m3u')
            try:
                files = [f for f in os.listdir(target_dir) if f.endswith('.mp3')]
                with open(playlist_path, 'w') as f:
                    for file in sorted(files):
                        f.write(f'{file}\n')
                return jsonify({'success': True, 'message': f'Playlist created with {len(files)} files'})
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        elif action == 'sync_lyrics':
            subprocess.Popen(
                ['zdt', '--sync-lirik-all'],
                stdout=open(log_path, 'a'),
                stderr=subprocess.STDOUT,
                start_new_session=True
            )
            return jsonify({'success': True, 'message': 'Lyrics sync started'})
        
        elif action == 'compress':
            if not filename:
                return jsonify({'error': 'Filename required'}), 400
            full_path = os.path.join(target_dir, filename)
            if not os.path.exists(full_path):
                return jsonify({'error': 'File not found'}), 404
            
            ext = os.path.splitext(filename)[1].lower()
            if ext in ('.mp4', '.mkv', '.webm'):
                output = os.path.join(target_dir, f'compressed_{filename}')
                subprocess.Popen(
                    ['ffmpeg', '-i', full_path, '-vcodec', 'libx264', '-crf', '28', output],
                    stdout=open(log_path, 'a'),
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
            else:
                output = os.path.join(target_dir, f'compressed_{filename}')
                subprocess.Popen(
                    ['ffmpeg', '-i', full_path, '-b:a', '128k', output],
                    stdout=open(log_path, 'a'),
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
            return jsonify({'success': True, 'message': 'Compression started'})
        
        elif action == 'delete_all':
            try:
                for root, _, files in os.walk(target_dir):
                    for f in files:
                        if os.path.splitext(f)[1].lower() in {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}:
                            os.remove(os.path.join(root, f))
                return jsonify({'success': True, 'message': 'All media files deleted'})
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        else:
            return jsonify({'error': f'Unknown action: {action}'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
