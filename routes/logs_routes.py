from flask import Blueprint, request, jsonify, Response, stream_with_context
import os
import time

from auth import requires_auth
from middleware import sse_connect, sse_disconnect

logs_bp = Blueprint('logs', __name__)

LOG_PATH = '/tmp/zdt_api_task.log'


@logs_bp.route('/api/logs', methods=['GET'])
@requires_auth
def get_logs():
    """Get recent log entries."""
    try:
        if not os.path.exists(LOG_PATH):
            return jsonify({'logs': [], 'running': False})
        
        with open(LOG_PATH) as f:
            lines = f.readlines()
        
        # Last 100 lines
        recent_lines = lines[-100:]
        
        # Check if task is running
        running = False
        for line in recent_lines:
            if 'Task' in line and ('started' in line.lower() or 'running' in line.lower()):
                running = True
        
        return jsonify({
            'logs': [{'line': l.rstrip(), 'timestamp': time.time()} for l in recent_lines],
            'running': running
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@logs_bp.route('/api/logs/stream', methods=['GET'])
@requires_auth
def stream_logs():
    """SSE endpoint for real-time log streaming."""
    if not sse_connect():
        return jsonify({'error': 'Too many connections'}), 429
    
    def generate():
        last_size = 0
        try:
            while True:
                if os.path.exists(LOG_PATH):
                    current_size = os.path.getsize(LOG_PATH)
                    if current_size > last_size:
                        with open(LOG_PATH) as f:
                            f.seek(last_size)
                            new_data = f.read()
                            if new_data:
                                yield f'data: {new_data}\n\n'
                        last_size = current_size
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
