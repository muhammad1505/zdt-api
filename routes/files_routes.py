from flask import Blueprint, jsonify, send_file, request
import os
import shutil
import subprocess

from auth import requires_auth
from config import config

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
        for root, _, filenames in os.walk(scan_dir):
            for f in sorted(filenames):
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
    """Browse files and folders in a directory (flat, non-recursive)."""
    try:
        target_dir = config.get_target_dir()
        req_dir = request.args.get('dir', '')
        if req_dir:
            scan_dir = os.path.join(target_dir, req_dir)
            real_target = os.path.realpath(target_dir)
            real_scan = os.path.realpath(scan_dir)
            if os.path.commonpath([real_target, real_scan]) != real_target:
                return jsonify({'success': False, 'error': 'Access denied'}), 403
        else:
            scan_dir = target_dir

        if not os.path.exists(scan_dir):
            return jsonify({'success': True, 'files': [], 'folders': [], 'path': scan_dir})

        entries = os.listdir(scan_dir)
        folders = []
        files = []
        for entry in sorted(entries):
            full = os.path.join(scan_dir, entry)
            rel = os.path.relpath(full, target_dir)
            if os.path.isdir(full):
                folders.append({'name': entry, 'path': rel})
            elif os.path.isfile(full):
                ext = os.path.splitext(entry)[1].lower()
                files.append({
                    'name': entry,
                    'path': rel,
                    'size': os.path.getsize(full),
                    'type': ext[1:],
                    'modified': os.path.getmtime(full),
                })

        return jsonify({
            'success': True,
            'files': files,
            'folders': folders,
            'path': os.path.relpath(scan_dir, target_dir) if scan_dir != target_dir else '',
            'parent': os.path.relpath(os.path.dirname(scan_dir), target_dir) if scan_dir != target_dir else None,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@files_bp.route('/api/files/mkdir', methods=['POST'])
@requires_auth
def create_directory():
    """Create a subdirectory."""
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({
                'success': False,
                'error': 'Bad request',
                'message': 'Name is required'
            }), 400

        name = data['name'].strip()
        if not name:
            return jsonify({
                'success': False,
                'error': 'Bad request',
                'message': 'Name cannot be empty'
            }), 400

        target_dir = config.get_target_dir()
        full_path = os.path.join(target_dir, name)
        real_target = os.path.realpath(target_dir)
        real_path = os.path.realpath(full_path)
        if os.path.commonpath([real_target, real_path]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403

        os.makedirs(full_path, exist_ok=True)
        return jsonify({'success': True, 'message': 'Directory created'}), 201
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@files_bp.route('/api/files/rename', methods=['POST'])
@requires_auth
def rename_file():
    """Rename a file or directory."""
    try:
        data = request.get_json()
        if not data or 'path' not in data or 'new_name' not in data:
            return jsonify({
                'success': False,
                'error': 'Bad request',
                'message': 'Path and new_name are required'
            }), 400

        target_dir = config.get_target_dir()

        source_full = os.path.join(target_dir, data['path'])
        real_target = os.path.realpath(target_dir)
        real_source = os.path.realpath(source_full)
        if os.path.commonpath([real_target, real_source]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403

        if not os.path.exists(real_source):
            return jsonify({
                'success': False,
                'error': 'File not found',
                'message': 'File not found'
            }), 404

        dest_dir = os.path.dirname(real_source)
        dest_full = os.path.join(dest_dir, data['new_name'])
        real_dest = os.path.realpath(dest_full)
        if os.path.commonpath([real_target, real_dest]) != real_target:
            return jsonify({
                'success': False,
                'error': 'Access denied',
                'message': 'Access denied'
            }), 403

        if os.path.exists(real_dest):
            return jsonify({
                'success': False,
                'error': 'Conflict',
                'message': 'A file with that name already exists'
            }), 409

        os.rename(real_source, real_dest)
        return jsonify({'success': True, 'message': 'Renamed successfully'})
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


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
