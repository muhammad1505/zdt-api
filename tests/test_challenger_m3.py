import os
import sys
import hashlib
import sqlite3
import secrets
import shutil
import database
import config
from flask import g

def test_legacy_hash_migration(client):
    # 1. Insert a legacy user with SHA-256 hash
    conn = database.get_connection()
    username = "legacy_challenger_user"
    password = "LegacyPassword123"
    legacy_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn.execute(
        "INSERT INTO users (username, password_hash, role, label) VALUES (?, ?, ?, ?)",
        (username, legacy_hash, 'operator', 'Legacy User')
    )
    conn.commit()
    
    # 2. Login with legacy credentials
    r = client.post('/api/login', json={'username': username, 'password': password})
    assert r.status_code == 200
    
    # 3. Check DB to ensure hash was upgraded
    conn = database.get_connection()
    row = conn.execute("SELECT password_hash FROM users WHERE username = ?", (username,)).fetchone()
    new_hash = row['password_hash']
    
    is_upgraded = any(new_hash.startswith(prefix) for prefix in ('pbkdf2:', 'scrypt:', 'bcrypt:'))
    assert is_upgraded, f"Hash was not migrated: {new_hash}"
    
    # 4. Try logging in again with upgraded password
    r2 = client.post('/api/login', json={'username': username, 'password': password})
    assert r2.status_code == 200

def test_jwt_secret_persistence():
    # Retrieve/generate JWT_SECRET
    import auth
    jwt_secret_1 = auth.JWT_SECRET
    
    # Reload config
    config.config._load_config()
    
    # Check if written to config file
    with open(config.config.config_path, 'r') as f:
        content = f.read()
    
    assert "JWT_SECRET=" in content
    
    # Check persistence: reload and verify it matches
    config.config._load_config()
    persisted_secret = config.config.get('JWT_SECRET')
    assert persisted_secret == jwt_secret_1

def test_path_traversal_standard_blocked(client, auth_headers):
    # Standard path traversal: check if ../../etc/passwd is blocked
    r_trav = client.get('/api/stream/../../../../etc/passwd', headers=auth_headers)
    assert r_trav.status_code == 403

def test_path_traversal_sibling_prefix_bypass(client, auth_headers):
    # Get target dir and set up prefix bypass
    target_dir = os.path.abspath(config.config.get_target_dir())
    
    # Sibling directory name that has target_dir name as prefix
    # e.g., if target_dir is '/path/to/test_downloads', sibling is '/path/to/test_downloads_secret'
    sibling_dir = target_dir + "_secret"
    os.makedirs(sibling_dir, exist_ok=True)
    
    secret_file = os.path.join(sibling_dir, "secret.txt")
    with open(secret_file, 'w') as f:
        f.write("CONFIDENTIAL_FLAG_12345")
        
    try:
        # payload to request: ../test_downloads_secret/secret.txt
        payload = f"../{os.path.basename(sibling_dir)}/secret.txt"
        r_bypass = client.get(f'/api/stream/{payload}', headers=auth_headers)
        
        # If this assert fails, it means we read the file, confirming the vulnerability/bypass!
        assert r_bypass.status_code != 200, "VULNERABILITY: Prefix matching allows sibling directory traversal!"
    finally:
        shutil.rmtree(sibling_dir, ignore_errors=True)

def test_path_traversal_symlink_bypass(client, auth_headers):
    target_dir = os.path.abspath(config.config.get_target_dir())
    
    # Create a symlink pointing to test_config.env which is in tests/ (outside target_dir tests/test_downloads)
    link_path = os.path.join(target_dir, "config_link.env")
    if os.path.exists(link_path):
        os.remove(link_path)
        
    os.symlink(config.config.config_path, link_path)
    
    try:
        # Request stream of the symlink
        r = client.get('/api/stream/config_link.env', headers=auth_headers)
        
        # If this succeeds, it means we can read files outside the target directory via symlinks!
        assert r.status_code != 200, "VULNERABILITY: Symlink traversal bypass allowed!"
    finally:
        if os.path.exists(link_path):
            os.remove(link_path)

def test_command_injection_mitigation(client, auth_headers):
    payloads = [
        "https://youtube.com/watch?v=123; touch /tmp/zdt_injected",
        "https://youtube.com/watch?v=123 | touch /tmp/zdt_injected",
        "https://youtube.com/watch?v=123 && touch /tmp/zdt_injected",
        "http://127.0.0.1/`touch /tmp/zdt_injected`"
    ]
    
    if os.path.exists("/tmp/zdt_injected"):
        os.remove("/tmp/zdt_injected")
        
    for p in payloads:
        r_inj = client.post('/api/download', headers=auth_headers, json={'url': p})
        assert r_inj.status_code == 400
        
    assert not os.path.exists("/tmp/zdt_injected"), "VULNERABILITY: Command injection succeeded!"

def test_csrf_double_submit(client, auth_headers):
    # 1. Fetch CSRF token
    r_csrf = client.get('/api/csrf-token', headers=auth_headers)
    assert r_csrf.status_code == 200
    
    csrf_token = r_csrf.get_json().get('csrf_token')
    
    # 2. Test state-changing POST request with cookie but WITHOUT X-CSRF-Token header
    client.set_cookie('csrf_token', csrf_token)
    r_no_hdr = client.post('/api/admin/users', headers=auth_headers, json={'username': 'test_user_csrf', 'password': 'password123'})
    assert r_no_hdr.status_code == 403
    
    # 3. Test with mismatched X-CSRF-Token header
    headers_mismatch = auth_headers.copy()
    headers_mismatch['X-CSRF-Token'] = 'mismatched_token'
    r_mismatch = client.post('/api/admin/users', headers=headers_mismatch, json={'username': 'test_user_csrf', 'password': 'password123'})
    assert r_mismatch.status_code == 403
    
    # 4. Test with matching X-CSRF-Token header
    headers_match = auth_headers.copy()
    headers_match['X-CSRF-Token'] = csrf_token
    r_match = client.post('/api/admin/users', headers=headers_match, json={'username': 'test_user_csrf', 'password': 'password123'})
    assert r_match.status_code == 200
    
    # 5. Test WITHOUT CSRF cookie (should bypass CSRF validation)
    client.delete_cookie('csrf_token')
    r_bypass = client.post('/api/admin/users', headers=auth_headers, json={'username': 'test_user_nocookie', 'password': 'password123'})
    assert r_bypass.status_code == 200

def test_log_fd_leaks(client, auth_headers):
    pid = os.getpid()
    fd_dir = f"/proc/{pid}/fd"
    
    def count_fds():
        try:
            return len(os.listdir(fd_dir))
        except Exception:
            return 0
            
    initial_fd_count = count_fds()
    
    # Trigger several tool clean tasks
    for _ in range(5):
        r = client.post('/api/tools', headers=auth_headers, json={'action': 'clean'})
        assert r.status_code == 200
        
    final_fd_count = count_fds()
    
    # Popen should not leak descriptors in parent
    assert final_fd_count <= initial_fd_count + 1

def test_sqlite_cleanup(client):
    r = client.get('/api/health')
    assert r.status_code == 200
    
    # Check if thread local connection has been cleaned up/closed
    conn = getattr(database._local, 'conn', None)
    assert conn is None
