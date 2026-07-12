import sqlite3
import os
import sys
import threading
import time
import json
import signal
import logging
import subprocess
from datetime import datetime, timezone
from typing import Optional, Callable, Any

logger = logging.getLogger('zdt-api.task_queue')

MAX_CONCURRENT = 3
MAX_PER_USER = 3
POLL_INTERVAL = 1.0

_task_manager = None

class TaskManager:
    def __init__(self, db_path: str, max_concurrent: int = MAX_CONCURRENT, max_per_user: int = MAX_PER_USER):
        self.db_path = db_path
        self.max_concurrent = max_concurrent
        self.max_per_user = max_per_user
        self._running_tasks: dict[int, subprocess.Popen] = {}
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._on_task_update: Optional[Callable] = None

    # --- Hooks ---
    def on_task_update(self, callback: Callable[[dict], None]):
        self._on_task_update = callback

    def _notify(self, task: dict):
        if self._on_task_update:
            try:
                self._on_task_update(task)
            except Exception as e:
                logger.error(f"Notification hook error: {e}")
        try:
            from events import get_event_bus
            get_event_bus().emit_task_update(task)
        except Exception as e:
            logger.error(f"Event bus notify error: {e}")

    # --- DB helpers ---
    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def _init_table(self):
        conn = self._get_conn()
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS task_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                priority INTEGER NOT NULL DEFAULT 1,
                user_id INTEGER DEFAULT NULL,
                chat_id INTEGER DEFAULT NULL,
                source TEXT DEFAULT 'api',
                url TEXT DEFAULT '',
                params TEXT DEFAULT '{}',
                progress INTEGER DEFAULT 0,
                progress_message TEXT DEFAULT '',
                pid INTEGER DEFAULT NULL,
                error_message TEXT DEFAULT '',
                file_path TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_tq_status ON task_queue(status);
            CREATE INDEX IF NOT EXISTS idx_tq_priority ON task_queue(priority, created_at);
            CREATE INDEX IF NOT EXISTS idx_tq_user ON task_queue(user_id, status);
        ''')
        conn.commit()
        conn.close()

    def create_task(self, task_type: str, url: str = '', params: dict = None,
                    user_id: int = None, chat_id: int = None, source: str = 'api',
                    priority: int = 1) -> int:
        conn = self._get_conn()
        cur = conn.execute(
            '''INSERT INTO task_queue (type, url, params, user_id, chat_id, source, priority)
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (task_type, url, json.dumps(params or {}), user_id, chat_id, source, priority)
        )
        conn.commit()
        task_id = cur.lastrowid
        conn.close()
        logger.info(f"Task {task_id} created: {task_type} user={user_id}")
        return task_id

    def get_task(self, task_id: int) -> Optional[dict]:
        conn = self._get_conn()
        row = conn.execute('SELECT * FROM task_queue WHERE id = ?', (task_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    def list_tasks(self, status: str = None, user_id: int = None,
                   limit: int = 50, offset: int = 0) -> list[dict]:
        conn = self._get_conn()
        where = []
        params = []
        if status:
            where.append('status = ?')
            params.append(status)
        if user_id is not None:
            where.append('user_id = ?')
            params.append(user_id)
        where_sql = ' AND '.join(where) if where else '1'
        rows = conn.execute(
            f'SELECT * FROM task_queue WHERE {where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?',
            params + [limit, offset]
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def update_task(self, task_id: int, **kwargs):
        conn = self._get_conn()
        sets = []
        params = []
        for k, v in kwargs.items():
            sets.append(f'{k} = ?')
            params.append(v)
        params.append(task_id)
        conn.execute(f'UPDATE task_queue SET {", ".join(sets)} WHERE id = ?', params)
        conn.commit()
        conn.close()

    def cancel_task(self, task_id: int) -> bool:
        task = self.get_task(task_id)
        if not task:
            return False
        if task['status'] not in ('queued', 'running'):
            return False
        if task['status'] == 'running':
            pid = task.get('pid')
            if pid:
                try:
                    os.kill(pid, signal.SIGTERM)
                    kill_thread = threading.Timer(5.0, self._force_kill, [task_id, pid])
                    kill_thread.daemon = True
                    kill_thread.start()
                except (OSError, ProcessLookupError):
                    pass
                with self._lock:
                    self._running_tasks.pop(task_id, None)
        self.update_task(task_id, status='cancelled', completed_at=datetime.now(timezone.utc).isoformat())
        logger.info(f"Task {task_id} cancelled")
        return True

    def _force_kill(self, task_id: int, pid: int):
        try:
            os.kill(pid, signal.SIGKILL)
            logger.warning(f"Task {task_id} force killed (SIGKILL pid={pid})")
        except (OSError, ProcessLookupError):
            pass

    def get_queue_stats(self) -> dict:
        conn = self._get_conn()
        queued = conn.execute("SELECT COUNT(*) FROM task_queue WHERE status = 'queued'").fetchone()[0]
        running = conn.execute("SELECT COUNT(*) FROM task_queue WHERE status = 'running'").fetchone()[0]
        completed = conn.execute("SELECT COUNT(*) FROM task_queue WHERE status = 'completed'").fetchone()[0]
        failed = conn.execute("SELECT COUNT(*) FROM task_queue WHERE status = 'failed'").fetchone()[0]
        cancelled = conn.execute("SELECT COUNT(*) FROM task_queue WHERE status = 'cancelled'").fetchone()[0]
        conn.close()
        return {
            'queued': queued,
            'running': running,
            'completed': completed,
            'failed': failed,
            'cancelled': cancelled,
            'total': queued + running + completed + failed + cancelled
        }

    def delete_task(self, task_id: int) -> bool:
        conn = self._get_conn()
        row = conn.execute('SELECT id FROM task_queue WHERE id = ?', (task_id,)).fetchone()
        if not row:
            conn.close()
            return False
        conn.execute('DELETE FROM task_queue WHERE id = ?', (task_id,))
        conn.commit()
        conn.close()
        self._notify_task_event(task_id, 'deleted')
        return True

    def _notify_task_event(self, task_id: int, event_type: str):
        try:
            from events import get_event_bus
            bus = get_event_bus()
            bus.emit('task_update', {'id': task_id, 'type': event_type, 'status': event_type})
        except Exception:
            pass

    def cleanup_old(self, hours: int = 72):
        conn = self._get_conn()
        conn.execute(
            "DELETE FROM task_queue WHERE status IN ('completed','failed','cancelled') AND created_at < datetime('now', ?)",
            (f'-{hours} hours',)
        )
        conn.commit()
        conn.close()

    # --- Worker ---
    def _next_task(self) -> Optional[dict]:
        conn = self._get_conn()
        row = conn.execute(
            '''SELECT * FROM task_queue
               WHERE status = 'queued'
               ORDER BY priority ASC, created_at ASC
               LIMIT 1'''
        ).fetchone()
        conn.close()
        return dict(row) if row else None

    def _claim_task(self, task_id: int) -> bool:
        conn = self._get_conn()
        cur = conn.execute(
            "UPDATE task_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'",
            (datetime.now(timezone.utc).isoformat(), task_id)
        )
        conn.commit()
        affected = cur.rowcount
        conn.close()
        return affected > 0

    def _worker_loop(self):
        while not self._stop_event.is_set():
            try:
                with self._lock:
                    running_count = len(self._running_tasks)
                if running_count >= self.max_concurrent:
                    time.sleep(POLL_INTERVAL)
                    continue
                task = self._next_task()
                if not task:
                    time.sleep(POLL_INTERVAL)
                    continue
                if not self._claim_task(task['id']):
                    continue
                task_data = self.get_task(task['id'])
                if task_data:
                    self._notify(task_data)
                threading.Thread(target=self._execute_task, args=[task['id']], daemon=True).start()
            except Exception as e:
                logger.error(f"Worker error: {e}")
                time.sleep(POLL_INTERVAL)

    def _execute_task(self, task_id: int):
        task = self.get_task(task_id)
        if not task:
            return
        try:
            self._run_task(task)
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            self.update_task(task_id, status='failed', error_message=str(e),
                             completed_at=datetime.now(timezone.utc).isoformat())
            task = self.get_task(task_id)
            if task:
                self._notify(task)
        finally:
            with self._lock:
                self._running_tasks.pop(task_id, None)

    def _run_task(self, task: dict):
        task_id = task['id']
        task_type = task['type']
        url = task.get('url', '')
        params = json.loads(task.get('params', '{}'))
        logger.info(f"Running task {task_id}: {task_type} url={url}")

        if task_type in ('download_audio', 'download_video'):
            self._run_download(task_id, task_type, url, params)
        elif task_type == 'demucs':
            self._run_demucs(task_id, params)
        elif task_type == 'sync_lirik':
            self._run_sync(task_id, params)
        elif task_type == 'kompres':
            self._run_kompres(task_id, params)
        else:
            self.update_task(task_id, status='failed', error_message=f'Unknown task type: {task_type}',
                             completed_at=datetime.now(timezone.utc).isoformat())
            task = self.get_task(task_id)
            if task:
                self._notify(task)

    def _run_download(self, task_id: int, task_type: str, url: str, params: dict):
        is_video = task_type == 'download_video'
        yt_dlp = shutil_which('yt-dlp') or os.path.expanduser('~/.local/bin/yt-dlp')
        output_tpl = os.path.join(params.get('target_dir', os.path.expanduser('~/Music/ZDT_Downloads')), '%(title)s.%(ext)s')
        cmd = [yt_dlp, '-o', output_tpl, '--newline', '--no-warnings', '--ignore-errors']

        quality = params.get('quality', '')
        vfmt = params.get('video_format', '')
        if is_video:
            if quality:
                cmd.extend(['-f', f'bestvideo[height<={quality}]+bestaudio/best[height<={quality}])'])
            if vfmt and vfmt != 'mp4':
                cmd.extend(['--merge-output-format', vfmt])
        else:
            afmt = params.get('audio_format', 'mp3')
            bitrate = params.get('bitrate', '128')
            cmd.extend(['-x', '--audio-format', afmt, '--audio-quality', bitrate])

        cmd.extend(['--', url])
        self._run_process(task_id, cmd, 'download')

    def _run_demucs(self, task_id: int, params: dict):
        filepath = params.get('filepath', '')
        if not filepath or not os.path.exists(filepath):
            self.update_task(task_id, status='failed', error_message='File not found',
                             completed_at=datetime.now(timezone.utc).isoformat())
            return
        zdt_bin = shutil_which('zdt') or os.path.expanduser('~/.local/bin/zdt')
        cmd = [zdt_bin, '--extract-vocal', filepath]
        self._run_process(task_id, cmd, 'demucs')

    def _run_sync(self, task_id: int, params: dict):
        filepath = params.get('filepath', '')
        if not filepath or not os.path.exists(filepath):
            self.update_task(task_id, status='failed', error_message='File not found',
                             completed_at=datetime.now(timezone.utc).isoformat())
            return
        import syncedlyrics
        filename_noext = os.path.splitext(os.path.basename(filepath))[0]
        lrc_path = os.path.splitext(filepath)[0] + '.lrc'
        import re as _re
        query = _re.sub(r'\s*\([^)]*\)\s*', '', filename_noext)
        query = _re.sub(r'\s*\[[^]]*\]\s*', '', query)
        query = _re.sub(r'\s*-\s*', ' ', query).strip()
        lrc = syncedlyrics.search(query, plain_only=True, save_path=lrc_path)
        if lrc:
            self.update_task(task_id, status='completed', progress=100, progress_message='Sync berhasil',
                             file_path=lrc_path, completed_at=datetime.now(timezone.utc).isoformat())
        else:
            self.update_task(task_id, status='failed', error_message='Lirik tidak ditemukan',
                             completed_at=datetime.now(timezone.utc).isoformat())
        task = self.get_task(task_id)
        if task:
            self._notify(task)

    def _run_kompres(self, task_id: int, params: dict):
        filepath = params.get('filepath', '')
        if not filepath or not os.path.exists(filepath):
            self.update_task(task_id, status='failed', error_message='File not found',
                             completed_at=datetime.now(timezone.utc).isoformat())
            return
        zdt_bin = shutil_which('zdt') or os.path.expanduser('~/.local/bin/zdt')
        cmd = [zdt_bin, '--kompres-media', filepath]
        self._run_process(task_id, cmd, 'kompres')

    def _run_process(self, task_id: int, cmd: list, task_label: str):
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, bufsize=1)
        with self._lock:
            self._running_tasks[task_id] = process
        self.update_task(task_id, pid=process.pid)

        last_update = time.time()
        log_buffer = []
        ansi_escape = __import__('re').compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')

        for line in iter(process.stdout.readline, ''):
            if not line:
                break
            clean = ansi_escape.sub('', line).strip()
            if not clean:
                continue
            if log_buffer and clean.startswith('[download]') and log_buffer[-1].startswith('[download]'):
                log_buffer[-1] = clean
            else:
                log_buffer.append(clean)
            log_buffer = log_buffer[-6:]

            pct_match = __import__('re').search(r'(\d+\.?\d*)%', clean)
            if pct_match:
                progress = int(float(pct_match.group(1)))
                if time.time() - last_update > 2.0:
                    self.update_task(task_id, progress=progress, progress_message=clean.strip())
                    last_update = time.time()

        process.wait()
        final_context = '\n'.join(log_buffer)

        if process.returncode == 0:
            dl_path = None
            dest_match = __import__('re').search(r'Destination:\s*(.+)', final_context, __import__('re').IGNORECASE)
            if dest_match:
                dl_path = dest_match.group(1).strip().strip('"').strip("'")
            if dl_path and os.path.exists(dl_path):
                self.update_task(task_id, status='completed', progress=100, progress_message='Selesai',
                                 file_path=dl_path, completed_at=datetime.now(timezone.utc).isoformat())
            else:
                self.update_task(task_id, status='completed', progress=100, progress_message='Selesai',
                                 completed_at=datetime.now(timezone.utc).isoformat())
        else:
            self.update_task(task_id, status='failed', error_message=final_context[:500],
                             completed_at=datetime.now(timezone.utc).isoformat())
        task = self.get_task(task_id)
        if task:
            self._notify(task)

    # --- Lifecycle ---
    def start(self):
        self._init_table()
        self._cleanup_stale()
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name='task-queue-worker')
        self._worker_thread.start()
        logger.info(f"Task queue started: max_concurrent={self.max_concurrent}, max_per_user={self.max_per_user}")

    def stop(self):
        self._stop_event.set()
        logger.info("Task queue stopping...")

    def _cleanup_stale(self):
        conn = self._get_conn()
        conn.execute("UPDATE task_queue SET status = 'failed', error_message = 'Server restart' WHERE status = 'running'")
        conn.commit()
        conn.close()


def shutil_which(cmd: str) -> Optional[str]:
    import shutil
    return shutil.which(cmd)


def get_manager() -> TaskManager:
    global _task_manager
    if _task_manager is None:
        from config import config
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'zdt_api.db')
        _task_manager = TaskManager(db_path)
    return _task_manager


def init_queue(app=None):
    mgr = get_manager()
    mgr.start()
    return mgr
