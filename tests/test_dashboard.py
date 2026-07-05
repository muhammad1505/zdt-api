import json

def test_dashboard_requires_auth(client):
    r = client.get('/api/admin/dashboard')
    assert r.status_code in (401, 403)

def test_dashboard_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/dashboard', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'cpu' in data
    assert 'memory' in data
    assert 'disk' in data
    assert 'uptime_hours' in data

def test_dashboard_cpu_structure(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/dashboard', headers=auth_headers)
    data = r.get_json()
    cpu = data.get('cpu', {})
    assert 'load_1m' in cpu
    assert 'load_5m' in cpu
    assert 'load_15m' in cpu

def test_dashboard_memory_structure(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/dashboard', headers=auth_headers)
    data = r.get_json()
    mem = data.get('memory', {})
    assert 'total_gb' in mem
    assert 'available_gb' in mem

def test_disk_all_fields(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/dashboard', headers=auth_headers)
    data = r.get_json()
    disk = data.get('disk', {})
    assert 'total' in disk
    assert 'free' in disk
    assert 'used' in disk
