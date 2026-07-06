import pytest
import json
import base64
from database import get_connection, generate_api_key, get_smart_api_key_string
from config import config

# Helper to generate headers
def make_bearer_headers(token):
    return {'Authorization': f'Bearer {token}'}

def make_api_key_headers(smart_key):
    return {'X-API-Key': smart_key}

def test_m4_unauthorized_access(client):
    """Verify that all settings and profile endpoints reject unauthorized requests with 401."""
    endpoints = [
        ('/api/settings', 'GET', None),
        ('/api/settings', 'POST', {}),
        ('/api/settings/download', 'GET', None),
        ('/api/settings/download', 'POST', {}),
        ('/api/settings/telegram', 'GET', None),
        ('/api/settings/telegram', 'POST', {}),
        ('/api/settings/telegram/test', 'POST', {}),
        ('/api/server/info', 'GET', None),
        ('/api/settings/storage', 'POST', {'target_dir': '/tmp/test'}),
        ('/api/profile', 'GET', None),
        ('/api/profile', 'PUT', {'label': 'New Label'}),
        ('/api/profile/password', 'POST', {'old_password': 'a', 'new_password': 'b'}),
    ]
    
    for url, method, payload in endpoints:
        # Test 1: No auth headers
        if method == 'GET':
            r = client.get(url)
        elif method == 'POST':
            r = client.post(url, json=payload)
        elif method == 'PUT':
            r = client.put(url, json=payload)
        assert r.status_code == 401, f"{method} {url} without auth headers did not return 401. Got {r.status_code}"
        
        # Test 2: Invalid Bearer token
        headers = {'Authorization': 'Bearer invalid_token_xyz'}
        if method == 'GET':
            r = client.get(url, headers=headers)
        elif method == 'POST':
            r = client.post(url, json=payload, headers=headers)
        elif method == 'PUT':
            r = client.put(url, json=payload, headers=headers)
        assert r.status_code == 401, f"{method} {url} with invalid Bearer token did not return 401. Got {r.status_code}"

        # Test 3: Invalid API key
        headers = {'X-API-Key': 'invalid_api_key_xyz'}
        if method == 'GET':
            r = client.get(url, headers=headers)
        elif method == 'POST':
            r = client.post(url, json=payload, headers=headers)
        elif method == 'PUT':
            r = client.put(url, json=payload, headers=headers)
        assert r.status_code == 401, f"{method} {url} with invalid API key did not return 401. Got {r.status_code}"


def test_m4_settings_role_privilege_boundaries(client, auth_headers):
    """Test whether settings endpoints check roles or if they leak to any authenticated user/key."""
    # 1. Create an operator user
    r = client.post('/api/admin/users', json={
        'username': 'operator_user',
        'password': 'operator_password',
        'role': 'operator',
        'label': 'Operator User'
    }, headers=auth_headers)
    assert r.status_code == 200, f"Failed to create operator user: {r.get_data(as_text=True)}"
    
    # 2. Login as operator
    r = client.post('/api/login', json={
        'username': 'operator_user',
        'password': 'operator_password'
    })
    assert r.status_code == 200
    op_token = r.get_json()['token']
    op_headers = make_bearer_headers(op_token)
    
    # 3. Read settings as operator
    r = client.get('/api/settings', headers=op_headers)
    # If the system allows operators to read/write settings, this passes.
    # Let's inspect the status code and output to see if there's authorization bypass.
    print(f"Operator read settings response: {r.status_code}, {r.get_data(as_text=True)}")
    
    # 4. Try updating settings as operator
    r = client.post('/api/settings', json={
        'download': {
            'default_format': 'video'
        }
    }, headers=op_headers)
    print(f"Operator update settings response: {r.status_code}, {r.get_data(as_text=True)}")


def test_m4_settings_validations(client, auth_headers):
    """Verify validation boundaries and invalid payloads on settings endpoints."""
    # A. Storage validation
    # Relative path target_dir
    r = client.post('/api/settings/storage', json={'target_dir': 'relative/path'}, headers=auth_headers)
    assert r.status_code == 400
    assert r.get_json()['error'] == 'Path must be absolute' or r.get_json()['error'] == 'VALIDATION_ERROR'

    # Empty target_dir
    r = client.post('/api/settings/storage', json={'target_dir': ''}, headers=auth_headers)
    assert r.status_code == 400
    
    # B. Batch Settings Validations (/api/settings)
    # Invalid default_format
    r = client.post('/api/settings', json={
        'download': {'default_format': 'invalid_fmt'}
    }, headers=auth_headers)
    assert r.status_code == 400
    
    # Invalid Telegram bot token format
    r = client.post('/api/settings', json={
        'telegram': {'bot_token': 'short_token'}
    }, headers=auth_headers)
    assert r.status_code == 400
    
    # Invalid Telegram chat_id format
    r = client.post('/api/settings', json={
        'telegram': {'chat_id': 'not_an_int'}
    }, headers=auth_headers)
    assert r.status_code == 400

    # Invalid Notifications field type
    r = client.post('/api/settings', json={
        'notifications': {'notify_on_download_complete': 'not_a_bool'}
    }, headers=auth_headers)
    assert r.status_code == 400
    
    # Invalid server port (out of bounds)
    r = client.post('/api/settings', json={
        'server': {'port': 999999}
    }, headers=auth_headers)
    assert r.status_code == 400
    
    # Invalid server port (negative)
    r = client.post('/api/settings', json={
        'server': {'port': -1}
    }, headers=auth_headers)
    assert r.status_code == 400
    
    # Invalid VPN server (empty)
    r = client.post('/api/settings', json={
        'vpn': {'server': ''}
    }, headers=auth_headers)
    assert r.status_code == 400


def test_m4_profile_validations_and_updates(client, auth_headers):
    """Verify validation boundaries and password update flows."""
    # 1. Profile GET
    r = client.get('/api/profile', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data['success'] is True
    assert data['user']['username'] == 'admin'
    
    # 2. Profile PUT (update display label) - empty label rejection
    r = client.put('/api/profile', json={'label': '   '}, headers=auth_headers)
    assert r.status_code == 400
    assert r.get_json()['error'] == 'VALIDATION_ERROR'
    
    # Profile PUT success
    r = client.put('/api/profile', json={'label': 'Super Administrator'}, headers=auth_headers)
    assert r.status_code == 200
    assert r.get_json()['user']['label'] == 'Super Administrator'
    
    # 3. Password update validation (missing old/new)
    r = client.post('/api/profile/password', json={'old_password': 'admin'}, headers=auth_headers)
    assert r.status_code == 400
    
    # Password update validation (short password)
    r = client.post('/api/profile/password', json={'old_password': 'admin', 'new_password': 'abc'}, headers=auth_headers)
    assert r.status_code == 400
    
    # Password update validation (incorrect old password)
    r = client.post('/api/profile/password', json={'old_password': 'wrong_password', 'new_password': 'newadminpass'}, headers=auth_headers)
    assert r.status_code == 400
    assert r.get_json()['error'] == 'INVALID_CREDENTIALS'

    # Password update success
    r = client.post('/api/profile/password', json={'old_password': 'admin', 'new_password': 'newadminpass'}, headers=auth_headers)
    assert r.status_code == 200
    
    # Verify we can login with the new password
    r = client.post('/api/login', json={'username': 'admin', 'password': 'newadminpass'})
    assert r.status_code == 200
    assert 'token' in r.get_json()


def test_m4_profile_mobile_key_admin_hijack(client, auth_headers):
    """Verify if a mobile API key with no 'created_by' user can hijack the admin profile."""
    # 1. Create an API key with created_by = NULL
    # We will insert it directly or use generate_api_key and update created_by to NULL
    key_id, secret = generate_api_key('localhost', 2000, 'Test Mobile Key', 'full', 0, None)
    
    # Update created_by to NULL in DB to simulate a system key or orphaned key
    conn = get_connection()
    conn.execute('UPDATE api_keys SET created_by = NULL WHERE key_id = ?', (key_id,))
    conn.commit()
    
    smart_key = get_smart_api_key_string(key_id, secret, 'localhost', 2000, 'Test Mobile Key', 'full', None)
    mobile_headers = make_api_key_headers(smart_key)
    
    # 2. Get profile using the mobile API key
    r = client.get('/api/profile', headers=mobile_headers)
    assert r.status_code == 200
    profile_data = r.get_json()
    print(f"Profile fetched via mobile API key: {profile_data}")
    
    # If the response user is 'admin', it confirms the hijack vulnerability!
    is_admin = profile_data.get('user', {}).get('username') == 'admin'
    print(f"Vulnerability Confirmation: Mobile API key hijacked admin profile? {is_admin}")
    
    # 3. Try to update profile label via mobile API key
    r = client.put('/api/profile', json={'label': 'Hijacked Label'}, headers=mobile_headers)
    print(f"Update profile via mobile key response: {r.status_code}, {r.get_data(as_text=True)}")
    
    # Fetch admin profile to check if it got updated
    r = client.get('/api/profile', headers=auth_headers)
    print(f"Admin profile after mobile key update: {r.get_json()}")
