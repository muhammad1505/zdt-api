import sqlite3
import os
import sys
import threading
import hashlib
import json
import secrets
import base64
import shutil
import time
from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = None
_local = threading.local()
_SCHEMA_VERSION = 2


def get_db_path():
    global DB_PATH
    if DB_PATH is None:
        try:
            from config import config
            # If project_root already ends with 'zdt-api', don't join 'zdt-api' again
            if os.path.basename(config.project_root) == 'zdt-api':
                DB_PATH = os.path.join(config.project_root, 'zdt_api.db')
            else:
                sub_path = os.path.join(config.project_root, 'zdt-api')
                if os.path.isdir(sub_path):
                    DB_PATH = os.path.join(sub_path, 'zdt_api.db')
                else:
                    DB_PATH = os.path.join(config.project_root, 'zdt_api.db')
        except ImportError:
            DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'zdt_api.db')
    return DB_PATH


def get_connection():
    if not hasattr(_local, 'conn') or _local.conn is None:
        _local.conn = sqlite3.connect(get_db_path())
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute('PRAGMA journal_mode=WAL')
        _local.conn.execute('PRAGMA foreign_keys=ON')
    return _local.conn


def close_connection(exception=None):
    conn = getattr(_local, 'conn', None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        _local.conn = None


def init_db():
    conn = get_connection()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'operator',
            label TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key_id TEXT UNIQUE NOT NULL,
            secret TEXT UNIQUE NOT NULL,
            label TEXT DEFAULT '',
            host TEXT DEFAULT '',
            port INTEGER DEFAULT 2000,
            role TEXT DEFAULT 'full',
            active INTEGER DEFAULT 1,
            expired_at TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP,
            created_by INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            api_key_id TEXT REFERENCES api_keys(key_id),
            user_id INTEGER REFERENCES users(id),
            endpoint TEXT,
            method TEXT,
            ip_address TEXT,
            status_code INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT,
            format TEXT DEFAULT 'auto',
            status TEXT NOT NULL DEFAULT 'queued',
            progress_percent INTEGER DEFAULT 0,
            file_path TEXT,
            file_size INTEGER,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            created_by INTEGER REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS vpn_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'info',
            message TEXT,
            server TEXT,
            ip TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

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
    ''')

    # Schema migration: check current version and upgrade if needed
    try:
        cur_version = conn.execute('SELECT COALESCE(MAX(version), 0) FROM schema_version').fetchone()[0]
    except Exception:
        cur_version = 0

    if cur_version < 2:
        try:
            conn.executescript('''
                CREATE INDEX IF NOT EXISTS idx_tq_status ON task_queue(status);
                CREATE INDEX IF NOT EXISTS idx_tq_priority ON task_queue(priority, created_at);
                CREATE INDEX IF NOT EXISTS idx_tq_user ON task_queue(user_id, status);
            ''')
            conn.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (2)')
            conn.commit()
        except Exception as e:
            import logging
            logging.getLogger('zdt-api').error(f'Schema migration v2 failed: {e}')

    if cur_version < 1:
        try:
            conn.executescript('''
                CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
                CREATE INDEX IF NOT EXISTS idx_downloads_created_by ON downloads(created_by);
                CREATE INDEX IF NOT EXISTS idx_vpn_logs_event ON vpn_logs(event_type);
                CREATE INDEX IF NOT EXISTS idx_vpn_logs_timestamp ON vpn_logs(timestamp);
                CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
            ''')
            conn.execute('INSERT OR REPLACE INTO schema_version (version) VALUES (1)')
            conn.commit()
        except Exception as e:
            import logging
            logging.getLogger('zdt-api').error(f'Schema migration failed: {e}')

    conn.commit()


def create_admin_user(username, password):
    conn = get_connection()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing:
        return existing['id']
    
    pw_hash = generate_password_hash(password)
    conn.execute(
        'INSERT INTO users (username, password_hash, role, label) VALUES (?, ?, ?, ?)',
        (username, pw_hash, 'admin', 'Administrator')
    )
    conn.commit()
    return conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()['id']


def verify_user(username, password):
    conn = get_connection()
    user = conn.execute(
        'SELECT * FROM users WHERE username = ? AND active = 1',
        (username,)
    ).fetchone()
    
    if not user:
        return None
        
    db_hash = user['password_hash']
    # Legacy SHA-256 is represented by a 64-character hex string
    is_legacy = len(db_hash) == 64 and all(c in '0123456789abcdefABCDEF' for c in db_hash)
    
    success = False
    migrate_hash = False
    
    if is_legacy:
        # Verify using legacy sha256 comparison
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        if secrets.compare_digest(db_hash, legacy_hash):
            success = True
            migrate_hash = True
    else:
        # Verify using modern werkzeug hash
        if check_password_hash(db_hash, password):
            success = True
            
    if success:
        if migrate_hash:
            new_hash = generate_password_hash(password)
            conn.execute(
                'UPDATE users SET password_hash = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?',
                (new_hash, user['id'])
            )
        else:
            conn.execute(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                (user['id'],)
            )
        conn.commit()
        # Fetch updated user state from database to ensure return dict contains the upgraded hash
        updated = conn.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
        return dict(updated)
    return None


def generate_api_key(host, port, label, role, expired_days, created_by):
    conn = get_connection()
    key_id = 'zdt_sk_' + secrets.token_hex(12)
    secret = secrets.token_hex(24)
    
    expired_at = None
    if expired_days and expired_days > 0:
        expired_at = (datetime.now(timezone.utc) + timedelta(days=expired_days)).isoformat()
    
    conn.execute(
        '''INSERT INTO api_keys (key_id, secret, label, host, port, role, expired_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        (key_id, secret, label, host, port, role, expired_at, created_by)
    )
    conn.commit()
    return key_id, secret


def validate_api_key(key_id, secret):
    conn = get_connection()
    row = conn.execute(
        'SELECT * FROM api_keys WHERE key_id = ? AND secret = ? AND active = 1',
        (key_id, secret)
    ).fetchone()
    if not row:
        return None
    key = dict(row)
    
    # Check expiration
    if key['expired_at']:
        try:
            expired_str = key['expired_at']
            if expired_str.endswith('+00:00'):
                expired_str = expired_str.replace('+00:00', '+0000')
            expired = datetime.fromisoformat(expired_str)
            if not expired.tzinfo:
                expired = expired.replace(tzinfo=timezone.utc)
            if expired < datetime.now(timezone.utc):
                conn.execute('UPDATE api_keys SET active = 0 WHERE id = ?', (key['id'],))
                conn.commit()
                return None
        except (ValueError, TypeError):
            pass
    
    # Update last used
    conn.execute('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?', (key['id'],))
    conn.commit()
    return key


def get_smart_api_key_string(key_id, secret, host, port, label, role, expired_at):
    """Generate Smart API Key: Base64(v|host|port|key_id|secret|label|role|expired)"""
    parts = [
        '1',  # version
        host or '',
        str(port or 2000),
        key_id,
        secret,
        label or '',
        role or 'full',
        str(expired_at or '')
    ]
    raw = '|'.join(parts)
    encoded = base64.b64encode(raw.encode()).decode()
    return encoded


def parse_smart_api_key(encoded):
    """Parse Smart API Key from Base64 format."""
    if not encoded or not isinstance(encoded, str):
        return None
    try:
        raw = base64.b64decode(encoded.encode()).decode()
        parts = raw.split('|')
        if len(parts) < 5:
            return None
        return {
            'version': parts[0],
            'host': parts[1],
            'port': int(parts[2]) if parts[2] else 2000,
            'key_id': parts[3],
            'secret': parts[4],
            'label': parts[5] if len(parts) > 5 else '',
            'role': parts[6] if len(parts) > 6 else 'full',
            'expired': parts[7] if len(parts) > 7 else ''
        }
    except Exception:
        return None


def log_activity(api_key_id=None, user_id=None, endpoint=None, method=None, ip_address=None, status_code=None):
    conn = get_connection()
    conn.execute(
        '''INSERT INTO activity_logs (api_key_id, user_id, endpoint, method, ip_address, status_code)
           VALUES (?, ?, ?, ?, ?, ?)''',
        (api_key_id, user_id, endpoint, method, ip_address, status_code)
    )
    conn.commit()


def get_all_api_keys():
    conn = get_connection()
    rows = conn.execute('SELECT id, key_id, label, host, port, role, active, expired_at, created_at, last_used, created_by FROM api_keys ORDER BY created_at DESC').fetchall()
    return [dict(r) for r in rows]


def get_all_users():
    conn = get_connection()
    rows = conn.execute(
        'SELECT id, username, role, label, active, created_at, last_login FROM users ORDER BY created_at DESC'
    ).fetchall()
    return [dict(r) for r in rows]


def revoke_api_key(key_id):
    conn = get_connection()
    conn.execute('UPDATE api_keys SET active = 0 WHERE key_id = ?', (key_id,))
    conn.commit()


def delete_api_key(key_id):
    conn = get_connection()
    conn.execute('UPDATE activity_logs SET api_key_id = NULL WHERE api_key_id = ?', (key_id,))
    conn.execute('DELETE FROM api_keys WHERE key_id = ?', (key_id,))
    conn.commit()


def create_user(username, password, role='operator', label=''):
    conn = get_connection()
    pw_hash = generate_password_hash(password)
    conn.execute(
        'INSERT INTO users (username, password_hash, role, label) VALUES (?, ?, ?, ?)',
        (username, pw_hash, role, label)
    )
    conn.commit()
    return conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()['id']


def delete_user(user_id):
    conn = get_connection()
    # Nullify foreign keys before deleting the user
    conn.execute('UPDATE activity_logs SET user_id = NULL WHERE user_id = ?', (user_id,))
    conn.execute('UPDATE downloads SET created_by = NULL WHERE created_by = ?', (user_id,))
    conn.execute('DELETE FROM api_keys WHERE created_by = ?', (user_id,))
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()


def get_activity_logs(limit=100):
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?',
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


# === DOWNLOAD QUEUE ===

def create_download(url, fmt='auto', created_by=None):
    conn = get_connection()
    cursor = conn.execute(
        'INSERT INTO downloads (url, format, status, created_by) VALUES (?, ?, ?, ?)',
        (url, fmt, 'queued', created_by)
    )
    conn.commit()
    return cursor.lastrowid


def get_download(download_id):
    conn = get_connection()
    row = conn.execute('SELECT * FROM downloads WHERE id = ?', (download_id,)).fetchone()
    return dict(row) if row else None


def get_downloads(page=1, per_page=20, status=None):
    conn = get_connection()
    query = 'SELECT * FROM downloads'
    params = []
    if status and status != 'all':
        query += ' WHERE status = ?'
        params.append(status)
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.extend([per_page, (page - 1) * per_page])
    rows = conn.execute(query, params).fetchall()
    
    count_query = 'SELECT COUNT(*) FROM downloads'
    count_params = []
    if status and status != 'all':
        count_query += ' WHERE status = ?'
        count_params.append(status)
    total = conn.execute(count_query, count_params).fetchone()[0]
    
    return [dict(r) for r in rows], total


def update_download_status(download_id, status, file_path=None, file_size=None, error_message=None, progress_percent=None):
    conn = get_connection()
    updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP']
    params = [status]
    if file_path is not None:
        updates.append('file_path = ?')
        params.append(file_path)
    if file_size is not None:
        updates.append('file_size = ?')
        params.append(file_size)
    if error_message is not None:
        updates.append('error_message = ?')
        params.append(error_message)
    if progress_percent is not None:
        updates.append('progress_percent = ?')
        params.append(progress_percent)
    if status in ('completed', 'failed', 'cancelled'):
        updates.append('completed_at = CURRENT_TIMESTAMP')
    params.append(download_id)
    conn.execute(f'UPDATE downloads SET {", ".join(updates)} WHERE id = ?', params)
    conn.commit()


def delete_download(download_id):
    conn = get_connection()
    conn.execute('DELETE FROM downloads WHERE id = ?', (download_id,))
    conn.commit()


def clear_download_history():
    conn = get_connection()
    conn.execute("DELETE FROM downloads")
    conn.commit()


# === VPN LOGS ===

def log_vpn_event(event_type, status='info', message=None, server=None, ip=None):
    conn = get_connection()
    conn.execute(
        'INSERT INTO vpn_logs (event_type, status, message, server, ip) VALUES (?, ?, ?, ?, ?)',
        (event_type, status, message, server, ip)
    )
    conn.commit()


def get_vpn_logs(limit=100):
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM vpn_logs ORDER BY timestamp DESC LIMIT ?',
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def get_vpn_latest_event():
    conn = get_connection()
    row = conn.execute('SELECT * FROM vpn_logs ORDER BY timestamp DESC LIMIT 1').fetchone()
    return dict(row) if row else None


# === DATABASE BACKUP ===

# === NOTIFICATION SETTINGS ===

def get_notification_settings():
    """Get notification preferences from settings table."""
    conn = get_connection()
    rows = conn.execute(
        'SELECT key, value FROM settings WHERE key IN (?, ?)',
        ('notif_sound', 'notif_desktop')
    ).fetchall()
    result = {'notif_sound': 'true', 'notif_desktop': 'true'}
    for row in rows:
        result[row['key']] = row['value']
    return result


def save_notification_settings(data: dict):
    """Save notification preferences to settings table."""
    conn = get_connection()
    for key in ('notif_sound', 'notif_desktop'):
        if key in data:
            val = 'true' if str(data[key]).lower() in ('true', '1', 'yes') else 'false'
            conn.execute(
                'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                (key, val)
            )
    conn.commit()


# === LAST SEEN NOTIFICATION ID (persisted per user) ===

def get_last_seen_notif_id(user_id: int) -> int:
    """Get the last seen notification ID for a user."""
    conn = get_connection()
    key = f'notif_last_seen_{user_id}'
    row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
    if row:
        try:
            return int(row['value'])
        except (ValueError, TypeError):
            pass
    return 0


def set_last_seen_notif_id(user_id: int, notif_id: int):
    """Save the last seen notification ID for a user."""
    if notif_id < 1:
        return
    conn = get_connection()
    key = f'notif_last_seen_{user_id}'
    conn.execute(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        (key, str(notif_id))
    )
    conn.commit()


def backup_database():
    db_path = get_db_path()
    if not os.path.exists(db_path):
        return None
    backup_dir = os.path.join(os.path.dirname(db_path), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(backup_dir, f'zdt_api_backup_{timestamp}.db')
    try:
        import sqlite3
        backup_conn = sqlite3.connect(db_path)
        backup_conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        backup_conn.close()
        shutil.copy2(db_path, backup_path)
        return backup_path
    except Exception as e:
        return None
