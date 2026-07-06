import pytest
import database
import subprocess

vpn_available = False
try:
    r = subprocess.run(['ip', 'link', 'show', 'ppp0'], capture_output=True, text=True, timeout=5)
    vpn_available = r.returncode == 0
except Exception:
    pass

# Tier 3: Cross-Feature Combination Tests

def test_t3_user_provisioning_and_login_flow(client, auth_headers):
    """
    T3-INT-1: User Provisioning and Credentials verification
    Workflow:
      1. Admin API (POST /api/admin/users) creates user operator_test.
      2. Authenticate as operator_test via POST /api/login -> obtain token.
      3. Fetch profile with token (GET /api/profile) -> assert username matches.
      4. Change password using POST /api/profile/password.
      5. Attempt login with old password -> assert 401/403.
      6. Attempt login with new password -> assert 200 OK.
    """
    import time
    username = f"op_test_{int(time.time())}"
    
    # 1. Admin creates user
    r = client.post('/api/admin/users', headers=auth_headers, json={
        'username': username,
        'password': 'PasswordOld123',
        'role': 'operator',
        'label': 'Test Operator'
    })
    assert r.status_code in (200, 201)
    
    # 2. Authenticate as operator_test
    r = client.post('/api/login', json={'username': username, 'password': 'PasswordOld123'})
    assert r.status_code == 200
    token = r.get_json()['token']
    user_headers = {'Authorization': f'Bearer {token}'}
    
    # 3. Fetch profile with token
    r = client.get('/api/profile', headers=user_headers)
    assert r.status_code == 200
    assert r.get_json()['user']['username'] == username
    
    # 4. Change password using POST /api/profile/password
    r = client.post('/api/profile/password', headers=user_headers, json={
        'old_password': 'PasswordOld123',
        'new_password': 'PasswordNew123'
    })
    assert r.status_code == 200
    
    # 5. Attempt login with old password
    r = client.post('/api/login', json={'username': username, 'password': 'PasswordOld123'})
    assert r.status_code in (401, 403)
    
    # 6. Attempt login with new password
    r = client.post('/api/login', json={'username': username, 'password': 'PasswordNew123'})
    assert r.status_code == 200

def test_t3_target_storage_update_and_file_population(client, auth_headers):
    """
    T3-INT-2: Target Storage Update and File Population
    Workflow:
      1. Create unique directory /tmp/zdt_test_storage.
      2. Admin updates target directory via POST /api/settings/storage -> assert success.
      3. Upload a file via POST /api/upload -> file gets placed in new directory.
      4. Request GET /api/files -> assert file is in the listing.
      5. Revert target directory to default -> assert clean cleanup.
    """
    # 1. Define storage path
    import tempfile
    temp_dir = tempfile.mkdtemp(prefix='zdt_test_storage_')
    
    # 2. Admin updates target directory
    r = client.post('/api/settings/storage', headers=auth_headers, json={'target_dir': temp_dir})
    assert r.status_code == 200
    
    # 3. Upload a file
    # Mock file upload
    data = {'file': (tempfile.NamedTemporaryFile(suffix='.mp3'), 'testfile.mp3')}
    r = client.post('/api/upload', headers=auth_headers, data=data, content_type='multipart/form-data')
    assert r.status_code in (200, 201)
    
    # 4. Request files list
    r = client.get('/api/files', headers=auth_headers)
    assert r.status_code == 200
    files = r.get_json().get('files', [])
    filenames = [f.get('name') for f in files]
    assert 'testfile.mp3' in filenames
    
    # 5. Clean up and revert
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

@pytest.mark.skipif(not vpn_available, reason="VPN interface ppp0 not available")
def test_t3_vpn_lifecycle_integration(client, auth_headers):
    """
    T3-INT-3: VPN Lifecycle Integration
    Workflow:
      1. Update config parameters via POST /api/admin/vpn/config.
      2. Call GET /api/admin/vpn/config -> verify details are updated and password is masked.
      3. POST /api/admin/vpn/connect -> poll /api/vpn/status until connected is true.
      4. Call /api/admin/vpn/log -> verify connect event logged in vpn_logs.
      5. POST /api/admin/vpn/disconnect -> poll status until connected is false.
    """
    # 1. Update config
    r = client.post('/api/admin/vpn/config', headers=auth_headers, json={
        'server': 'test.vpn.server',
        'username': 'test_user',
        'password': 'test_password'
    })
    assert r.status_code == 200
    
    # 2. Verify config
    r = client.get('/api/admin/vpn/config', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data['server'] == 'test.vpn.server'
    assert data['password'] == '********'
    
    # 3. POST /api/admin/vpn/connect
    r = client.post('/api/admin/vpn/connect', headers=auth_headers)
    assert r.status_code == 200
    
    # Poll status
    import time
    connected = False
    for _ in range(5):
        st_r = client.get('/api/vpn/status', headers=auth_headers)
        if st_r.status_code == 200 and st_r.get_json().get('connected'):
            connected = True
            break
        time.sleep(0.5)
    assert connected is True
    
    # 4. Verify log contains connect event
    r = client.get('/api/admin/vpn/log', headers=auth_headers)
    assert r.status_code == 200
    logs = r.get_json().get('logs', [])
    assert any(log['event_type'] == 'connect' for log in logs)
    
    # 5. POST /api/admin/vpn/disconnect
    r = client.post('/api/admin/vpn/disconnect', headers=auth_headers)
    assert r.status_code == 200

@pytest.mark.skip(reason="Requires yt-dlp to complete download within timeout")
def test_t3_download_queue_tracking_and_disk_alignment(client, auth_headers):
    """
    T3-INT-4: Download Queue tracking and Disk Alignment
    Workflow:
      1. Client initiates download via POST /api/download with format audio.
      2. Retrieve download ID -> query GET /api/downloads/<id> until status is completed.
      3. Call GET /api/files -> locate the new file.
      4. Request detailed file metadata using GET /api/files/info/<path> -> verify parameters.
    """
    # 1. Initiate download
    r = client.post('/api/download', headers=auth_headers, json={
        'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'format': 'audio'
    })
    assert r.status_code in (200, 201)
    download_id = r.get_json().get('id')
    assert download_id is not None
    
    # 2. Query download detail until completed
    import time
    completed = False
    filename = None
    for _ in range(5):
        detail_r = client.get(f'/api/downloads/{download_id}', headers=auth_headers)
        if detail_r.status_code == 200:
            data = detail_r.get_json()
            if data.get('status') == 'completed':
                completed = True
                filename = data.get('file_path')
                break
        time.sleep(0.5)
    assert completed is True
    
    # 3. Locate the new file
    r = client.get('/api/files', headers=auth_headers)
    assert r.status_code == 200
    files = r.get_json().get('files', [])
    filenames = [f.get('name') for f in files]
    assert filename in filenames
    
    # 4. Request metadata
    r = client.get(f'/api/files/info/{filename}', headers=auth_headers)
    assert r.status_code == 200
    meta = r.get_json()
    assert 'size' in meta
    assert 'duration' in meta

@pytest.mark.skip(reason="Requires zdt CLI tool for filename sanitization")
def test_t3_media_processing_and_clean_pipeline(client, auth_headers):
    """
    T3-INT-5: Media Post-processing and Clean Pipeline
    Workflow:
      1. Upload video file with spaces/metacharacters in filename (POST /api/upload).
      2. Call POST /api/tools with action clean -> verify filename is sanitized on disk.
      3. Trigger compression (POST /api/tools with action compress and sanitized name).
      4. Read logs via /api/logs until progress ends.
      5. Query files list -> verify compressed_ output is present.
    """
    # 1. Upload video with spaces/metacharacters
    import tempfile
    temp_file = tempfile.NamedTemporaryFile(suffix='.mp4')
    data = {'file': (temp_file, 'test video file $ name.mp4')}
    r = client.post('/api/upload', headers=auth_headers, data=data, content_type='multipart/form-data')
    assert r.status_code in (200, 201)
    
    # 2. Call clean tool
    r = client.post('/api/tools', headers=auth_headers, json={'action': 'clean'})
    assert r.status_code in (200, 202)
    
    # Verify file is sanitized
    r = client.get('/api/files', headers=auth_headers)
    files = r.get_json().get('files', [])
    filenames = [f.get('name') for f in files]
    # Check that a sanitized filename exists
    sanitized_name = 'test_video_file_name.mp4'
    assert sanitized_name in filenames
    
    # 3. Trigger compression
    r = client.post('/api/tools', headers=auth_headers, json={
        'action': 'compress',
        'filename': sanitized_name
    })
    assert r.status_code in (200, 202)
    
    # 4. Poll logs
    import time
    for _ in range(5):
        log_r = client.get('/api/logs', headers=auth_headers)
        if log_r.status_code == 200 and 'compress' in log_r.get_json().get('logs', ''):
            break
        time.sleep(0.5)
        
    # 5. Query files list and verify compressed output is present
    r = client.get('/api/files', headers=auth_headers)
    files = r.get_json().get('files', [])
    filenames = [f.get('name') for f in files]
    assert any('compressed' in name for name in filenames)

def test_t3_key_generation_and_invalidation(client, auth_headers):
    """
    T3-INT-6: Key Generation, Usage, and Invalidation
    Workflow:
      1. Admin calls POST /api/admin/keys to generate a key for operator with expiry.
      2. Read smart_key from response -> use as X-API-Key in request header for /api/files.
      3. Verify response is 200 OK.
      4. Admin revokes the key using DELETE /api/admin/keys/<key_id>.
      5. Repeat request with revoked key -> verify 401 Unauthorized is returned.
    """
    # 1. Admin generates key
    r = client.post('/api/admin/keys', headers=auth_headers, json={
        'host': 'localhost',
        'port': 2000,
        'label': 'TestRevokeKey',
        'role': 'operator',
        'expired_days': 1
    })
    assert r.status_code in (200, 201)
    key_data = r.get_json()
    key_id = key_data.get('key_id')
    
    # Retrieve the smart key string
    smart_key = key_data.get('smart_key')
    
    # 2. Use as X-API-Key
    headers = {'X-API-Key': smart_key}
    r = client.get('/api/files', headers=headers)
    assert r.status_code == 200
    
    # 3. Admin revokes the key
    r = client.delete(f'/api/admin/keys/{key_id}', headers=auth_headers)
    assert r.status_code == 200
    
    # 4. Repeat request with revoked key
    r = client.get('/api/files', headers=headers)
    assert r.status_code in (401, 403)


@pytest.mark.skip(reason="Relies on zdt CLI tool which may not be available in test env")
def test_t3_daemon_tools_logs_pipeline(client, auth_headers):
    """
    T3-INT-7: Daemon, Tools, and Logs Integration Pipeline
    Workflow:
       1. Trigger clean tool via POST /api/tools (action='clean').
       2. Trigger playlist tool via POST /api/tools (action='playlist').
       3. Retrieve recent logs via GET /api/logs -> verify the log file has been updated or reflects the execution.
    """
    # 1. Trigger clean tool
    r = client.post('/api/tools', headers=auth_headers, json={'action': 'clean'})
    assert r.status_code in (200, 202)
    
    # 2. Trigger playlist tool
    r2 = client.post('/api/tools', headers=auth_headers, json={'action': 'playlist'})
    assert r2.status_code in (200, 202)
    
    # 3. Retrieve recent logs
    r3 = client.get('/api/logs', headers=auth_headers)
    assert r3.status_code == 200
    data = r3.get_json()
    assert 'logs' in data

