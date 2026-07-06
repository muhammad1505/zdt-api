from flask import Blueprint, request, jsonify, g
import os
import subprocess

from auth import requires_auth
from config import config
from database import create_download, get_download, get_downloads, update_download_status, delete_download, clear_download_history
from werkzeug.utils import secure_filename

downloads_bp = Blueprint('downloads', __name__)

SHELL_METACHARS = [';', '|', '$', '`', '&&', '||']


def _get_user_id():
    user_id = None
    if hasattr(g, 'user') and g.user:
        user_id = g.user.get('user_id')
    elif hasattr(g, 'api_key') and g.api_key:
        user_id = g.api_key.get('created_by')
    return user_id


def _spawn_download_process(url, format_type):
    is_spotify = 'spotify.com' in url.lower()
    log_path = '/tmp/zdt_api_task.log'
    os.makedirs(os.path.dirname(log_path), exist_ok=True)

    if is_spotify:
        cmd = ['spotdl', '--output', config.get_target_dir(), '--', url]
    else:
        cmd = ['yt-dlp', '-o', os.path.join(config.get_target_dir(), '%(title)s.%(ext)s')]
        if format_type == 'audio':
            cmd.extend(['-x', '--audio-format', 'mp3', '--audio-quality', '0'])
        elif format_type == 'video':
            cmd.extend(['-f', 'best[height<=1080]'])
        cmd.extend(['--', url])

    with open(log_path, 'a') as log_file:
        subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True
        )


@downloads_bp.route('/api/download', methods=['POST'])
@requires_auth
def queue_download():
    try:
        data = request.get_json(silent=True) or {}
        url = data.get('url', '')
        format_type = data.get('format', 'auto')

        if not url:
            return jsonify({
                'success': False,
                'error': 'URL required',
                'message': 'URL required'
            }), 400

        if not url.startswith(('http://', 'https://')):
            return jsonify({
                'success': False,
                'error': 'Invalid URL',
                'message': 'Invalid URL'
            }), 400

        if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url):
            return jsonify({
                'success': False,
                'error': 'Invalid URL',
                'message': 'Invalid URL'
            }), 400

        for mc in SHELL_METACHARS:
            if mc in url:
                return jsonify({
                    'success': False,
                    'error': 'Invalid URL',
                    'message': 'URL contains invalid characters'
                }), 400

        if format_type not in ('audio', 'video', 'auto'):
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': 'Format must be audio, video, or auto'
            }), 400

        user_id = _get_user_id()
        download_id = create_download(url, format_type, user_id)
        _spawn_download_process(url, format_type)

        return jsonify({
            'success': True,
            'id': download_id,
            'message': 'Download queued',
            'url': url
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@downloads_bp.route('/api/downloads', methods=['GET'])
@requires_auth
def list_downloads():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        status = request.args.get('status', 'all')

        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 20
        if per_page > 100:
            per_page = 100

        downloads_list, total = get_downloads(page, per_page, status)

        return jsonify({
            'success': True,
            'downloads': downloads_list,
            'total': total,
            'page': page,
            'per_page': per_page
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@downloads_bp.route('/api/downloads/<int:download_id>', methods=['GET'])
@requires_auth
def get_download_detail(download_id):
    try:
        download = get_download(download_id)
        if not download:
            return jsonify({
                'success': False,
                'error': 'NOT_FOUND',
                'message': 'Download not found'
            }), 404

        return jsonify({
            'success': True,
            'id': download['id'],
            'url': download['url'],
            'format': download.get('format'),
            'status': download['status'],
            'file_path': download.get('file_path'),
            'file_size': download.get('file_size'),
            'error_message': download.get('error_message'),
            'created_at': download.get('created_at'),
            'updated_at': download.get('updated_at'),
            'completed_at': download.get('completed_at')
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@downloads_bp.route('/api/downloads/<int:download_id>', methods=['DELETE'])
@requires_auth
def cancel_download(download_id):
    try:
        download = get_download(download_id)
        if not download:
            return jsonify({
                'success': False,
                'error': 'NOT_FOUND',
                'message': 'Download not found'
            }), 404

        update_download_status(download_id, 'cancelled')
        delete_download(download_id)

        return jsonify({
            'success': True,
            'message': 'Download cancelled'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@downloads_bp.route('/api/downloads/retry/<int:download_id>', methods=['POST'])
@requires_auth
def retry_download(download_id):
    try:
        download = get_download(download_id)
        if not download:
            return jsonify({
                'success': False,
                'error': 'NOT_FOUND',
                'message': 'Download not found'
            }), 404

        if download['status'] not in ('failed', 'cancelled'):
            return jsonify({
                'success': False,
                'error': 'Invalid status',
                'message': 'Only failed or cancelled downloads can be retried'
            }), 400

        update_download_status(download_id, 'queued', error_message=None)
        _spawn_download_process(download['url'], download.get('format', 'auto'))

        return jsonify({
            'success': True,
            'message': 'Download retry queued'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@downloads_bp.route('/api/downloads/history', methods=['DELETE'])
@requires_auth
def clear_history():
    try:
        clear_download_history()
        return jsonify({
            'success': True,
            'message': 'Download history cleared'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500
