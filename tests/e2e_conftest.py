"""Shared fixtures for e2e tests."""
import pytest
import os
import database
from config import config


@pytest.fixture
def test_file(client, auth_headers):
    """Create a test file in the target directory."""
    target_dir = config.get_target_dir()
    filepath = os.path.join(target_dir, 'existing.mp3')
    with open(filepath, 'w') as f:
        f.write('test')
    yield 'existing.mp3'
    if os.path.exists(filepath):
        os.remove(filepath)


@pytest.fixture
def test_download_record(client, auth_headers):
    """Create a download record in the database."""
    db_path = database.DB_PATH
    database.close_connection()
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


def requires_vpn():
    """Check if VPN environment is available."""
    result = os.system('which pppd > /dev/null 2>&1 && ip link show ppp0 > /dev/null 2>&1')
    return result == 0


vpn_available = requires_vpn()
