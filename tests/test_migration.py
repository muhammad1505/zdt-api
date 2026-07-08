"""
Tests for database migration from old zdt-web format to new unified database.
"""

import os
import sys
import sqlite3
import json
import shutil
import tempfile

# Add project root to path
PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

import pytest

# ── Direct import of migration functions ─────────────────
from migrate_zdt_db import (
    connect_old_db,
    get_tables,
    migrate_downloads,
    migrate_chat_history,
    migrate_settings,
    migrate_tasks,
    find_old_db,
    get_new_db_path,
)


@pytest.fixture
def old_db_path():
    """Create a sample old-format zdt-web database with test data."""
    tmp = tempfile.mktemp(suffix='.db')
    conn = sqlite3.connect(tmp)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')

    # Create tables matching the old zdt_db.py schema
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            url TEXT,
            source TEXT,
            size_bytes INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'completed',
            error TEXT
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT,
            content TEXT,
            session_id TEXT DEFAULT 'default',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS preferences (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            status TEXT DEFAULT 'pending',
            payload TEXT,
            result TEXT,
            started_at DATETIME,
            finished_at DATETIME,
            error TEXT
        );
    ''')

    # Insert sample data
    conn.execute(
        "INSERT INTO downloads (filename, url, source, size_bytes, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        ('song1.mp3', 'https://youtube.com/watch?v=test1', 'youtube', 5120000, 'completed', '2024-01-01T10:00:00')
    )
    conn.execute(
        "INSERT INTO downloads (filename, url, source, size_bytes, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        ('song2.flac', 'https://spotify.com/track/test2', 'spotify', 25000000, 'completed', '2024-01-02T12:00:00')
    )
    conn.execute(
        "INSERT INTO downloads (filename, url, source, size_bytes, status, error, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ('failed.mp3', 'https://youtube.com/watch?v=fail1', 'youtube', 0, 'failed', 'Download error: connection timeout', '2024-01-03T15:00:00')
    )

    conn.execute(
        "INSERT INTO chat_history (role, content, session_id) VALUES (?, ?, ?)",
        ('user', 'Halo, tolong download lagu', 'default')
    )
    conn.execute(
        "INSERT INTO chat_history (role, content, session_id) VALUES (?, ?, ?)",
        ('assistant', 'Baik, saya akan download sekarang!', 'default')
    )

    conn.execute(
        "INSERT INTO preferences (key, value) VALUES (?, ?)",
        ('DOWNLOAD_FORMAT', 'mp3')
    )
    conn.execute(
        "INSERT INTO preferences (key, value) VALUES (?, ?)",
        ('AUDIO_QUALITY', '320k')
    )

    conn.execute(
        "INSERT INTO tasks (type, status, payload, started_at, finished_at, error) VALUES (?, ?, ?, ?, ?, ?)",
        ('demucs', 'completed', '{"file": "test.mp3"}', '2024-01-01T10:00:00', '2024-01-01T10:05:00', None)
    )
    conn.execute(
        "INSERT INTO tasks (type, status, payload, started_at, finished_at, error) VALUES (?, ?, ?, ?, ?, ?)",
        ('compress', 'failed', '{"file": "video.mp4"}', '2024-01-02T14:00:00', '2024-01-02T14:01:00', 'ffmpeg error')
    )

    conn.commit()
    conn.close()
    yield tmp
    if os.path.exists(tmp):
        os.remove(tmp)
    # Cleanup WAL/SHM too
    for suffix in ['-wal', '-shm']:
        p = tmp + suffix
        if os.path.exists(p):
            os.remove(p)


@pytest.fixture
def new_db_path():
    """Create a fresh new-format unified database."""
    tmp = tempfile.mktemp(suffix='.db')

    # Initialize with the same schema as the real database
    conn = sqlite3.connect(tmp)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')

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
    ''')

    conn.commit()
    conn.close()
    yield tmp
    if os.path.exists(tmp):
        os.remove(tmp)
    for suffix in ['-wal', '-shm']:
        p = tmp + suffix
        if os.path.exists(p):
            os.remove(p)


class TestMigration:
    """Test suite for database migration."""

    def test_connect_old_db(self, old_db_path):
        """Test connecting to the old database."""
        conn = connect_old_db(old_db_path)
        assert conn is not None
        tables = get_tables(conn)
        assert 'downloads' in tables
        assert 'chat_history' in tables
        assert 'preferences' in tables
        assert 'tasks' in tables
        conn.close()

    def test_connect_old_db_nonexistent(self):
        """Test connecting to a nonexistent database returns None."""
        conn = connect_old_db('/nonexistent/path/db.db')
        assert conn is None

    def test_get_tables(self, old_db_path):
        """Test getting table names from old database."""
        conn = connect_old_db(old_db_path)
        tables = get_tables(conn)
        assert len(tables) >= 4
        assert 'downloads' in tables
        conn.close()

    def test_migrate_downloads(self, old_db_path, new_db_path):
        """Test migrating downloads from old DB to new DB."""
        old_conn = connect_old_db(old_db_path)
        migrated, skipped = migrate_downloads(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        assert migrated == 3
        assert skipped == 0

        # Verify the data in new database
        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        rows = new_conn.execute('SELECT * FROM downloads ORDER BY id ASC').fetchall()
        assert len(rows) == 3

        # Check first download
        r1 = dict(rows[0])
        assert r1['url'] == 'https://youtube.com/watch?v=test1'
        assert r1['title'] == 'song1.mp3'
        assert r1['status'] == 'completed'
        assert r1['file_size'] == 5120000

        # Check failed download
        r3 = dict(rows[2])
        assert r3['status'] == 'failed'
        assert 'connection timeout' in (r3['error_message'] or '')

        new_conn.close()

    def test_migrate_downloads_skips_duplicates(self, old_db_path, new_db_path):
        """Test that duplicate URLs are skipped."""
        # Pre-insert a download with the same URL
        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        new_conn.execute(
            "INSERT INTO downloads (url, title, status) VALUES (?, ?, ?)",
            ('https://youtube.com/watch?v=test1', 'existing.mp3', 'completed')
        )
        new_conn.commit()
        new_conn.close()

        old_conn = connect_old_db(old_db_path)
        migrated, skipped = migrate_downloads(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        assert migrated == 2  # Only 2 new ones
        assert skipped == 1   # 1 skipped (duplicate URL)

    def test_migrate_downloads_dry_run(self, old_db_path, new_db_path):
        """Test that dry run doesn't write anything."""
        old_conn = connect_old_db(old_db_path)
        migrated, skipped = migrate_downloads(old_conn, new_db_path, dry_run=True)
        old_conn.close()

        assert migrated == 3
        assert skipped == 0

        # Verify nothing was written
        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        rows = new_conn.execute('SELECT COUNT(*) FROM downloads').fetchone()[0]
        assert rows == 0
        new_conn.close()

    def test_migrate_chat_history(self, old_db_path, new_db_path):
        """Test migrating chat history."""
        old_conn = connect_old_db(old_db_path)
        migrated = migrate_chat_history(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        assert migrated == 2

        # Verify in new database
        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        rows = new_conn.execute("SELECT * FROM settings WHERE key LIKE 'chat_history_%'").fetchall()
        assert len(rows) == 2

        # Check migration tracking
        new_conn.row_factory = sqlite3.Row
        count_row = new_conn.execute(
            "SELECT value FROM settings WHERE key = 'migrated_chat_history'"
        ).fetchone()
        assert count_row is not None
        assert count_row[0] == '2'
        new_conn.close()

    def test_migrate_settings(self, old_db_path, new_db_path):
        """Test migrating preferences to settings."""
        old_conn = connect_old_db(old_db_path)
        migrated = migrate_settings(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        assert migrated == 2

        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        rows = new_conn.execute("SELECT * FROM settings WHERE key LIKE 'migrated_%'").fetchall()
        assert len(rows) == 2

        keys = {r['key']: r['value'] for r in rows}
        assert 'migrated_DOWNLOAD_FORMAT' in keys
        assert keys['migrated_DOWNLOAD_FORMAT'] == 'mp3'
        new_conn.close()

    def test_migrate_tasks(self, old_db_path, new_db_path):
        """Test migrating tasks."""
        old_conn = connect_old_db(old_db_path)
        migrated = migrate_tasks(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        assert migrated == 2  # Only completed/failed tasks

        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row
        rows = new_conn.execute("SELECT * FROM settings WHERE key LIKE 'migrated_task_%'").fetchall()
        assert len(rows) == 2
        new_conn.close()

    def test_full_migration_end_to_end(self, old_db_path, new_db_path):
        """Test full end-to-end migration."""
        old_conn = connect_old_db(old_db_path)

        # Run all migrations
        dl_migrated, dl_skipped = migrate_downloads(old_conn, new_db_path, dry_run=False)
        ch_migrated = migrate_chat_history(old_conn, new_db_path, dry_run=False)
        pref_migrated = migrate_settings(old_conn, new_db_path, dry_run=False)
        task_migrated = migrate_tasks(old_conn, new_db_path, dry_run=False)
        old_conn.close()

        total = dl_migrated + ch_migrated + pref_migrated + task_migrated
        assert total == 9  # 3 downloads + 2 chat + 2 prefs + 2 tasks

        # Verify all data in new database
        new_conn = sqlite3.connect(new_db_path)
        new_conn.row_factory = sqlite3.Row

        dl_count = new_conn.execute('SELECT COUNT(*) FROM downloads').fetchone()[0]
        assert dl_count == 3

        ch_count = new_conn.execute(
            "SELECT COUNT(*) FROM settings WHERE key LIKE 'chat_history_%'"
        ).fetchone()[0]
        assert ch_count == 2

        pref_count = new_conn.execute(
            "SELECT COUNT(*) FROM settings WHERE key LIKE 'migrated_DOWNLOAD_FORMAT' OR key LIKE 'migrated_AUDIO_QUALITY'"
        ).fetchone()[0]
        assert pref_count == 2

        task_count = new_conn.execute(
            "SELECT COUNT(*) FROM settings WHERE key LIKE 'migrated_task_%'"
        ).fetchone()[0]
        assert task_count == 2

        new_conn.close()

    def test_migrate_empty_old_db(self, new_db_path):
        """Test migration with empty old database (no tables)."""
        # Create empty old db
        tmp = tempfile.mktemp(suffix='.db')
        conn = sqlite3.connect(tmp)
        conn.close()

        old_conn = connect_old_db(tmp)
        migrated, skipped = migrate_downloads(old_conn, new_db_path, dry_run=False)
        assert migrated == 0
        assert skipped == 0

        ch_migrated = migrate_chat_history(old_conn, new_db_path, dry_run=False)
        assert ch_migrated == 0

        old_conn.close()
        os.remove(tmp)

    def test_find_old_db_without_config(self):
        """Test find_old_db returns None when no old DB exists."""
        result = find_old_db()
        # This returns None or a path in CI depending on environment
        # Just verify it doesn't crash
        assert result is None or os.path.exists(result)

    def test_get_new_db_path(self):
        """Test get_new_db_path returns a valid path."""
        path = get_new_db_path()
        assert path is not None
        assert path.endswith('.db')
