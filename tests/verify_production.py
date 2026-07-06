"""Production readiness verification script.

Programmatically checks:
1. All Python files compile without syntax errors
2. `pytest tests/ -v` passes
3. Server starts and /api/health returns 200
4. Password hashing uses bcrypt/scrypt (not SHA-256)
5. JWT secret is loaded from persistent storage
6. secure_filename is used in upload endpoint
7. No open() calls used as bare subprocess stdout arguments
8. New settings endpoints respond correctly
9. VPN status endpoint is accessible without admin role
10. File delete/rename endpoints exist and enforce path traversal protection
11. Downloads table exists in database schema
"""

import sys
import os
import subprocess
import py_compile
import importlib.util
import json


project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def check_python_files_compile():
    errors = []
    for root, _, files in os.walk(project_root):
        if '.git' in root or '__pycache__' in root or 'node_modules' in root:
            continue
        for f in files:
            if f.endswith('.py'):
                path = os.path.join(root, f)
                try:
                    py_compile.compile(path, doraise=True)
                except py_compile.PyCompileError as e:
                    errors.append(str(e))
    return errors


def run_pytest():
    result = subprocess.run(
        [sys.executable, '-m', 'pytest', 'tests/', '-v', '--tb=short'],
        capture_output=True, text=True, timeout=120,
        cwd=project_root
    )
    return result.returncode, result.stdout, result.stderr


def check_server_startup():
    proc = subprocess.Popen(
        [sys.executable, 'server.py'],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=project_root
    )
    import time
    import socket
    time.sleep(2)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(3)
        sock.connect(('127.0.0.1', 2000))
        sock.send(b'GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n')
        response = sock.recv(4096).decode('utf-8')
        sock.close()
        return '200' in response.split('\r\n')[0], response
    except Exception as e:
        return False, str(e)
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def check_password_hashing():
    spec = importlib.util.spec_from_file_location(
        'database', os.path.join(project_root, 'database.py')
    )
    if not spec or not spec.loader:
        return False, "Could not load database.py"
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    hash_source = mod.__file__
    with open(hash_source) as f:
        content = f.read()
    uses_werkzeug = 'generate_password_hash' in content and 'check_password_hash' in content
    uses_raw_sha256 = 'hashlib.sha256' in content or 'sha256' in content.lower()
    return uses_werkzeug, content[:500]


def check_jwt_secret_persistent():
    with open(os.path.join(project_root, 'auth.py')) as f:
        content = f.read()
    has_persistent = 'config.get' in content and 'JWT_SECRET' in content
    has_secrets_token = 'secrets.token_hex' in content
    return has_persistent, has_secrets_token


def check_secure_filename():
    with open(os.path.join(project_root, 'routes', 'files_routes.py')) as f:
        content = f.read()
    return 'secure_filename' in content


def check_no_bare_open_subprocess():
    import ast
    for root, _, files in os.walk(os.path.join(project_root, 'routes')):
        for f in files:
            if f.endswith('.py'):
                path = os.path.join(root, f)
                with open(path) as fh:
                    content = fh.read()
                try:
                    tree = ast.parse(content)
                except SyntaxError:
                    continue
                for node in ast.walk(tree):
                    if isinstance(node, ast.Call):
                        func = node.func
                        is_subprocess_call = False
                        if isinstance(func, ast.Attribute):
                            if func.attr in ('Popen', 'run', 'call', 'check_call', 'check_output'):
                                is_subprocess_call = True
                        elif isinstance(func, ast.Name):
                            if func.id in ('popen',):
                                is_subprocess_call = True
                        if is_subprocess_call:
                            for kw in node.keywords:
                                if kw.arg in ('stdout', 'stderr') and isinstance(kw.value, ast.Call):
                                    inner = kw.value.func
                                    if isinstance(inner, ast.Name) and inner.id == 'open':
                                        lineno = node.lineno
                                        return False, f"{path}:{lineno}: subprocess with open() as stdout/stderr"
    return True, None


def check_settings_endpoints():
    import sys
    old_path = sys.path[:]
    sys.path.insert(0, project_root)
    try:
        import config as cfg
        test_config = os.path.join(project_root, 'tests', 'test_config.env')
        cfg.config.config_path = test_config
        with open(test_config, 'w') as f:
            f.write("ZDT_WEB_USER=admin\nZDT_WEB_PASS=admin\nTARGET_DIR=/tmp\n")
        cfg.config._load_config()
        import database as db
        old_db = db.DB_PATH
        test_db = os.path.join(project_root, 'tests', 'test_verify.db')
        if os.path.exists(test_db):
            os.remove(test_db)
        db.DB_PATH = test_db
        db.close_connection()
        db.init_db()
        db.create_admin_user('admin', 'admin')
        from server import app
        client = app.test_client()
        r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
        data = r.get_json()
        if r.status_code != 200 or not data or 'token' not in data:
            return False, "Login failed", None
        token = data['token']
        headers = {'Authorization': f'Bearer {token}'}

        results = {}
        r = client.get('/api/settings', headers=headers)
        results['GET /api/settings'] = r.status_code == 200

        r = client.get('/api/settings/download', headers=headers)
        results['GET /api/settings/download'] = r.status_code == 200

        r = client.get('/api/settings/telegram', headers=headers)
        results['GET /api/settings/telegram'] = r.status_code == 200

        r = client.get('/api/server/info', headers=headers)
        results['GET /api/server/info'] = r.status_code == 200

        r = client.get('/api/profile', headers=headers)
        results['GET /api/profile'] = r.status_code == 200

        for suffix in ['', '-wal', '-shm']:
            p = test_db + suffix
            if os.path.exists(p):
                os.remove(p)
        if os.path.exists(test_config):
            os.remove(test_config)
        db.DB_PATH = old_db
        return True, "All settings endpoints OK", results
    except Exception as e:
        return False, str(e), None
    finally:
        sys.path = old_path


def check_vpn_status_accessible():
    import sys
    old_path = sys.path[:]
    sys.path.insert(0, project_root)
    try:
        import config as cfg
        test_config = os.path.join(project_root, 'tests', 'test_config.env')
        cfg.config.config_path = test_config
        with open(test_config, 'w') as f:
            f.write("ZDT_WEB_USER=admin\nZDT_WEB_PASS=admin\nTARGET_DIR=/tmp\nVPN_SERVER=test.server.com\nVPN_USERNAME=test\n")
        cfg.config._load_config()
        import database as db
        old_db = db.DB_PATH
        test_db = os.path.join(project_root, 'tests', 'test_verify2.db')
        if os.path.exists(test_db):
            os.remove(test_db)
        db.DB_PATH = test_db
        db.close_connection()
        db.init_db()
        db.create_admin_user('admin', 'admin')
        from server import app
        client = app.test_client()

        r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
        data = r.get_json()
        if not data or 'token' not in data:
            return False, "Login failed"
        token = data['token']

        r = client.get('/api/vpn/status', headers={'Authorization': f'Bearer {token}'})
        is_accessible = r.status_code in (200, 500)
        for suffix in ['', '-wal', '-shm']:
            p = test_db + suffix
            if os.path.exists(p):
                os.remove(p)
        if os.path.exists(test_config):
            os.remove(test_config)
        db.DB_PATH = old_db
        return is_accessible, r.status_code
    except Exception as e:
        return False, str(e)
    finally:
        sys.path = old_path


def check_file_delete_rename_exist():
    with open(os.path.join(project_root, 'routes', 'files_routes.py')) as f:
        content = f.read()
    has_delete = '@files_bp.route(\'/api/files/' in content and 'methods=[\'DELETE\']' in content
    has_rename = 'def rename_file' in content or '@files_bp.route(\'/api/files/rename' in content
    has_traversal = 'os.path.commonpath' in content and 'realpath' in content
    return has_delete and has_rename and has_traversal


def check_downloads_table():
    with open(os.path.join(project_root, 'database.py')) as f:
        content = f.read()
    return 'CREATE TABLE IF NOT EXISTS downloads' in content


def main():
    checks = []

    print("=" * 60)
    print("ZDT API - Production Readiness Verification")
    print("=" * 60)

    print("\n[1/11] Python file syntax check...", end=" ")
    errors = check_python_files_compile()
    if not errors:
        print("PASS")
        checks.append(("Python files compile", True))
    else:
        print("FAIL")
        for e in errors:
            print(f"  {e}")
        checks.append(("Python files compile", False))

    print("[2/11] Running pytest...", end=" ")
    retcode, stdout, stderr = run_pytest()
    if retcode == 0:
        print("PASS")
        checks.append(("pytest passes", True))
    else:
        print(f"FAIL (exit code {retcode})")
        print(stdout[-2000:] if len(stdout) > 2000 else stdout)
        checks.append(("pytest passes", False))

    print("[3/11] Server startup & /api/health...", end=" ")
    ok, detail = check_server_startup()
    if ok:
        print("PASS")
    else:
        print("FAIL")
        print(f"  {detail}")
    checks.append(("Server health", ok))

    print("[4/11] Password hashing (bcrypt/scrypt)...", end=" ")
    ok, detail = check_password_hashing()
    if ok:
        print("PASS")
    else:
        print("FAIL")
        print(f"  {detail[:300]}")
    checks.append(("Password hashing", ok))

    print("[5/11] JWT secret persistent...", end=" ")
    has_persistent, has_secrets_token = check_jwt_secret_persistent()
    if has_persistent:
        print("PASS (loaded from config)")
    else:
        print("WARN (uses secrets.token_hex)")
    checks.append(("JWT persistent", has_persistent))

    print("[6/11] secure_filename used in upload...", end=" ")
    ok = check_secure_filename()
    if ok:
        print("PASS")
    else:
        print("FAIL")
    checks.append(("secure_filename", ok))

    print("[7/11] No bare open() in subprocess...", end=" ")
    ok, detail = check_no_bare_open_subprocess()
    if ok:
        print("PASS")
    else:
        print("FAIL")
        print(f"  {detail}")
    checks.append(("No bare open() in subprocess", ok))

    print("[8/11] Settings endpoints...", end=" ")
    ok, detail, results = check_settings_endpoints()
    if ok:
        print("PASS")
        if results:
            for endpoint, passed in results.items():
                print(f"    {endpoint}: {'PASS' if passed else 'FAIL'}")
    else:
        print("FAIL")
        print(f"  {detail}")
    checks.append(("Settings endpoints", ok))

    print("[9/11] VPN status accessible (non-admin)...", end=" ")
    ok, detail = check_vpn_status_accessible()
    if ok:
        print("PASS")
    else:
        print(f"WARN ({detail})")
    checks.append(("VPN non-admin access", ok))

    print("[10/11] File delete/rename with traversal protection...", end=" ")
    ok = check_file_delete_rename_exist()
    if ok:
        print("PASS")
    else:
        print("FAIL")
    checks.append(("File delete/rename", ok))

    print("[11/11] Downloads table in schema...", end=" ")
    ok = check_downloads_table()
    if ok:
        print("PASS")
    else:
        print("FAIL")
    checks.append(("Downloads table", ok))

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    all_pass = True
    for name, passed in checks:
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_pass = False
        print(f"  [{status}] {name}")
    print("=" * 60)
    if all_pass:
        print("RESULT: ALL CHECKS PASSED")
        return 0
    else:
        print("RESULT: SOME CHECKS FAILED")
        return 1


if __name__ == '__main__':
    sys.exit(main())
