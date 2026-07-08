#!/usr/bin/env python3
"""
ZDT Database Migration Script
==============================
Migrate data from the old zdt-web database (zdt_db.py format)
to the new unified database (zdt_api.db).

The old zdt_db.py stores data in a SQLite file passed as a CLI argument
(e.g., ~/.local/share/zdt/zdt.db or /home/*/zdt-api/zdt.db).
The new unified database is zdt_api.db managed by database.py.

Usage:
    python3 migrate_zdt_db.py [--dry-run] [--old-db PATH]
    
    --dry-run    Preview what will be migrated without writing
    --old-db     Path to the old zdt-web database (auto-detected if omitted)
"""

import os
import sys
import sqlite3
import argparse
import shutil
from datetime import datetime

# Add project root to path
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

# ─── ANSI colors ───────────────────────────────
GREEN = '\033[0;32m'
YELLOW = '\033[0;33m'
CYAN = '\033[0;36m'
RED = '\033[0;31m'
BOLD = '\033[1m'
NC = '\033[0m'

def info(msg):  print(f"{CYAN}[INFO]{NC}  {msg}")
def ok(msg):    print(f"{GREEN}[OK]{NC}    {msg}")
def warn(msg):  print(f"{YELLOW}[WARN]{NC}  {msg}")
def err(msg):   print(f"{RED}[ERROR]{NC} {msg}")


def find_old_db():
    """Auto-detect old zdt-web database file."""
    # Common locations for the old zdt-web database
    candidates = [
        os.path.expanduser('~/.local/share/zdt/zdt.db'),
        os.path.expanduser('~/.local/share/zdt/downloads.db'),
        os.path.join(PROJECT_DIR, 'zdt.db'),
        os.path.join(PROJECT_DIR, 'downloads.db'),
        os.path.join(os.path.dirname(PROJECT_DIR), 'zdt.db'),
        os.path.expanduser('~/Music/ZDT_Downloads/zdt.db'),
        '/opt/zdt-api/zdt.db',
    ]
    
    # Check config for old db path
    try:
        old_conf = os.path.expanduser('~/.config/zdt/config')
        if os.path.exists(old_conf):
            with open(old_conf) as f:
                for line in f:
                    if 'db_file' in line.lower() or 'database' in line.lower():
                        if '=' in line:
                            val = line.strip().split('=', 1)[1].strip().strip('"').strip("'")
                            if val and os.path.exists(val):
                                candidates.insert(0, val)
    except Exception:
        pass
    
    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)
    return None


def get_new_db_path():
    """Get the path to the new unified database."""
    try:
        from database import get_db_path
        return get_db_path()
    except Exception:
        return os.path.join(PROJECT_DIR, 'zdt_api.db')


def connect_old_db(path):
    """Connect to old zdt-web database and return connection."""
    if not os.path.exists(path):
        return None
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def get_tables(conn):
    """Get list of tables in the database."""
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    return [row[0] for row in cursor.fetchall()]


def migrate_downloads(old_conn, new_db_path, dry_run=False):
    """Migrate downloads from old DB to new unified DB."""
    migrated = 0
    skipped = 0
    
    try:
        rows = old_conn.execute(
            'SELECT * FROM downloads ORDER BY id ASC'
        ).fetchall()
    except sqlite3.OperationalError:
        warn("No 'downloads' table in old database — skipping")
        return 0, 0
    
    if not rows:
        info("No downloads to migrate")
        return 0, 0
    
    # Connect to new database
    new_conn = sqlite3.connect(new_db_path)
    new_conn.row_factory = sqlite3.Row
    new_conn.execute('PRAGMA journal_mode=WAL')
    
    # Check which URLs already exist in the new DB
    existing_urls = set()
    try:
        existing = new_conn.execute('SELECT url FROM downloads').fetchall()
        existing_urls = {r[0] for r in existing}
    except sqlite3.OperationalError:
        pass
    
    for row in rows:
        row_dict = dict(row)
        url = row_dict.get('url', '')
        
        if url in existing_urls:
            skipped += 1
            continue
        
        # Map old fields to new fields
        filename = row_dict.get('filename', '')
        source = row_dict.get('source', '')
        size_bytes = row_dict.get('size_bytes', 0)
        timestamp = row_dict.get('timestamp') or row_dict.get('created_at')
        status = row_dict.get('status', 'completed')
        error = row_dict.get('error', '')
        
        # Derive title from filename
        title = filename if filename else None
        
        # Derive URL from the old record
        download_url = row_dict.get('url', '')
        
        if not dry_run:
            new_conn.execute(
                '''INSERT INTO downloads 
                   (url, title, format, status, file_path, file_size, error_message, created_at, updated_at, completed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    download_url,
                    title,
                    'auto',
                    status,
                    filename,  # file_path = old filename
                    size_bytes if size_bytes else None,
                    error if error else None,
                    timestamp or datetime.now().isoformat(),
                    timestamp or datetime.now().isoformat(),
                    timestamp if status == 'completed' else None
                )
            )
        
        migrated += 1
    
    if not dry_run:
        new_conn.commit()
    new_conn.close()
    
    return migrated, skipped


def migrate_chat_history(old_conn, new_db_path, dry_run=False):
    """Migrate chat history — stored as settings in new DB (JSON)."""
    migrated = 0
    
    try:
        rows = old_conn.execute(
            'SELECT * FROM chat_history ORDER BY id ASC'
        ).fetchall()
    except sqlite3.OperationalError:
        warn("No 'chat_history' table in old database — skipping")
        return 0
    
    if not rows:
        info("No chat history to migrate")
        return 0
    
    new_conn = sqlite3.connect(new_db_path)
    new_conn.row_factory = sqlite3.Row
    
    # Check if settings already has chat_history
    existing = new_conn.execute(
        "SELECT value FROM settings WHERE key = 'migrated_chat_history'"
    ).fetchone()
    
    for row in rows:
        row_dict = dict(row)
        role = row_dict.get('role', 'user')
        content = row_dict.get('content', '')
        session_id = row_dict.get('session_id', 'default')
        created_at = row_dict.get('created_at')
        
        # Store as individual settings entries prefixed with chat_history_
        key = f"chat_history_{row_dict['id']}"
        value = f"{role}|{session_id}|{created_at or ''}|{content[:500]}"
        
        if not dry_run:
            try:
                new_conn.execute(
                    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                    (key, value)
                )
            except Exception:
                pass
        
        migrated += 1
    
    if not dry_run and migrated > 0:
        new_conn.execute(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            ('migrated_chat_history', str(migrated))
        )
        new_conn.commit()
    
    new_conn.close()
    return migrated


def migrate_settings(old_conn, new_db_path, dry_run=False):
    """Migrate preferences/settings from old DB to new settings table."""
    migrated = 0
    
    try:
        rows = old_conn.execute(
            'SELECT * FROM preferences ORDER BY key ASC'
        ).fetchall()
    except sqlite3.OperationalError:
        warn("No 'preferences' table in old database — skipping")
        return 0
    
    if not rows:
        info("No preferences to migrate")
        return 0
    
    new_conn = sqlite3.connect(new_db_path)
    new_conn.row_factory = sqlite3.Row
    
    existing_keys = set()
    try:
        existing = new_conn.execute('SELECT key FROM settings').fetchall()
        existing_keys = {r[0] for r in existing}
    except sqlite3.OperationalError:
        pass
    
    for row in rows:
        row_dict = dict(row)
        key = row_dict.get('key', '')
        value = row_dict.get('value', '')
        
        if key in existing_keys:
            continue
        
        if not dry_run:
            try:
                new_conn.execute(
                    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                    (f"migrated_{key}", value)
                )
            except Exception:
                pass
        
        migrated += 1
    
    if not dry_run and migrated > 0:
        new_conn.commit()
    
    new_conn.close()
    return migrated


def migrate_tasks(old_conn, new_db_path, dry_run=False):
    """Migrate tasks from old DB to download queue (if applicable)."""
    migrated = 0
    
    try:
        rows = old_conn.execute(
            'SELECT * FROM tasks ORDER BY id ASC'
        ).fetchall()
    except sqlite3.OperationalError:
        warn("No 'tasks' table in old database — skipping")
        return 0
    
    if not rows:
        info("No tasks to migrate")
        return 0
    
    new_conn = sqlite3.connect(new_db_path)
    new_conn.row_factory = sqlite3.Row
    
    for row in rows:
        row_dict = dict(row)
        task_type = row_dict.get('type', '')
        status = row_dict.get('status', 'pending')
        payload = row_dict.get('payload', '')
        result = row_dict.get('result', '')
        error = row_dict.get('error', '')
        started_at = row_dict.get('started_at')
        finished_at = row_dict.get('finished_at')
        
        # Store completed tasks in settings
        if status in ('completed', 'failed'):
            key = f"migrated_task_{row_dict['id']}"
            value = f"{task_type}|{status}|{error or ''}|{started_at or ''}|{finished_at or ''}"
            
            if not dry_run:
                try:
                    new_conn.execute(
                        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
                        (key, value[:500])
                    )
                except Exception:
                    pass
            migrated += 1
    
    if not dry_run and migrated > 0:
        new_conn.commit()
    
    new_conn.close()
    return migrated


def main():
    parser = argparse.ArgumentParser(
        description='Migrate old zdt-web database to new unified database'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview what will be migrated without writing')
    parser.add_argument('--old-db', 
                        help='Path to old zdt-web database (auto-detected if omitted)')
    parser.add_argument('--backup', action='store_true', default=True,
                        help='Backup the new database before migration (default: True)')
    parser.add_argument('--no-backup', action='store_false', dest='backup',
                        help='Skip backup')
    
    args = parser.parse_args()
    
    print(f"\n{BOLD}╔══════════════════════════════════════════╗{NC}")
    print(f"{BOLD}║     ZDT Database Migration Tool          ║{NC}")
    print(f"{BOLD}╚══════════════════════════════════════════╝{NC}\n")
    
    # Find old database
    old_db_path = args.old_db or find_old_db()
    if not old_db_path:
        err("No old zdt-web database found!")
        info("Specify the path with --old-db PATH")
        sys.exit(1)
    
    old_db_path = os.path.abspath(old_db_path)
    info(f"Old database: {old_db_path}")
    
    new_db_path = get_new_db_path()
    info(f"New database: {new_db_path}")
    
    if args.dry_run:
        warn("DRY RUN — no changes will be written")
    
    # Connect to old database
    old_conn = connect_old_db(old_db_path)
    if not old_conn:
        err(f"Cannot open old database: {old_db_path}")
        sys.exit(1)
    
    tables = get_tables(old_conn)
    info(f"Tables in old database: {', '.join(tables)}\n")
    
    # Initialize new database if needed
    if not os.path.exists(new_db_path):
        warn(f"New database not found at {new_db_path}")
        info("Initializing new database...")
        if not args.dry_run:
            try:
                from database import init_db
                init_db()
                ok("New database initialized")
            except Exception as e:
                err(f"Failed to initialize new database: {e}")
                sys.exit(1)
    
    # Backup new database
    if args.backup and not args.dry_run:
        backup_path = new_db_path + '.backup.' + datetime.now().strftime('%Y%m%d_%H%M%S')
        try:
            shutil.copy2(new_db_path, backup_path)
            ok(f"New database backed up to {backup_path}")
        except Exception as e:
            warn(f"Backup failed: {e}")
    
    # Run migrations
    print(f"{BOLD}─── Migrating downloads ───{NC}")
    dl_migrated, dl_skipped = migrate_downloads(old_conn, new_db_path, args.dry_run)
    if dl_migrated > 0:
        ok(f"Migrated {dl_migrated} downloads" + (f" ({dl_skipped} skipped — already exist)" if dl_skipped else ""))
    else:
        info(f"No new downloads to migrate ({dl_skipped} skipped)")
    
    print(f"\n{BOLD}─── Migrating chat history ───{NC}")
    ch_migrated = migrate_chat_history(old_conn, new_db_path, args.dry_run)
    if ch_migrated > 0:
        ok(f"Migrated {ch_migrated} chat messages")
    
    print(f"\n{BOLD}─── Migrating preferences ───{NC}")
    pref_migrated = migrate_settings(old_conn, new_db_path, args.dry_run)
    if pref_migrated > 0:
        ok(f"Migrated {pref_migrated} preferences")
    
    print(f"\n{BOLD}─── Migrating tasks ───{NC}")
    task_migrated = migrate_tasks(old_conn, new_db_path, args.dry_run)
    if task_migrated > 0:
        ok(f"Migrated {task_migrated} tasks")
    
    old_conn.close()
    
    # Summary
    total = dl_migrated + ch_migrated + pref_migrated + task_migrated
    print(f"\n{'─' * 46}")
    if args.dry_run:
        warn(f"DRY RUN complete — would migrate {total} records")
    else:
        ok(f"Migration complete! {total} records migrated")
        info(f"New database: {new_db_path}")
        if dl_migrated > 0:
            info("Run 'python3 server.py' and check /api/stats for migrated downloads")


if __name__ == '__main__':
    main()
