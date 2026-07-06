import os
import sys
import shutil
import tempfile
import hashlib
import sqlite3
import jwt
import secrets
import subprocess
import pytest

# Ensure project root is in path
project_root = "/home/zaki/zdt-project/zdt-api"
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import config
import database

# Use a clean test database specifically for this challenger run
challenger_db_path = os.path.join(project_root, "tests", "challenger_zdt_api.db")

@pytest.fixture(autouse=True)
def setup_challenger_db(monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", challenger_db_path)
    database.close_connection()
    
    for suffix in ['', '-wal', '-shm']:
        p = challenger_db_path + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
                
    database.init_db()
    database.create_admin_user("admin", "admin")
    
    yield
    
    database.close_connection()
        
    for suffix in ['', '-wal', '-shm']:
        p = challenger_db_path + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass



def test_legacy_hash_migration(client):
    """1. Test legacy SHA-256 to Werkzeug password hash transparent migration."""
    conn = database.get_connection()
    username = "legacy_user_test"
    password = "LegacyPassword123"
    legacy_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn.execute(
        "INSERT INTO users (username, password_hash, role, label) VALUES (?, ?, ?, ?)",
        (username, legacy_hash, 'operator', 'Legacy User')
    )
    conn.commit()
    
    # Login with legacy credentials
    r = client.post('/api/login', json={'username': username, 'password': password})
    assert r.status_code == 200
    
    # Check DB to ensure hash was upgraded
    conn = database.get_connection()
    row = conn.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
    new_hash = row['password_hash']
    
    is_upgraded = any(new_hash.startswith(prefix) for prefix in ('pbkdf2:', 'scrypt:', 'bcrypt:'))
    assert is_upgraded, "Password hash was not transparently upgraded"
    
    # Login again with upgraded password
    r2 = client.post('/api/login', json={'username': username, 'password': password})
    assert r2.status_code == 200


def test_jwt_secret_persistence():
    """2. Test JWT secret persistence."""
    import auth
    jwt_secret = auth.JWT_SECRET
    assert jwt_secret is not None
    
    # Verify it is read/written to config.env
    persisted_secret = config.config.get('JWT_SECRET')
    assert persisted_secret == jwt_secret, "JWT secret not persisted correctly in config"


def test_path_traversal_and_sibling_bypass(client):
    """3. Test path traversal and check for sibling directory prefix bypass."""
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    token = r.get_json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    # Standard path traversal
    r_trav = client.get('/api/stream/../../../../etc/passwd', headers=headers)
    assert r_trav.status_code in (400, 403)
    
    # Sibling directory bypass check
    test_downloads = os.path.normpath(config.config.get_target_dir())
    test_downloads_secret = test_downloads + "_secret"
    
    os.makedirs(test_downloads, exist_ok=True)
    os.makedirs(test_downloads_secret, exist_ok=True)
    
    secret_file = os.path.join(test_downloads_secret, "secret.txt")
    with open(secret_file, 'w') as f:
        f.write("CONFIDENTIAL_FLAG_12345")
        
    try:
        # Request sibling directory file
        r_bypass = client.get('/api/stream/../test_downloads_secret/secret.txt', headers=headers)
        
        # If it returns 200, then the path traversal check was bypassed!
        assert r_bypass.status_code != 200, "VULNERABILITY: Sibling directory path traversal bypass succeeded!"
        assert r_bypass.status_code in (400, 403), f"Expected 403 Forbidden, got {r_bypass.status_code}"
    finally:
        shutil.rmtree(test_downloads_secret, ignore_errors=True)


def test_command_injection_mitigation(client):
    """4. Test command injection mitigations."""
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    token = r.get_json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    # Ensure injection target file is clean
    injected_file = "/tmp/zdt_injected"
    if os.path.exists(injected_file):
        os.remove(injected_file)
        
    try:
        # Attempt command injection via download URL
        client.post('/api/download', headers=headers, json={
            'url': 'https://youtube.com/watch?v=123; touch /tmp/zdt_injected'
        })
        
        assert not os.path.exists(injected_file), "VULNERABILITY: Command injection succeeded!"
    finally:
        if os.path.exists(injected_file):
            os.remove(injected_file)


def test_csrf_double_submit(client):
    """5. Test CSRF Double-Submit cookie validation."""
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    token = r.get_json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    # Get CSRF token
    r_csrf = client.get('/api/csrf-token', headers=headers)
    assert r_csrf.status_code == 200
    csrf_token = r_csrf.get_json().get('csrf_token')
    
    # Set cookie
    client.set_cookie('csrf_token', csrf_token)
    
    # Request without X-CSRF-Token header -> should fail with 403
    r_no_hdr = client.post('/api/admin/users', headers=headers, json={'username': 'test_csrf', 'password': 'password123'})
    assert r_no_hdr.status_code == 403
    
    # Request with mismatched header -> should fail with 403
    headers_mismatch = headers.copy()
    headers_mismatch['X-CSRF-Token'] = 'mismatched'
    r_mismatch = client.post('/api/admin/users', headers=headers_mismatch, json={'username': 'test_csrf', 'password': 'password123'})
    assert r_mismatch.status_code == 403
    
    # Request with matching header -> should succeed with 200/201 (or fail with validation errors other than CSRF 403)
    headers_match = headers.copy()
    headers_match['X-CSRF-Token'] = csrf_token
    r_match = client.post('/api/admin/users', headers=headers_match, json={'username': 'test_csrf', 'password': 'password123'})
    assert r_match.status_code != 403
    
    # Request without cookie -> should bypass CSRF and not fail with 403
    client.delete_cookie('csrf_token')
    r_bypass = client.post('/api/admin/users', headers=headers, json={'username': 'test_csrf_bypass', 'password': 'password123'})
    assert r_bypass.status_code != 403


def test_log_fd_leaks(client):
    """6. Check log fd leak prevention."""
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    token = r.get_json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    pid = os.getpid()
    fd_dir = f"/proc/{pid}/fd"
    
    def count_fds():
        try:
            return len(os.listdir(fd_dir))
        except Exception:
            return 0
            
    initial_fd_count = count_fds()
    
    # Trigger several cleanup tools (starts Popen processes)
    for _ in range(5):
        client.post('/api/tools', headers=headers, json={'action': 'clean'})
        
    final_fd_count = count_fds()
    
    # Allow some normal socket/tempfile FDs but should not leak one per task
    assert final_fd_count <= initial_fd_count + 2, f"FD leak detected: started with {initial_fd_count}, ended with {final_fd_count}"


def test_sqlite_cleanup(client):
    """7. Check SQLite thread-local cleanup."""
    r = client.get('/api/health')
    assert r.status_code == 200
    
    conn = getattr(database._local, 'conn', None)
    assert conn is None, "SQLite connection was not cleaned up / closed after request context ended"
