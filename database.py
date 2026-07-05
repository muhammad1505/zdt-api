import sqlite3
import os
import sys
import threading
import hashlib
import json
import secrets
import base64
from datetime import datetime, timedelta

DB_PATH = None
_local = threading.local()


def get_db_path():
    global DB_PATH
    if DB_PATH is None:
        try:
            from config import config
            DB_PATH = os.path.join(config.project_root, 'zdt-api', 'zdt_api.db')
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
    ''')
    conn.commit()


def create_admin_user(username, password):
    conn = get_connection()
    existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
    if existing:
        return existing['id']
    
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
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
    if user and user['password_hash'] == hashlib.sha256(password.encode()).hexdigest():
        conn.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            (user['id'],)
        )
        conn.commit()
        return dict(user)
    return None


def generate_api_key(host, port, label, role, expired_days, created_by):
    conn = get_connection()
    key_id = 'zdt_sk_' + secrets.token_hex(12)
    secret = secrets.token_hex(24)
    
    expired_at = None
    if expired_days and expired_days > 0:
        expired_at = (datetime.utcnow() + timedelta(days=expired_days)).isoformat()
    
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
            expired = datetime.fromisoformat(key['expired_at'])
            if expired < datetime.utcnow():
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
    except Exception as e:
        print(f'[parse_smart_api_key] Error: {e}')
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
    rows = conn.execute('SELECT * FROM api_keys ORDER BY created_at DESC').fetchall()
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


def create_user(username, password, role='operator', label=''):
    conn = get_connection()
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    conn.execute(
        'INSERT INTO users (username, password_hash, role, label) VALUES (?, ?, ?, ?)',
        (username, pw_hash, role, label)
    )
    conn.commit()
    return conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()['id']


def delete_user(user_id):
    conn = get_connection()
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()


def get_activity_logs(limit=100):
    conn = get_connection()
    rows = conn.execute(
        'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?',
        (limit,)
    ).fetchall()
    return [dict(r) for r in rows]
