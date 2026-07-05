import json

def test_tools_requires_auth(client):
    r = client.post('/api/tools', json={'action': 'clean'})
    assert r.status_code in (401, 403)

def test_tools_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/tools', headers=auth_headers, json={'action': 'clean'})
    # Tools execute asynchronously, so we just check response structure
    assert r.status_code in (200, 202)

def test_tools_invalid_action(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/tools', headers=auth_headers, json={'action': 'nonexistent'})
    assert r.status_code in (400, 404)

def test_config_requires_auth(client):
    r = client.get('/api/admin/config')
    assert r.status_code in (401, 403)

def test_config_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/config', headers=auth_headers)
    assert r.status_code == 200

def test_activity_requires_auth(client):
    r = client.get('/api/admin/activity')
    assert r.status_code in (401, 403)

def test_activity_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/activity', headers=auth_headers)
    assert r.status_code == 200
