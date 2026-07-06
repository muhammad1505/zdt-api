import sys, os, json, pytest

# Get project root and put it on python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Intercept and redirect the config.env path before other imports
import config
test_config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_config.env')
config.config.config_path = test_config_path

# Seed default config values
with open(test_config_path, 'w') as f:
    f.write("ZDT_WEB_USER=admin\nZDT_WEB_PASS=admin\nTARGET_DIR=tests/test_downloads\n")

# Reload config inside config object
config.config._load_config()

# Create the test downloads folder inside tests directory
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_downloads'), exist_ok=True)

# Intercept the database path
import database
test_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test_zdt_api.db')
database.DB_PATH = test_db_path

# Clean up any leftover database file before starting
if os.path.exists(test_db_path):
    try:
        os.remove(test_db_path)
    except Exception:
        pass

# Now import server after setting the path so create_app() uses the redirected database.
from server import app as flask_app

# Register a teardown_appcontext handler to release connection handles after each test request
@flask_app.teardown_appcontext
def close_db_connection(exception=None):
    database.close_connection()

@pytest.fixture
def app():
    flask_app.config['TESTING'] = True
    return flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def auth_token(client):
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    data = r.get_json()
    if r.status_code == 200 and data:
        return data.get('token', '')
    return None

@pytest.fixture
def auth_headers(auth_token):
    if auth_token:
        return {'Authorization': f'Bearer {auth_token}'}
    return {}

def vpn_available():
    """Check if VPN interface exists (skip VPN tests when not available)."""
    import subprocess
    try:
        r = subprocess.run(['ip', 'link', 'show', 'ppp0'],
                          capture_output=True, text=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


@pytest.fixture
def test_file():
    """Create a test file in the target directory for rename tests."""
    target_dir = config.config.get_target_dir()
    filepath = os.path.join(target_dir, 'existing.mp3')
    with open(filepath, 'w') as f:
        f.write('test')
    yield 'existing.mp3'
    if os.path.exists(filepath):
        os.remove(filepath)


@pytest.fixture
def test_download_record():
    """Create a download record in the database for detail/retry tests."""
    conn = database.get_connection()
    conn.execute(
        'INSERT INTO downloads (url, title, format, status, created_by) '
        'VALUES (?, ?, ?, ?, ?)',
        ('https://example.com/test.mp3', 'Test Song', 'mp3', 'failed', 1)
    )
    conn.commit()
    download_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    database.close_connection()
    return download_id


# Clean up at the end of the session
@pytest.fixture(scope="session", autouse=True)
def cleanup_database():
    yield
    # Close any active SQLite connections in the current thread/process
    if hasattr(database, '_local') and database._local.conn is not None:
        try:
            database._local.conn.close()
        except Exception:
            pass
        database._local.conn = None
    
    # Remove the database file and its WAL/SHM files
    for suffix in ['', '-wal', '-shm']:
        p = test_db_path + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    # Clean up test_config.env
    if os.path.exists(test_config_path):
        try:
            os.remove(test_config_path)
        except Exception:
            pass


@pytest.fixture(autouse=True)
def isolate_database():
    # Close any active SQLite connection in the current thread
    database.close_connection()

    # Delete the temporary database and its WAL/SHM files
    for suffix in ['', '-wal', '-shm']:
        p = test_db_path + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    # Call init_db and create_admin_user to seed it cleanly
    database.init_db()
    database.create_admin_user("admin", "admin")

    yield

    # Clean up connection after the test to avoid locking
    database.close_connection()
    
    # Delete the temporary database and its WAL/SHM files
    for suffix in ['', '-wal', '-shm']:
        p = test_db_path + suffix
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass



