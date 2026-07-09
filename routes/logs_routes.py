from flask import Blueprint, request, jsonify, Response, stream_with_context
import os
import time
import subprocess
import shutil

from auth import requires_auth
from middleware import sse_connect, sse_disconnect

logs_bp = Blueprint('logs', __name__)

LOG_PATH = '/tmp/zdt_api_task.log'
WEB_LOG_PATH = '/tmp/zdt_web_task.log'


def is_task_running():
    # Check standalone binaries
    for proc in ['yt-dlp', 'spotdl', 'ffmpeg']:
        try:
            r = subprocess.run(['pgrep', '-x', proc], capture_output=True, timeout=2)
            if r.returncode == 0:
                return True
        except Exception:
            pass
    # Check zdt utility arguments specifically to avoid matching zdt-api itself
    for arg in ['--bersih-nama-all', '--sync-lirik-all']:
        try:
            r = subprocess.run(['pgrep', '-f', arg], capture_output=True, timeout=2)
            if r.returncode == 0:
                return True
        except Exception:
            pass
    return False


@logs_bp.route('/api/logs', methods=['GET'])
@requires_auth
def get_logs():
    """Get recent log entries."""
    try:
        running = is_task_running()
        if not os.path.exists(LOG_PATH):
            return jsonify({'logs': [], 'running': running})
        
        with open(LOG_PATH) as f:
            lines = f.readlines()
        
        # Last 100 lines
        recent_lines = lines[-100:]
        
        return jsonify({
            'logs': [{'line': l.rstrip(), 'timestamp': time.time()} for l in recent_lines],
            'running': running
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@logs_bp.route('/api/logs/stream', methods=['GET'])
def stream_logs():
    """SSE endpoint for real-time log streaming."""
    from auth import requires_auth, verify_bearer_token
    token = request.args.get('token', '')
    if token:
        payload = verify_bearer_token(token)
        if not payload:
            return jsonify({'error': 'Unauthorized'}), 401
    else:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            payload = verify_bearer_token(auth_header[7:])
            if not payload:
                return jsonify({'error': 'Unauthorized'}), 401
        else:
            # Also check X-API-Key for mobile clients
            api_key = request.headers.get('X-API-Key', '')
            if api_key:
                from database import parse_smart_api_key, validate_api_key
                parsed = parse_smart_api_key(api_key)
                if parsed:
                    key_data = validate_api_key(parsed['key_id'], parsed['secret'])
                    if not key_data:
                        return jsonify({'error': 'Unauthorized'}), 401
                elif '|' in api_key:
                    parts = api_key.split('|')
                    if len(parts) == 2:
                        key_data = validate_api_key(parts[0], parts[1])
                        if not key_data:
                            return jsonify({'error': 'Unauthorized'}), 401
                    else:
                        return jsonify({'error': 'Unauthorized'}), 401
                else:
                    return jsonify({'error': 'Unauthorized'}), 401
            else:
                return jsonify({'error': 'Unauthorized'}), 401
    if not sse_connect():
        return jsonify({'error': 'Too many connections'}), 429
    
    def generate():
        last_size = 0
        start_time = time.time()
        max_duration = 3600  # Auto-disconnect after 1 hour
        try:
            while True:
                if time.time() - start_time > max_duration:
                    yield f'event: close\ndata: Connection timeout\n\n'
                    break
                if os.path.exists(LOG_PATH):
                    current_size = os.path.getsize(LOG_PATH)
                    if current_size > last_size:
                        with open(LOG_PATH) as f:
                            f.seek(last_size)
                            new_data = f.read()
                            if new_data:
                                for line in new_data.rstrip('\n').split('\n'):
                                    yield f'data: {line}\n'
                                yield '\n'
                        last_size = current_size
                    elif current_size < last_size:
                        last_size = 0  # Log was rotated/truncated
                yield ':keepalive\n\n'
                time.sleep(1)
        except GeneratorExit:
            pass
        finally:
            sse_disconnect()
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@logs_bp.route('/api/logs/clear', methods=['POST'])
@requires_auth
def clear_logs():
    """Clear the log file."""
    try:
        if os.path.exists(LOG_PATH):
            os.remove(LOG_PATH)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@logs_bp.route('/api/system/logs', methods=['GET'])
@requires_auth
def system_logs():
    """Read system logs (journalctl or syslog) with pagination (from zdt-web)."""
    try:
        lines = request.args.get('lines', '50')
        try:
            lines = str(min(max(int(lines), 10), 500))
        except (ValueError, TypeError):
            lines = '50'

        # Try journalctl first (systemd systems)
        journalctl = shutil.which("journalctl")
        if journalctl:
            try:
                result = subprocess.run(
                    [journalctl, "--no-pager", "-n", lines, "--output", "short-iso", "--quiet"],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    log_lines = result.stdout.strip().split("\n")
                    entries = []
                    for line in log_lines[-int(lines):]:
                        parts = line.split(" ", 3)
                        if len(parts) >= 4:
                            raw_ts = parts[0]
                            ts = raw_ts.replace("T", " ").split("+")[0]
                            if ts == raw_ts.replace("T", " ") and "-" in raw_ts[19:]:
                                ts = raw_ts.replace("T", " ")[:19]
                            program = parts[2].split("[")[0] if "[" in parts[2] else parts[2]
                            message = parts[3]
                        else:
                            ts = ""
                            program = ""
                            message = line
                        entries.append({"timestamp": ts[:25], "program": program[:20], "message": message[:300]})
                    return jsonify({"source": "journalctl", "entries": entries[-int(lines):]})
            except (subprocess.TimeoutExpired, OSError):
                pass

        # Fallback: syslog file
        for syslog_path in ["/var/log/syslog", "/var/log/messages", "/var/log/system.log"]:
            if os.path.exists(syslog_path):
                try:
                    with open(syslog_path, "r") as f:
                        all_lines = f.readlines()
                    log_lines = all_lines[-int(lines):]
                    entries = []
                    for line in log_lines:
                        entry = line.strip()
                        if entry:
                            parts = entry.split(" ", 4)
                            if len(parts) >= 5:
                                timestamp = " ".join(parts[:3])
                                host = parts[3] if len(parts) > 3 else ""
                                program = parts[4].split("[")[0].split(":")[0] if ":" in parts[4] else parts[4][:20]
                                message = entry[len(timestamp) + len(host) + 2:] if len(parts) > 4 else entry
                            else:
                                timestamp = ""
                                program = ""
                                message = entry
                            entries.append({"timestamp": timestamp[:25], "program": program[:20], "message": message[:300]})
                    return jsonify({"source": os.path.basename(syslog_path), "entries": entries})
                except (OSError, IOError):
                    continue

        return jsonify({"source": None, "entries": [], "error": "Tidak ada system log yang bisa diakses."})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
