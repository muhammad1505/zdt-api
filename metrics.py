import os
import time
import json
import sqlite3
import threading
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger('zdt-api.metrics')
COLLECT_INTERVAL = 60
RETENTION_HOURS = 168

_collector_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def _init_table(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS metrics_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            cpu_load_1m REAL,
            cpu_load_5m REAL,
            cpu_load_15m REAL,
            mem_total_gb REAL,
            mem_available_gb REAL,
            disk_total_gb REAL,
            disk_free_gb REAL,
            disk_used_gb REAL
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics_history(timestamp)')
    conn.commit()
    conn.close()


def _collect(db_path: str):
    try:
        cpu = os.getloadavg() if hasattr(os, 'getloadavg') else [0, 0, 0]
        mem = {'total': 0, 'available': 0}
        try:
            with open('/proc/meminfo') as f:
                for line in f:
                    if 'MemTotal' in line:
                        mem['total'] = round(int(line.split()[1]) / 1024 / 1024, 1)
                    elif 'MemAvailable' in line:
                        mem['available'] = round(int(line.split()[1]) / 1024 / 1024, 1)
        except Exception:
            pass
        disk = {'total': 0, 'free': 0, 'used': 0}
        try:
            from config import config
            target = config.get_target_dir()
            if target and os.path.exists(target):
                stat = os.statvfs(target)
                disk['total'] = round(stat.f_blocks * stat.f_frsize / (1024**3), 1)
                disk['free'] = round(stat.f_bavail * stat.f_frsize / (1024**3), 1)
                disk['used'] = round(disk['total'] - disk['free'], 1)
        except Exception:
            pass
        conn = sqlite3.connect(db_path)
        conn.execute(
            '''INSERT INTO metrics_history
               (cpu_load_1m, cpu_load_5m, cpu_load_15m, mem_total_gb, mem_available_gb, disk_total_gb, disk_free_gb, disk_used_gb)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (cpu[0], cpu[1], cpu[2], mem['total'], mem['available'], disk['total'], disk['free'], disk['used'])
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Metrics collect error: {e}")


def _cleanup(db_path: str):
    try:
        conn = sqlite3.connect(db_path)
        conn.execute(
            "DELETE FROM metrics_history WHERE timestamp < datetime('now', ?)",
            (f'-{RETENTION_HOURS} hours',)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Metrics cleanup error: {e}")


def _loop(db_path: str):
    while not _stop_event.is_set():
        _collect(db_path)
        _cleanup(db_path)
        _stop_event.wait(COLLECT_INTERVAL)


def start_collector(db_path: str):
    global _collector_thread
    _init_table(db_path)
    _collector_thread = threading.Thread(target=_loop, args=[db_path], daemon=True, name='metrics-collector')
    _collector_thread.start()
    logger.info(f"Metrics collector started (every {COLLECT_INTERVAL}s, retention {RETENTION_HOURS}h)")


def stop_collector():
    _stop_event.set()


def get_history(db_path: str, hours: int = 24) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        '''SELECT * FROM metrics_history
           WHERE timestamp >= datetime('now', ?)
           ORDER BY timestamp ASC''',
        (f'-{hours} hours',)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
