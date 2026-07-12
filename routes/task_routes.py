from flask import Blueprint, request, jsonify, g
from auth import requires_auth, requires_admin

task_bp = Blueprint('tasks', __name__)


@task_bp.route('/api/tasks', methods=['POST'])
@requires_auth
def create_task():
    try:
        data = request.get_json(silent=True) or {}
        task_type = data.get('type', '')
        url = data.get('url', '')
        params = data.get('params', {})
        priority = data.get('priority', 1)

        valid_types = ('download_audio', 'download_video', 'demucs', 'sync_lirik', 'kompres')
        if task_type not in valid_types:
            return jsonify({'success': False, 'error': f'Invalid type. Must be one of: {", ".join(valid_types)}'}), 400

        if task_type in ('download_audio', 'download_video') and not url:
            return jsonify({'success': False, 'error': 'URL required for download tasks'}), 400

        user_id = _get_user_id()
        from task_queue import get_manager
        mgr = get_manager()
        task_id = mgr.create_task(task_type, url=url, params=params,
                                  user_id=user_id, source='api', priority=priority)
        return jsonify({'success': True, 'id': task_id}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@task_bp.route('/api/tasks', methods=['GET'])
@requires_auth
def list_tasks():
    try:
        status = request.args.get('status')
        limit = min(request.args.get('limit', 50, type=int), 200)
        offset = request.args.get('offset', 0, type=int)
        from task_queue import get_manager
        mgr = get_manager()
        user_id = _get_user_id()
        role = None
        if hasattr(g, 'user') and g.user:
            role = g.user.get('role')
        is_admin = role == 'admin'
        # Admin lihat semua task, non-admin hanya task sendiri
        tasks = mgr.list_tasks(status=status, user_id=None if is_admin else user_id, limit=limit, offset=offset)
        stats = mgr.get_queue_stats()
        return jsonify({'success': True, 'tasks': tasks, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@task_bp.route('/api/tasks/<int:task_id>', methods=['GET'])
@requires_auth
def get_task(task_id):
    try:
        from task_queue import get_manager
        mgr = get_manager()
        task = mgr.get_task(task_id)
        if not task:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        return jsonify({'success': True, 'task': task})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@task_bp.route('/api/tasks/<int:task_id>/cancel', methods=['POST'])
@requires_auth
def cancel_task(task_id):
    try:
        from task_queue import get_manager
        mgr = get_manager()
        task = mgr.get_task(task_id)
        if not task:
            return jsonify({'success': False, 'error': 'Task not found'}), 404
        if task['status'] not in ('queued', 'running'):
            return jsonify({'success': False, 'error': f'Cannot cancel task in status: {task["status"]}'}), 400
        ok = mgr.cancel_task(task_id)
        return jsonify({'success': ok, 'message': 'Task cancelled' if ok else 'Failed to cancel'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@task_bp.route('/api/tasks/queue/stats', methods=['GET'])
@requires_auth
def queue_stats():
    try:
        from task_queue import get_manager
        mgr = get_manager()
        stats = mgr.get_queue_stats()
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@task_bp.route('/api/tasks/<int:task_id>', methods=['DELETE'])
@requires_auth
def delete_task(task_id):
    try:
        from task_queue import get_manager
        conn = __import__('sqlite3').connect(getattr(__import__('database', fromlist=['get_db_path']), 'get_db_path')())
        conn.execute('DELETE FROM task_queue WHERE id = ?', (task_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Task deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def _get_user_id():
    user_id = None
    if hasattr(g, 'user') and g.user:
        user_id = g.user.get('user_id')
    elif hasattr(g, 'api_key') and g.api_key:
        user_id = g.api_key.get('created_by')
    return user_id
