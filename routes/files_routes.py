from flask import Blueprint, jsonify, send_file, request, g
import os
import shutil
import subprocess
import logging

from auth import requires_auth
from config import config

logger = logging.getLogger(__name__)
files_bp = Blueprint('files', __name__)

MEDIA_EXTENSIONS = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}


@files_bp.route('/api/files/search', methods=['GET'])
@requires_auth
def search_files():
    """Search files by name with pagination."""
    try:
        target_dir = config.get_target_dir()
        q = request.args.get('q', '').strip()
        file_type = request.args.get('type', '').strip().lower()
        sort = request.args.get('sort', 'name')
        order = request.args.get('order', 'asc')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        if page < 1 or per_page < 1:
            return jsonify({
                'success': False,
                'error': 'Invalid pagination parameters',
                'message': 'Page and per_page must be >= 1'
            }), 400
        per_page = min(per_page, 200)

        if not os.path.exists(target_dir):
            return jsonify({'success': True, 'files': [], 'total': 0, 'page': page, 'per_page': per_page})

        files = []
        for root, _, filenames in os.walk(target_dir):
            for f in filenames:
                ext = os.path.splitext(f)[1].lower()
                if file_type and ext[1:] != file_type:
                    continue
                if q and q.lower() not in f.lower():
                    continue
                rel_path = os.path.relpath(os.path.join(root, f), target_dir)
                full_path = os.path.join(root, f)
                files.append({
                    'name': f,
                    'path': rel_path,
                    'size': os.path.getsize(full_path),
                    'type': ext[1:] if ext else 'file',
                    'modified': os.path.getmtime(full_path)
                })

        reverse = order == 'desc'
        if sort == 'name':
            files.sort(key=lambda x: x['name'].lower(), reverse=reverse)
        elif sort == 'size':
            files.sort(key=lambda x: x['size'], reverse=reverse)
        elif sort == 'modified':
            files.sort(key=lambda x: x['modified'], reverse=reverse)
        elif sort == 'type':
            files.sort(key=lambda x: x['type'], reverse=reverse)
        else:
            files.sort(key=lambda x: x['name'].lower(), reverse=reverse)

        total = len(files)
        start = (page - 1) * per_page
        end = start + per_page
        paginated_files = files[start:end]

        return jsonify({
            'success': True,
            'files': paginated_files,
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


@files_bp.route('/api/files', methods=['GET'])
@requires_auth
def get_files():
    """List media files in target directory."""
    try:
        target_dir = config.get_target_dir()
        req_dir = request.args.get('dir', '')
        if req_dir:
            scan_dir = os.path.join(target_dir, req_dir)
            real_target = os.path.realpath(target_dir)
            real_scan = os.path.realpath(scan_dir)
            if os.path.commonpath([real_target, real_scan]) != real_target:
                return jsonify({
                    'success': False,
                    'error': 'Access denied',
                    'message': 'Access denied'
                }), 403
        else:
            scan_dir = target_dir
            
        if not os.path.exists(scan_dir):
            return jsonify({'success': True, 'files': [], 'path': scan_dir})

        files = []
        MAX_FILES = 5000
        for root, _, filenames in os.walk(scan_dir):
            for f in sorted(filenames):
                if len(files) >= MAX_FILES:
                    break
                rel_path = os.path.relpath(os.path.join(root, f), target_dir)
                full_path = os.path.join(root, f)
                ext = os.path.splitext(f)[1].lower()
                files.append({
                    'name': f,
                    'path': rel_path,
                    'size': os.path.getsize(full_path),
                    'type': ext[1:] if ext else 'file',
                    'modified': os.path.getmtime(full_path)
                })
            if len(files) >= MAX_FILES:
                break
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        sort = request.args.get('sort', 'name')

        if page < 1 or per_page < 1:
            return jsonify({
                'success': False,
                'error': 'Invalid pagination parameters',
                'message': 'Page and per_page must be >= 1'
            }), 400

        per_page = min(per_page, 200)

        sort_key = None
        if sort == 'name':
            sort_key = lambda x: x['name'].lower()
        elif sort == 'size':
            sort_key = lambda x: x['size']
        elif sort == 'modified':
            sort_key = lambda x: x['modified']
        elif sort == 'type':
            sort_key = lambda x: x['type']
        else:
            sort_key = lambda x: x['name'].lower()

        files.sort(key=sort_key)

        start = (page - 1) * per_page
        end = start + per_page
        paginated_files = files[start:end]

        return jsonify({'success': True, 'files': paginated_files, 'path': scan_dir})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/files/browse', methods=['GET'])
@requires_auth
def browse_files():
    """Browse files and folders in a directory (flat, non-recursive).

    Query params:
      dir    - subdirectory relative to base
      scope  - 'media' (default, locked under target_dir) or 'system' (full /, admin only)
    """
    try:
        scope = request.args.get('scope', 'media')
        req_dir = request.args.get('dir', '')

        if scope == 'system':
            user = g.get('user', {})
            if not user or user.get('role') not in ('admin', 'superadmin'):
                return jsonify({'success': False, 'error': 'Admin only'}), 403
            full_scan = os.path.join('/', req_dir.lstrip('/')) if req_dir else '/'
            real_scan = os.path.realpath(full_scan)
            if os.path.commonpath([os.path.realpath('/'), real_scan]) != os.path.realpath('/'):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
            scan_dir = real_scan
            path_val = full_scan.rstrip('/') if full_scan != '/' else ''
            parent_val = os.path.dirname(full_scan.rstrip('/')) if full_scan.rstrip('/') else None
            if parent_val == os.path.sep:
                parent_val = None
        else:
            target_dir = config.get_target_dir()
            if req_dir:
                scan_dir = os.path.join(target_dir, req_dir)
                real_target = os.path.realpath(target_dir)
                real_scan = os.path.realpath(scan_dir)
                if os.path.commonpath([real_target, real_scan]) != real_target:
                    return jsonify({'success': False, 'error': 'Access denied'}), 403
            else:
                scan_dir = target_dir
            path_val = os.path.relpath(scan_dir, target_dir) if scan_dir != target_dir else ''
            parent_val = os.path.relpath(os.path.dirname(scan_dir), target_dir) if scan_dir != target_dir else None

        if not os.path.exists(scan_dir):
            return jsonify({'success': True, 'files': [], 'folders': [], 'path': scan_dir})

        entries = os.listdir(scan_dir)
        folders = []
        files = []
        for entry in sorted(entries):
            full = os.path.join(scan_dir, entry)
            entry_rel = os.path.join(path_val, entry) if path_val else entry
            if os.path.isdir(full):
                folders.append({'name': entry, 'path': entry_rel})
            elif os.path.isfile(full):
                ext = os.path.splitext(entry)[1].lower()
                files.append({
                    'name': entry,
                    'path': entry_rel,
                    'size': os.path.getsize(full),
                    'type': ext[1:],
                    'modified': os.path.getmtime(full),
                })

        return jsonify({
            'success': True,
            'files': files,
            'folders': folders,
            'path': path_val,
            'parent': parent_val,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@files_bp.route('/api/files/mkdir', methods=['POST'])
@requires_auth
def create_directory():
    """Create a subdirectory. Accepts scope (media|system) and dir (current dir context)."""
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({'success': False, 'error': 'Name required'}), 400

        scope = data.get('scope', 'media')
        name = data['name'].strip()
        if not name:
            return jsonify({'success': False, 'error': 'Name cannot be empty'}), 400

        if scope == 'system':
            user = g.get('user', {})
            if not user or user.get('role') not in ('admin', 'superadmin'):
                return jsonify({'success': False, 'error': 'Admin only'}), 403
            current_dir = data.get('dir', '').strip('/')
            full_path = os.path.join('/', current_dir, name) if current_dir else os.path.join('/', name)
            real_path = os.path.realpath(full_path)
            if os.path.commonpath([os.path.realpath('/'), real_path]) != os.path.realpath('/'):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
        else:
            target_dir = config.get_target_dir()
            full_path = os.path.join(target_dir, name)
            real_target = os.path.realpath(target_dir)
            real_path = os.path.realpath(full_path)
            if os.path.commonpath([real_target, real_path]) != real_target:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

        os.makedirs(full_path, exist_ok=True)
        return jsonify({'success': True, 'message': 'Directory created'}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@files_bp.route('/api/files/rename', methods=['POST'])
@requires_auth
def rename_file():
    """Rename a file or directory. Accepts scope (media|system)."""
    try:
        data = request.get_json()
        if not data or 'path' not in data or 'new_name' not in data:
            return jsonify({'success': False, 'error': 'Path and new_name required'}), 400

        scope = data.get('scope', 'media')
        path = data.get('path', '').strip()
        new_name = data.get('new_name', '').strip()
        if not path or not new_name:
            return jsonify({'success': False, 'error': 'Path and new_name required'}), 400

        if scope == 'system':
            user = g.get('user', {})
            if not user or user.get('role') not in ('admin', 'superadmin'):
                return jsonify({'success': False, 'error': 'Admin only'}), 403
            source_full = os.path.join('/', path.lstrip('/'))
            real_source = os.path.realpath(source_full)
            if os.path.commonpath([os.path.realpath('/'), real_source]) != os.path.realpath('/'):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
            parent_dir = os.path.dirname(real_source)
            dest_full = os.path.join(parent_dir, new_name)
            real_dest = os.path.realpath(dest_full)
            if os.path.commonpath([os.path.realpath('/'), real_dest]) != os.path.realpath('/'):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
        else:
            target_dir = config.get_target_dir()
            source_full = os.path.join(target_dir, path)
            real_target = os.path.realpath(target_dir)
            real_source = os.path.realpath(source_full)
            if os.path.commonpath([real_target, real_source]) != real_target:
                return jsonify({'success': False, 'error': 'Access denied'}), 403
            parent_dir = os.path.dirname(real_source)
            dest_full = os.path.join(parent_dir, new_name)
            real_dest = os.path.realpath(dest_full)
            if os.path.commonpath([real_target, real_dest]) != real_target:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

        if not os.path.exists(real_source):
            return jsonify({'success': False, 'error': 'Not found'}), 404
        if os.path.exists(real_dest):
            return jsonify({'success': False, 'error': 'Already exists'}), 409

        os.rename(real_source, real_dest)
        return jsonify({'success': True, 'message': 'Renamed'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@files_bp.route('/api/files/delete', methods=['POST'])
@requires_auth
def delete_item():
    """Delete a file or directory. Accepts scope (media|system)."""
    try:
        data = request.get_json()
        if not data or 'path' not in data:
            return jsonify({'success': False, 'error': 'Path required'}), 400

        scope = data.get('scope', 'media')
        path = data['path'].strip()
        if not path:
            return jsonify({'success': False, 'error': 'Path required'}), 400

        if scope == 'system':
            user = g.get('user', {})
            if not user or user.get('role') not in ('admin', 'superadmin'):
                return jsonify({'success': False, 'error': 'Admin only'}), 403
            full_path = os.path.join('/', path.lstrip('/'))
            real_path = os.path.realpath(full_path)
            if os.path.commonpath([os.path.realpath('/'), real_path]) != os.path.realpath('/'):
                return jsonify({'success': False, 'error': 'Access denied'}), 403
        else:
            target_dir = config.get_target_dir()
            full_path = os.path.join(target_dir, path)
            real_target = os.path.realpath(target_dir)
            real_path = os.path.realpath(full_path)
            if os.path.commonpath([real_target, real_path]) != real_target:
                return jsonify({'success': False, 'error': 'Access denied'}), 403

        if not os.path.exists(real_path):
            return jsonify({'success': False, 'error': 'Not found'}), 404

        if os.path.isdir(real_path):
            shutil.rmtree(real_path)
        else:
            os.remove(real_path)
        return jsonify({'success': True, 'message': 'Deleted'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@files_bp.route('/api/files/info/<path:filename>', methods=['GET'])
@requires_auth
def file_info(filename):
    """Get file metadata."""
    try:
        target_dir = config.get_target_dir()
        full_path = os.path.join(target_dir, filename)
        real_target = os.path.realpath(target_dir)
        real_file = os.path.realpath(full_path)
        if os.path.commonpath([real_target, real_file]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403

        if not os.path.exists(real_file):
            return jsonify({
                'success': False,
                'error': 'File not found',
                'message': 'File not found'
            }), 404

        size = os.path.getsize(real_file)
        modified = os.path.getmtime(real_file)

        duration = None
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                 '-of', 'default=noprint_wrappers=1:nokey=1', real_file],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0 and result.stdout.strip():
                duration = float(result.stdout.strip())
        except Exception:
            duration = None

        return jsonify({
            'success': True,
            'size': size,
            'modified': modified,
            'duration': duration
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/stream/<path:filename>', methods=['GET'])
@requires_auth
def stream_file(filename):
    """Stream a media file."""
    try:
        target_dir = config.get_target_dir()
        
        # Prevent path traversal
        full_path = os.path.join(target_dir, filename)
        real_target = os.path.realpath(target_dir)
        real_file = os.path.realpath(full_path)
        if os.path.commonpath([real_target, real_file]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403
        
        if not os.path.exists(real_file):
            return jsonify({
                'success': False,
                'error': 'File not found',
                'message': 'File not found'
            }), 404
        
        return send_file(real_file, conditional=True)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/dl/<path:filename>', methods=['GET'])
@requires_auth
def download_file(filename):
    """Download a file (binary stream to mobile storage)."""
    try:
        target_dir = config.get_target_dir()
        
        # Prevent path traversal
        full_path = os.path.join(target_dir, filename)
        real_target = os.path.realpath(target_dir)
        real_file = os.path.realpath(full_path)
        if os.path.commonpath([real_target, real_file]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403
        
        if not os.path.exists(real_file):
            return jsonify({
                'success': False,
                'error': 'File not found',
                'message': 'File not found'
            }), 404
        
        return send_file(
            real_file,
            as_attachment=True,
            download_name=os.path.basename(filename)
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/upload', methods=['POST'])
@requires_auth
def upload_file():
    """Upload file from mobile to server (temporary processing)."""
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded',
                'message': 'No file uploaded'
            }), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'message': 'No file selected'
            }), 400
        
        # Use original filename (no mangling)
        filename = file.filename
        if not filename:
            return jsonify({
                'success': False,
                'error': 'Invalid file name',
                'message': 'Invalid file name'
            }), 400

        # Prevent path traversal
        filename = os.path.basename(filename)
            
        target_dir = config.get_target_dir()
        os.makedirs(target_dir, exist_ok=True)
        filepath = os.path.join(target_dir, filename)
        
        if os.path.exists(filepath):
            return jsonify({
                'success': False,
                'error': 'File exists',
                'message': 'A file with that name already exists'
            }), 409
            
        file.save(filepath)
        
        return jsonify({'success': True, 'filename': filename})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/metadata', methods=['POST'])
@requires_auth
def update_metadata():
    """Update audio file metadata (title/artist).
    Ported from zdt-web.py for unified API."""
    try:
        import mutagen
        from mutagen.easyid3 import EasyID3
        from mutagen.mp4 import MP4
        from mutagen.flac import FLAC
    except ImportError:
        return jsonify({"success": False, "message": "Mutagen belum terinstall."}), 400

    data = request.get_json(silent=True) or {}
    filename = data.get('filename')
    title = data.get('title')
    artist = data.get('artist')
    if not filename:
        return jsonify({"success": False, "message": "Pilih file."}), 400
    if not title and not artist:
        return jsonify({"success": False, "message": "Isi minimal title atau artist."}), 400

    target_dir = config.get_target_dir()
    filepath = os.path.realpath(os.path.join(target_dir, filename))
    real_target = os.path.realpath(target_dir)
    if os.path.commonpath([real_target, filepath]) != real_target:
        return jsonify({"success": False, "message": "Akses ditolak."}), 403
    if not os.path.exists(filepath):
        return jsonify({"success": False, "message": "File tidak ditemukan."}), 404

    try:
        ext = filepath.lower()
        if ext.endswith('.mp3'):
            audio = EasyID3(filepath)
            if title: audio["title"] = title
            if artist: audio["artist"] = artist
            audio.save()
        elif ext.endswith('.m4a'):
            audio = MP4(filepath)
            if title: audio.tags["\xa9nam"] = title
            if artist: audio.tags["\xa9ART"] = artist
            audio.save()
        elif ext.endswith('.flac'):
            audio = FLAC(filepath)
            if title: audio["title"] = title
            if artist: audio["artist"] = artist
            audio.save()
        else:
            return jsonify({"success": False, "message": "Format file tidak didukung. Gunakan MP3, M4A, atau FLAC."}), 400
        return jsonify({"success": True, "message": "Metadata berhasil diubah."})
    except Exception as e:
        logger.error(f"Metadata error: {str(e)}")
        return jsonify({"success": False, "message": "Gagal memproses file"}), 500


@files_bp.route('/api/files/<path:filename>', methods=['DELETE'])
@requires_auth
def delete_file(filename):
    """Delete a media file."""
    try:
        target_dir = config.get_target_dir()
        
        # Prevent path traversal
        full_path = os.path.join(target_dir, filename)
        real_target = os.path.realpath(target_dir)
        real_file = os.path.realpath(full_path)
        if os.path.commonpath([real_target, real_file]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403
        
        if not os.path.exists(real_file):
            return jsonify({
                'success': False,
                'error': 'File not found',
                'message': 'File not found'
            }), 404
            
        if os.path.isdir(real_file):
            shutil.rmtree(real_file)
        else:
            os.remove(real_file)
            
        return jsonify({'success': True, 'message': 'File deleted'})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500
