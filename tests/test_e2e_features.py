import pytest
import base64
import database
import subprocess

vpn_available = False
try:
    r = subprocess.run(['ip', 'link', 'show', 'ppp0'], capture_output=True, text=True, timeout=5)
    vpn_available = r.returncode == 0
except Exception:
    pass

# Feature 1: Authentication & Keys (Happy Path)

def test_auth_login_db_admin_success(client):
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'token' in data
    assert 'user' in data
    assert data['user']['username'] == 'admin'

def test_auth_verify_smart_key_success(client):
    # Let's generate a valid key first
    key_id, secret = database.generate_api_key('localhost', 2000, 'TestKey', 'full', 1, 1)
    smart_key = database.get_smart_api_key_string(key_id, secret, 'localhost', 2000, 'TestKey', 'full', '')
    
    r = client.post('/api/verify-key', json={'key': smart_key})
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('valid') is True
    assert data.get('label') == 'TestKey'

def test_auth_get_csrf_token_success(client, auth_headers):
    r = client.get('/api/csrf-token', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert 'csrf_token' in data

def test_auth_health_check_success(client):
    r = client.get('/api/health')
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('status') == 'ok'
    assert 'version' in data
    assert 'uptime' in data

def test_auth_generate_api_key_success(client, auth_headers):
    r = client.post('/api/admin/keys', headers=auth_headers, json={
        'host': '127.0.0.1',
        'port': 3000,
        'label': 'NewApiKey',
        'role': 'operator',
        'expired_days': 5
    })
    assert r.status_code in (200, 201)
    data = r.get_json()
    assert data.get('success') is True
    assert 'key_id' in data
    assert 'smart_key' in data


# Feature 2: Profiles (Happy Path)

def test_profile_get_success(client, auth_headers):
    r = client.get('/api/profile', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'user' in data
    assert data['user']['username'] == 'admin'

def test_profile_update_label_success(client, auth_headers):
    r = client.put('/api/profile', headers=auth_headers, json={'label': 'New Display Name'})
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert data['user']['label'] == 'New Display Name'

def test_profile_password_update_success(client, auth_headers):
    r = client.post('/api/profile/password', headers=auth_headers, json={
        'old_password': 'admin',
        'new_password': 'admin_new_pass'
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_profile_get_all_users_success(client, auth_headers):
    r = client.get('/api/admin/users', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert 'users' in data
    assert len(data['users']) > 0

def test_profile_create_operator_user_success(client, auth_headers):
    import time
    suffix = str(int(time.time()))[-6:]
    r = client.post('/api/admin/users', headers=auth_headers, json={
        'username': f'op_user_{suffix}',
        'password': 'password123',
        'role': 'operator',
        'label': 'Test Operator'
    })
    assert r.status_code in (200, 201)
    data = r.get_json()
    assert data.get('success') is True
    assert 'user_id' in data


# Feature 3: Settings (Happy Path)

def test_settings_get_all_success(client, auth_headers):
    r = client.get('/api/settings', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'storage' in data
    assert 'download' in data
    assert 'telegram' in data

def test_settings_update_batch_success(client, auth_headers):
    r = client.post('/api/settings', headers=auth_headers, json={
        'download': {'default_format': 'video'},
        'notifications': {'notify_on_download_complete': False}
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_settings_get_download_preferences(client, auth_headers):
    r = client.get('/api/settings/download', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'default_format' in data

def test_settings_update_telegram_config(client, auth_headers):
    r = client.post('/api/settings/telegram', headers=auth_headers, json={
        'bot_token': '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ',
        'chat_id': '987654321',
        'enabled': True
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_settings_test_telegram_alert(client, auth_headers):
    r = client.post('/api/settings/telegram/test', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True


# Feature 4: VPN (Happy Path)

def test_vpn_get_status_non_admin_success(client, auth_headers):
    # This endpoint is accessible by non-admin users
    r = client.get('/api/vpn/status', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'connected' in data
    assert 'ip' in data

@pytest.mark.skipif(not vpn_available, reason="VPN interface ppp0 not available")
def test_vpn_connect_trigger_success(client, auth_headers):
    r = client.post('/api/admin/vpn/connect', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_vpn_disconnect_trigger_success(client, auth_headers):
    r = client.post('/api/admin/vpn/disconnect', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_vpn_get_config_masked_success(client, auth_headers):
    from config import config
    old = config._config.get('VPN_PASSWORD')
    config._config['VPN_PASSWORD'] = 'test_password'
    try:
        r = client.get('/api/admin/vpn/config', headers=auth_headers)
        assert r.status_code == 200
        data = r.get_json()
        assert data.get('success') is True
        assert 'password' in data
        assert data['password'] == '********'
    finally:
        if old is None:
            config._config.pop('VPN_PASSWORD', None)
        else:
            config._config['VPN_PASSWORD'] = old

def test_vpn_get_logs_success(client, auth_headers):
    r = client.get('/api/admin/vpn/log', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'logs' in data


# Feature 5: File Mgmt (Happy Path)

def test_file_list_paginated_success(client, auth_headers):
    r = client.get('/api/files?page=1&per_page=5&sort=name', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'files' in data

def test_file_mkdir_success(client, auth_headers):
    r = client.post('/api/files/mkdir', headers=auth_headers, json={'name': 'test_subdir'})
    assert r.status_code in (200, 201)
    data = r.get_json()
    assert data.get('success') is True

def test_file_rename_success(client, auth_headers):
    r = client.post('/api/files/rename', headers=auth_headers, json={
        'path': 'test_subdir',
        'new_name': 'test_subdir_renamed'
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_file_get_info_success(client, auth_headers):
    r = client.get('/api/files/info/test_subdir_renamed', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'size' in data
    assert 'modified' in data

def test_file_delete_success(client, auth_headers):
    r = client.delete('/api/files/test_subdir_renamed', headers=auth_headers)
    assert r.status_code in (200, 204)
    data = r.get_json()
    if data:
        assert data.get('success') is True


# Feature 6: Downloads Mgmt (Happy Path)

def test_download_queue_success(client, auth_headers):
    r = client.post('/api/download', headers=auth_headers, json={
        'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'format': 'audio'
    })
    # The existing server has POST /api/download which returns 200 or 500, but is fire-and-forget.
    # In enhanced implementation, it queues download and returns ID. Let's assert it returns success.
    assert r.status_code in (200, 201)
    data = r.get_json()
    assert data.get('success') is True

def test_download_list_history_success(client, auth_headers):
    r = client.get('/api/downloads?page=1&per_page=10&status=all', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'downloads' in data

def test_download_get_details_success(client, auth_headers, test_download_record):
    r = client.get(f'/api/downloads/{test_download_record}', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True
    assert 'status' in data

def test_download_retry_failed_success(client, auth_headers, test_download_record):
    r = client.post(f'/api/downloads/retry/{test_download_record}', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data.get('success') is True

def test_download_clear_history_success(client, auth_headers):
    r = client.delete('/api/downloads/history', headers=auth_headers)
    assert r.status_code in (200, 204)
    data = r.get_json()
    if data:
        assert data.get('success') is True


# Feature 7: Daemon & Server Tools (Happy Path)

def test_daemon_start_stop_success(client, auth_headers):
    r = client.post('/api/daemon', headers=auth_headers, json={
        'service': 'watch',
        'action': 'start'
    })
    assert r.status_code == 200
    assert r.get_json().get('success') is True
    
    r = client.post('/api/daemon', headers=auth_headers, json={
        'service': 'watch',
        'action': 'stop'
    })
    assert r.status_code == 200
    assert r.get_json().get('success') is True

def test_tools_clean_success(client, auth_headers):
    r = client.post('/api/tools', headers=auth_headers, json={
        'action': 'clean'
    })
    assert r.status_code == 200
    assert r.get_json().get('success') is True

def test_tools_playlist_success(client, auth_headers):
    r = client.post('/api/tools', headers=auth_headers, json={
        'action': 'playlist'
    })
    assert r.status_code == 200
    assert r.get_json().get('success') is True

def test_logs_recent_success(client, auth_headers):
    r = client.get('/api/logs', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert 'logs' in data

def test_logs_clear_success(client, auth_headers):
    r = client.post('/api/logs/clear', headers=auth_headers)
    assert r.status_code == 200
    assert r.get_json().get('success') is True

