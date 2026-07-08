from flask import Blueprint, request, jsonify, g
import os
import subprocess
import shutil
import threading

from auth import requires_auth
from config import config
from database import create_download, get_download, get_downloads, update_download_status, delete_download, clear_download_history
from werkzeug.utils import secure_filename
from zdt_paths import ZdtPaths

downloads_bp = Blueprint('downloads', __name__)

WEB_TASK_LOG_PATH = '/tmp/zdt_web_task.log'

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

        # Cancel: set status to cancelled (keep record for history)
        update_download_status(download_id, 'cancelled')

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
        _spawn_download_process(download['url'], download.get('format') or 'auto')

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


@downloads_bp.route('/api/spotify-sync', methods=['POST'])
@requires_auth
def trigger_spotify_sync():
    """Trigger Spotify playlist sync (from zdt-web)."""
    try:
        data = request.get_json(silent=True) or {}
        url = data.get('url', '')
        if not url or not url.startswith(('http://', 'https://')):
            return jsonify({"success": False, "message": "URL Playlist tidak valid!"}), 400
        zdt_bin = shutil.which("zdt") or ZdtPaths.get_bin_path()
        with open(WEB_TASK_LOG_PATH, "w") as log_file:
            subprocess.Popen([zdt_bin, "--spotify-sync", url], stdout=log_file, stderr=subprocess.STDOUT, start_new_session=True)
        return jsonify({"success": True, "message": "Sinkronisasi Spotify berjalan di background!"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@downloads_bp.route('/api/playlist/items', methods=['POST'])
@requires_auth
def playlist_items():
    """Fetch playlist contents using yt-dlp (from zdt-web)."""
    try:
        data = request.get_json(silent=True) or {}
        url = data.get('url', '')
        if not url:
            return jsonify({"success": False, "message": "URL kosong!"}), 400
        result = subprocess.run(
            ['yt-dlp', '--flat-playlist', '--dump-json', '--no-warnings', url],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return jsonify({"success": False, "message": "Gagal fetch playlist: " + result.stderr[:200]}), 400
        items = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            try:
                import json as _j
                entry = _j.loads(line)
                items.append({
                    "id": entry.get("id", ""),
                    "title": entry.get("title", ""),
                    "artist": entry.get("uploader", entry.get("channel", entry.get("creator", "Unknown"))),
                    "url": f"https://youtube.com/watch?v={entry.get('id', '')}",
                    "duration": entry.get("duration", 0),
                    "index": entry.get("playlist_index", 0)
                })
            except _j.JSONDecodeError:
                continue
        return jsonify({"success": True, "items": items, "count": len(items)})
    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "message": "Timeout: playlist terlalu besar atau yt-dlp lambat."}), 504
    except FileNotFoundError:
        return jsonify({"success": False, "message": "yt-dlp tidak ditemukan di sistem!"}), 500
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@downloads_bp.route('/api/download-selected', methods=['POST'])
@requires_auth
def download_selected():
    """Download multiple URLs sequentially in background thread (from zdt-web)."""
    try:
        data = request.get_json(silent=True) or {}
        urls = data.get('urls', [])
        fmt = data.get('format', 'audio')
        quality = data.get('quality', '')
        if not urls:
            return jsonify({"success": False, "message": "Tidak ada URL dipilih!"}), 400

        zdt_bin = shutil.which("zdt") or ZdtPaths.get_bin_path()
        log_path = WEB_TASK_LOG_PATH
        is_video = fmt == "video"

        def _run_batch():
            with open(log_path, "w") as f:
                f.write(f"[ZDT] Memproses {len(urls)} antrean...\n")
            for i, url in enumerate(urls):
                with open(log_path, "a") as f:
                    f.write(f"\n[{i+1}/{len(urls)}] {url}\n")
                cmd = [zdt_bin, "--download-video" if is_video else "--download-audio", url]
                with open(log_path, "a") as f:
                    try:
                        subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, timeout=600)
                    except subprocess.TimeoutExpired:
                        f.write(f"[{i+1}/{len(urls)}] Timeout\n")
                with open(log_path, "a") as f:
                    f.write(f"[{i+1}/{len(urls)}] Selesai\n")
            with open(log_path, "a") as f:
                f.write(f"\n[ZDT] Batch {len(urls)} antrean selesai!\n")

        threading.Thread(target=_run_batch, daemon=True).start()
        return jsonify({"success": True, "message": f"Memproses {len(urls)} video... Cek Log untuk progres!"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
