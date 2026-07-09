#!/usr/bin/env python3
import sqlite3
import sys
import json
import os

if len(sys.argv) < 3:
    print("Usage: zdt_db.py <db_file> <cmd> [args...]")
    sys.exit(1)

DB_FILE = sys.argv[1]
CMD = sys.argv[2]

db_dir = os.path.dirname(DB_FILE)
if db_dir and not os.path.exists(db_dir):
    os.makedirs(db_dir, exist_ok=True)

try:
    conn = sqlite3.connect(DB_FILE, timeout=10)
    c = conn.cursor()
    c.execute("PRAGMA journal_mode=WAL;")
    c.execute("PRAGMA foreign_keys=ON;")
    c.execute('''CREATE TABLE IF NOT EXISTS downloads
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, url TEXT, source TEXT, size_bytes INTEGER, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS tasks
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, status TEXT DEFAULT 'pending', payload TEXT, result TEXT, started_at DATETIME, finished_at DATETIME, error TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, component TEXT, message TEXT, metadata_json TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS preferences
                 (key TEXT PRIMARY KEY, value TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS errors
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, error_type TEXT, component TEXT, stack_trace TEXT, context_json TEXT, count INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_seen DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS chat_history
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT)''')
    # Run schema migration only once per DB — use a sentinel table
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_schema_baked'")
    if not c.fetchone():
        for table_cols in [
            ('chat_history', 'session_id', "TEXT DEFAULT 'default'"),
            ('chat_history', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP'),
            ('downloads', 'status', "TEXT DEFAULT 'completed'"),
            ('downloads', 'error', 'TEXT'),
        ]:
            try:
                c.execute(f"ALTER TABLE {table_cols[0]} ADD COLUMN {table_cols[1]} {table_cols[2]}")
            except sqlite3.OperationalError:
                pass
        c.execute("CREATE TABLE IF NOT EXISTS _schema_baked (dummy INTEGER)")
    conn.commit()
except Exception as e:
    print(f"Error initializing DB: {e}", file=sys.stderr)
    sys.exit(1)

if CMD == "add":
    if len(sys.argv) < 5:
        sys.exit(1)
    role = sys.argv[3]
    content = sys.argv[4]
    c.execute("INSERT INTO chat_history (role, content) VALUES (?, ?)", (role, content))
    c.execute("""DELETE FROM chat_history WHERE id NOT IN
                 (SELECT id FROM chat_history ORDER BY id DESC LIMIT 20)""")
    conn.commit()

elif CMD == "get_gemini_json":
    c.execute("SELECT role, content FROM chat_history ORDER BY id ASC")
    rows = c.fetchall()
    out_parts = []
    for r, content in rows:
        api_role = "model" if r != "user" else "user"
        msg_obj = {"role": api_role, "parts": [{"text": content}]}
        out_parts.append(json.dumps(msg_obj))
    print(", ".join(out_parts))

elif CMD == "get_openai_json":
    c.execute("SELECT role, content FROM chat_history ORDER BY id ASC")
    rows = c.fetchall()
    out_parts = []
    for r, content in rows:
        api_role = "assistant" if r != "user" else "user"
        msg_obj = {"role": api_role, "content": content}
        out_parts.append(json.dumps(msg_obj))
    print(", ".join(out_parts))

elif CMD == "get_count":
    c.execute("SELECT COUNT(*) FROM chat_history")
    count = c.fetchone()[0]
    print(count)

elif CMD == "clear":
    c.execute("DELETE FROM chat_history")
    conn.commit()

elif CMD == "add_download":
    if len(sys.argv) < 7:
        print("Usage: zdt_db.py <db_file> add_download <filename> <url> <source> <size_bytes>", file=sys.stderr)
        sys.exit(1)
    filename = sys.argv[3]
    url = sys.argv[4]
    source = sys.argv[5]
    try:
        size_bytes = int(sys.argv[6])
    except (ValueError, IndexError):
        print(f"Error: invalid size_bytes '{sys.argv[6]}'", file=sys.stderr)
        sys.exit(1)
    c.execute("INSERT INTO downloads (filename, url, source, size_bytes) VALUES (?, ?, ?, ?)", (filename, url, source, size_bytes))
    conn.commit()
    c.execute("""DELETE FROM downloads WHERE id NOT IN
                 (SELECT id FROM downloads ORDER BY id DESC LIMIT 1000)""")
    conn.commit()

elif CMD == "get_stats":
    c.execute("SELECT COUNT(*), SUM(size_bytes) FROM downloads")
    row = c.fetchone()
    total_count = row[0] or 0
    total_size = row[1] or 0
    c.execute("SELECT source, COUNT(*) FROM downloads GROUP BY source")
    sources = dict(c.fetchall())
    limit = 10
    offset = 0
    if len(sys.argv) >= 4:
        try:
            limit = max(1, min(int(sys.argv[3]), 100))
        except (ValueError, IndexError):
            pass
    if len(sys.argv) >= 5:
        try:
            offset = max(0, int(sys.argv[4]))
        except (ValueError, IndexError):
            pass
    total_pages = max(1, (total_count + limit - 1) // limit)
    current_page = (offset // limit) + 1
    c.execute("SELECT filename, source, size_bytes, timestamp FROM downloads ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset))
    recent = [{"filename": r[0], "source": r[1], "size_bytes": r[2], "timestamp": r[3]} for r in c.fetchall()]
    print(json.dumps({
        "total_count": total_count,
        "total_size_bytes": total_size,
        "sources": sources,
        "recent": recent,
        "page": current_page,
        "per_page": limit,
        "total_pages": total_pages
    }))

elif CMD == "clear_downloads":
    c.execute("DELETE FROM downloads")
    conn.commit()
    print(json.dumps({"success": True, "message": "Semua data statistik berhasil direset!"}))

elif CMD == "check_duplicate":
    if len(sys.argv) < 4:
        sys.exit(1)
    url = sys.argv[3]
    c.execute("SELECT id FROM downloads WHERE url = ?", (url,))
    print("True" if c.fetchone() else "False")

elif CMD == "list_urls":
    c.execute("SELECT DISTINCT url FROM downloads")
    for row in c.fetchall():
        print(row[0])

elif CMD == "batch_check":
    if len(sys.argv) < 4:
        sys.exit(1)
    url_file = sys.argv[3]
    if not os.path.exists(url_file):
        sys.exit(1)
    c.execute("SELECT url FROM downloads")
    existing = {row[0] for row in c.fetchall()}
    with open(url_file) as f:
        for line in f:
            url = line.strip()
            if url and url in existing:
                print(url)

conn.close()
