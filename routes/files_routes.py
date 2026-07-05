from flask import Blueprint, jsonify, send_file, request
import os

from auth import requires_auth
from config import config

files_bp = Blueprint('files', __name__)

MEDIA_EXTENSIONS = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}


@files_bp.route('/api/files', methods=['GET'])
@requires_auth
def get_files():
    """List media files in target directory."""
    try:
        target_dir = config.get_target_dir()
        if not os.path.exists(target_dir):
            return jsonify({'files': [], 'path': target_dir})
        
        files = []
        for root, _, filenames in os.walk(target_dir):
            for f in sorted(filenames):
                ext = os.path.splitext(f)[1].lower()
                if ext in MEDIA_EXTENSIONS:
                    rel_path = os.path.relpath(os.path.join(root, f), target_dir)
                    full_path = os.path.join(root, f)
                    size = os.path.getsize(full_path)
                    files.append({
                        'name': f,
                        'path': rel_path,
                        'size': size,
                        'type': ext[1:],
                        'modified': os.path.getmtime(full_path)
                    })
        
        return jsonify({'files': files, 'path': target_dir})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@files_bp.route('/api/stream/<path:filename>', methods=['GET'])
@requires_auth
def stream_file(filename):
    """Stream a media file."""
    try:
        target_dir = config.get_target_dir()
        
        # Prevent path traversal
        full_path = os.path.normpath(os.path.join(target_dir, filename))
        if not full_path.startswith(os.path.normpath(target_dir)):
            return jsonify({'error': 'Access denied'}), 403
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(full_path, conditional=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@files_bp.route('/api/dl/<path:filename>', methods=['GET'])
@requires_auth
def download_file(filename):
    """Download a file (binary stream to mobile storage)."""
    try:
        target_dir = config.get_target_dir()
        
        # Prevent path traversal
        full_path = os.path.normpath(os.path.join(target_dir, filename))
        if not full_path.startswith(os.path.normpath(target_dir)):
            return jsonify({'error': 'Access denied'}), 403
        
        if not os.path.exists(full_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(
            full_path,
            as_attachment=True,
            download_name=os.path.basename(filename)
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@files_bp.route('/api/upload', methods=['POST'])
@requires_auth
def upload_file():
    """Upload file from mobile to server (temporary processing)."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Save to target directory
        target_dir = config.get_target_dir()
        os.makedirs(target_dir, exist_ok=True)
        filepath = os.path.join(target_dir, file.filename)
        file.save(filepath)
        
        return jsonify({'success': True, 'filename': file.filename})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
