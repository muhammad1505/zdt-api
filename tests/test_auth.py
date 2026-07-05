import json

def test_health(client):
    r = client.get('/api/health')
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'status' in data
    assert data['status'] == 'ok'

def test_login_success(client):
    r = client.post('/api/login', json={'username': 'admin', 'password': 'admin'})
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'token' in data
    assert 'user' in data

def test_login_fail(client):
    r = client.post('/api/login', json={'username': 'admin', 'password': 'wrongpass'})
    assert r.status_code in (401, 403)

def test_login_no_json(client):
    r = client.post('/api/login', data='not json')
    assert r.status_code in (400, 401, 403)

def test_verify_key_format(client):
    r = client.post('/api/verify-key', json={'smart_key': 'invalid-key-format'})
    assert r.status_code in (400, 401)

def test_health_response_structure(client):
    r = client.get('/api/health')
    data = r.get_json()
    assert 'version' in data
    assert 'uptime' in data
