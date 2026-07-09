from flask import Blueprint, request, jsonify
import subprocess
import os
import signal
import shutil
import logging
import json as _json

from auth import requires_auth
from config import config
from zdt_paths import ZdtPaths

logger = logging.getLogger(__name__)
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
            result = subprocess.run(['which', cmd], capture_output=True, text=True, timeout=5)
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
                    except Exception as e:
                        logger.warning(f"Failed to SIGTERM pid {pid}: {e}")
            # Wait then force kill
            import time
            time.sleep(1)
            for pid in pids:
                if pid:
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                    except Exception as e:
                        logger.warning(f"Failed to SIGKILL pid {pid}: {e}")
            return True
        
        # Fallback to ps aux
        # Fallback to ps aux (with timeout)
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
                    except Exception as e:
                        logger.warning(f"Failed to SIGTERM pid {parts[1]}: {e}")
        return True
    except Exception as e:
        logger.error(f"Error in _stop_process for {process_name}: {e}")
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
            return jsonify({
                'success': False,
                'error': 'Unknown service',
                'message': f'Unknown service: {service}'
            }), 400
        
        script_name = DAEMON_MAP[service]
        
        if action == 'stop':
            _stop_process(script_name)
            return jsonify({'success': True, 'message': f'{service} daemon stopped'})
        
        elif action == 'start':
            if _is_process_running(script_name):
                return jsonify({'success': True, 'message': f'{service} daemon already running'})
            
            python_bin = _find_python()
            script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), script_name)
            
            if os.path.exists(script_path):
                subprocess.Popen(
                    [python_bin, script_path],
                    start_new_session=True,
                    close_fds=True
                )
                return jsonify({'success': True, 'message': f'{service} daemon started'})
            else:
                return jsonify({
                    'success': False,
                    'error': 'Script not found',
                    'message': f'Script not found: {script_path}'
                }), 404
        
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid action',
                'message': 'Invalid action. Use "start" or "stop".'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@daemon_bp.route('/api/tools', methods=['POST'])
@requires_auth
def server_tools():
    """Execute server tools (clean, compress, demucs, etc.)."""
    try:
        data = request.get_json(silent=True) or {}
        action = data.get('action', '')
        filename = data.get('filename', '')
        subpath = data.get('path', '')
        target_dir = config.get_target_dir()
        log_path = '/tmp/zdt_api_task.log'

        def resolve_path(relative: str) -> str:
            if not relative:
                return target_dir
            full = os.path.join(target_dir, relative)
            real_target = os.path.realpath(target_dir)
            real_full = os.path.realpath(full)
            if os.path.commonpath([real_target, real_full]) != real_target:
                return target_dir
            return real_full

        def find_media_in(folder: str) -> list:
            exts = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}
            result = []
            for root, _, files in os.walk(folder):
                for f in sorted(files):
                    if os.path.splitext(f)[1].lower() in exts:
                        result.append(os.path.join(root, f))
            return result

        if action == 'clean':
            work_dir = resolve_path(subpath)

            def do_clean():
                import re
                with open(log_path, 'a') as logf:
                    for root, _, files in os.walk(work_dir):
                        for f in files:
                            ext = os.path.splitext(f)[1].lower()
                            if ext not in {'.mp3', '.m4a', '.flac', '.wav', '.mp4', '.mkv', '.webm', '.ogg', '.opus'}:
                                continue
                            name, ext = os.path.splitext(f)
                            cleaned = re.sub(r'\s*\[(ZDT|yt)\].*', '', name, flags=re.IGNORECASE)
                            cleaned = re.sub(r'\s*-\s*ZDT\s*$', '', cleaned, flags=re.IGNORECASE)
                            cleaned = re.sub(r'\s*zdt\s*$', '', cleaned, flags=re.IGNORECASE)
                            cleaned = cleaned.strip()
                            if cleaned and cleaned != name:
                                old = os.path.join(root, f)
                                new = os.path.join(root, cleaned + ext)
                                if not os.path.exists(new):
                                    os.rename(old, new)
                                    logf.write(f'Renamed: {f} -> {cleaned + ext}\n')
                    logf.write('Clean task done\n')

            import threading
            t = threading.Thread(target=do_clean, daemon=True)
            t.start()
            return jsonify({'success': True, 'message': 'Clean task started'})

        elif action == 'playlist':
            playlist_path = os.path.join(target_dir, 'ZDT_Playlist.m3u')
            try:
                files = [f for f in os.listdir(target_dir) if f.endswith('.mp3')]
                with open(playlist_path, 'w') as f:
                    for file in sorted(files):
                        f.write(f'{file}\n')
                with open(log_path, 'a') as logf:
                    logf.write(f'Playlist created with {len(files)} files\n')
                return jsonify({'success': True, 'message': f'Playlist created with {len(files)} files'})
            except Exception as e:
                return jsonify({'error': str(e)}), 500

        elif action == 'sync_lyrics':
            work_dir = resolve_path(subpath)

            def do_sync():
                import re
                with open(log_path, 'a') as logf:
                    artist_cache = {}
                    for root, _, files in os.walk(work_dir):
                        for f in sorted(files):
                            if not f.lower().endswith('.mp3'):
                                continue
                            lrc_path = os.path.join(root, os.path.splitext(f)[0] + '.lrc')
                            if os.path.exists(lrc_path):
                                continue
                            try:
                                from mutagen import File as MFile
                                audio = MFile(os.path.join(root, f))
                                if audio is None:
                                    continue
                                tags = audio
                                artist_tag = tags.get('artist') or tags.get('TPE1')
                                artist = str(artist_tag[0]) if artist_tag else ''
                                title_tag = tags.get('title') or tags.get('TIT2')
                                title = str(title_tag[0]) if title_tag else ''
                                if not title:
                                    title = os.path.splitext(f)[0]
                                query = f'{artist} {title}' if artist else title
                                lrc = _fetch_lrc(query, artist_cache)
                                if lrc:
                                    with open(lrc_path, 'w') as lf:
                                        lf.write(lrc)
                                    logf.write(f'Lyrics saved: {os.path.basename(lrc_path)}\n')
                                else:
                                    logf.write(f'No lyrics found: {f}\n')
                            except Exception as e:
                                logf.write(f'Error processing {f}: {e}\n')
                    logf.write('Sync lyrics done\n')

            def _fetch_lrc(query: str, cache: dict) -> str | None:
                import requests
                if query in cache:
                    return cache[query]
                try:
                    r = requests.get(
                        'https://api.lyrics.ovh/v1/' + query.replace(' ', '%20'),
                        timeout=10
                    )
                    if r.status_code == 200 and r.json().get('lyrics'):
                        lyrics = r.json()['lyrics']
                        cache[query] = _make_lrc(lyrics)
                        return cache[query]
                except Exception:
                    pass
                try:
                    r = requests.get(
                        f'https://lrclib.net/api/get?artist_name={requests.utils.quote(query.rsplit(" ", 1)[0])}&track_name={requests.utils.quote(query.rsplit(" ", 1)[-1])}',
                        timeout=10
                    )
                    if r.status_code == 200 and r.json().get('syncedLyrics'):
                        cache[query] = r.json()['syncedLyrics']
                        return cache[query]
                except Exception:
                    pass
                return None

            def _make_lrc(text: str) -> str:
                lines = []
                for i, line in enumerate(text.strip().split('\n')):
                    if not line.strip():
                        continue
                    m, s = divmod(i * 30, 60)
                    lines.append(f'[{m:02d}:{s:02d}.00]{line.strip()}')
                return '\n'.join(lines) + '\n'

            import threading
            t = threading.Thread(target=do_sync, daemon=True)
            t.start()
            return jsonify({'success': True, 'message': 'Lyrics sync started'})

        elif action == 'compress':
            work_dir = resolve_path(subpath)

            def do_compress(file_path: str):
                from werkzeug.utils import secure_filename
                safe_name = secure_filename(os.path.basename(file_path))
                if not safe_name:
                    return
                out_name = f'compressed_{safe_name}'
                output = os.path.join(work_dir, out_name)
                ext = os.path.splitext(safe_name)[1].lower()
                if ext in ('.mp4', '.mkv', '.webm'):
                    cmd = ['ffmpeg', '-i', file_path, '-vcodec', 'libx264', '-crf', '28', output]
                else:
                    cmd = ['ffmpeg', '-i', file_path, '-b:a', '128k', output]
                with open(log_path, 'a') as log_file:
                    subprocess.Popen(
                        cmd,
                        stdout=log_file,
                        stderr=subprocess.STDOUT,
                        start_new_session=True
                    )

            if filename:
                full_path = os.path.join(work_dir, filename)
                real_target = os.path.realpath(work_dir)
                real_file = os.path.realpath(full_path)
                if os.path.commonpath([real_target, real_file]) != real_target:
                    return jsonify({'success': False, 'error': 'Access denied'}), 403
                if not os.path.exists(real_file):
                    return jsonify({'success': False, 'error': 'File not found'}), 404
                do_compress(real_file)
            else:
                for fp in find_media_in(work_dir):
                    do_compress(fp)
            return jsonify({'success': True, 'message': 'Compression started'})

        elif action == 'demucs':
            work_dir = resolve_path(subpath)
            demucs_bin = os.path.expanduser('~/.local/share/zdt/demucs_venv/bin/demucs')
            if not os.path.exists(demucs_bin):
                demucs_bin = shutil.which('demucs')
            if not demucs_bin:
                return jsonify({'error': 'Demucs AI belum terinstal'}), 400

            def do_demucs(file_path: str):
                name_no_ext = os.path.splitext(os.path.basename(file_path))[0]
                ext = os.path.splitext(file_path)[1].lower()
                base_dir = os.path.dirname(file_path)

                def _run_demucs_safe():
                    """Run Demucs safely without shell injection risk."""
                    # Path already validated via resolve_path() using os.path.commonpath()
                    # Double-check: ensure file is within target directory
                    real_target = os.path.realpath(target_dir)
                    real_file = os.path.realpath(file_path)
                    if os.path.commonpath([real_target, real_file]) != real_target:
                        with open(log_path, 'a') as logf:
                            logf.write(f'Error: Path traversal detected: {file_path}\n')
                        return

                    # Step 1: Run demucs
                    import subprocess as _sp
                    demucs_args = [demucs_bin, '--two-stems=vocals', '-o', base_dir, file_path]
                    try:
                        _sp.run(demucs_args, capture_output=True, text=True, timeout=1800)
                    except _sp.TimeoutExpired:
                        with open(log_path, 'a') as logf:
                            logf.write(f'Demucs timeout for: {name_no_ext}\n')
                        return
                    except Exception as e:
                        with open(log_path, 'a') as logf:
                            logf.write(f'Demucs error for {name_no_ext}: {e}\n')
                        return

                    # Step 2: Find output directory
                    import glob as _glob
                    outdir = None
                    for d in [os.path.join(base_dir, 'htdemucs', name_no_ext),
                              os.path.join(base_dir, name_no_ext)]:
                        if os.path.isdir(d):
                            outdir = d
                            break
                    if not outdir:
                        # Search recursively
                        for root, dirs, _ in os.walk(base_dir):
                            for d in dirs:
                                if d == name_no_ext:
                                    outdir = os.path.join(root, d)
                                    break
                            if outdir:
                                break
                    if not outdir:
                        with open(log_path, 'a') as logf:
                            logf.write(f'Demucs output dir not found for: {name_no_ext}\n')
                        return

                    # Step 3: Convert WAV stems to original format
                    stem_map = {'vocals': 'vokal', 'no_vocals': 'novokal'}
                    ffmpeg_opts_map = {
                        '.m4a': ['-c:a', 'aac', '-b:a', '192k'],
                        '.flac': ['-c:a', 'flac'],
                        '.ogg': ['-c:a', 'libvorbis', '-q:a', '3'],
                        '.opus': ['-c:a', 'libopus', '-b:a', '128k'],
                        '.wav': ['-c:a', 'pcm_s16le'],
                    }
                    ffmpeg_opts = ffmpeg_opts_map.get(ext, ['-b:a', '192k'])

                    wav_files = _glob.glob(os.path.join(outdir, '*.wav'))
                    for wav_path in wav_files:
                        stem_name = os.path.splitext(os.path.basename(wav_path))[0]
                        stem_label = stem_map.get(stem_name, stem_name)
                        output_path = os.path.join(base_dir, f'{name_no_ext}_{stem_label}{ext}')
                        ffmpeg_args = ['ffmpeg', '-y', '-i', wav_path] + ffmpeg_opts + [output_path, '-loglevel', 'error']
                        try:
                            _sp.run(ffmpeg_args, capture_output=True, text=True, timeout=300)
                            if os.path.exists(output_path):
                                os.remove(wav_path)
                        except Exception as e:
                            with open(log_path, 'a') as logf:
                                logf.write(f'FFmpeg conversion error for {stem_name}: {e}\n')

                    # Step 4: Cleanup
                    try:
                        shutil.rmtree(outdir)
                    except Exception:
                        pass
                    try:
                        parent_htdemucs = os.path.join(base_dir, 'htdemucs')
                        if os.path.isdir(parent_htdemucs) and not os.listdir(parent_htdemucs):
                            os.rmdir(parent_htdemucs)
                    except Exception:
                        pass

                    with open(log_path, 'a') as logf:
                        logf.write(f'Done: {name_no_ext}_vokal{ext} + {name_no_ext}_novokal{ext}\n')

                t = threading.Thread(target=_run_demucs_safe, daemon=True)
                t.start()

            if filename:
                full_path = os.path.join(work_dir, filename)
                real_target = os.path.realpath(work_dir)
                real_file = os.path.realpath(full_path)
                if os.path.commonpath([real_target, real_file]) != real_target:
                    return jsonify({'error': 'Access denied'}), 403
                if not os.path.exists(real_file):
                    return jsonify({'error': 'File not found'}), 404
                do_demucs(real_file)
            else:
                for fp in find_media_in(work_dir):
                    do_demucs(fp)
            return jsonify({'success': True, 'message': 'Vocal removal started'})

        elif action == 'delete_all':
            work_dir = resolve_path(subpath)

            def do_delete():
                with open(log_path, 'a') as logf:
                    exts = {'.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.mp4', '.mkv', '.webm'}
                    count = 0
                    try:
                        for root, _, files in os.walk(work_dir):
                            for f in files:
                                if os.path.splitext(f)[1].lower() in exts:
                                    os.remove(os.path.join(root, f))
                                    count += 1
                        logf.write(f'Deleted {count} media files\n')
                    except Exception as e:
                        logf.write(f'Delete error: {e}\n')

            import threading
            t = threading.Thread(target=do_delete, daemon=True)
            t.start()
            return jsonify({'success': True, 'message': 'Delete all started'})

        else:
            return jsonify({
                'success': False,
                'error': 'Unknown action',
                'message': f'Unknown action: {action}'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@daemon_bp.route('/api/scheduler/status', methods=['GET'])
@requires_auth
def scheduler_status():
    """Check if scheduler daemon is running (from zdt-web)."""
    try:
        result = subprocess.run(
            ['pgrep', '-f', 'zdt-scheduler.py'],
            capture_output=True, timeout=3
        )
        return jsonify({"running": result.returncode == 0})
    except Exception:
        return jsonify({"running": False})


@daemon_bp.route('/api/scheduler/playlists', methods=['GET'])
@requires_auth
def scheduler_get_playlists():
    """Get scheduled playlist config (from zdt-web)."""
    try:
        config_path = ZdtPaths.get_scheduler_path()
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                return jsonify(_json.load(f))
        return jsonify({"playlists": []})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@daemon_bp.route('/api/scheduler/playlists', methods=['POST'])
@requires_auth
def scheduler_save_playlists():
    """Save playlist schedule config (from zdt-web)."""
    try:
        data = request.get_json(silent=True) or {}
        config_path = ZdtPaths.get_scheduler_path()
        config_dir = ZdtPaths.get_config_dir()
        os.makedirs(config_dir, exist_ok=True)
        with open(config_path, 'w') as f:
            _json.dump(data, f, indent=2)
        return jsonify({"success": True, "message": "Jadwal tersimpan!"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
