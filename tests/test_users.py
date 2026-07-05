import json

def test_list_users_requires_auth(client):
    r = client.get('/api/admin/users')
    assert r.status_code in (401, 403)

def test_list_users_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/admin/users', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'users' in data
    assert isinstance(data['users'], list)
    assert len(data['users']) > 0

def test_create_user(client, auth_headers):
    if not auth_headers:
        return
    import time
    suffix = str(int(time.time()))[-6:]
    r = client.post('/api/admin/users', headers=auth_headers,
                    json={'username': f'testuser{suffix}', 'password': 'test123', 'role': 'operator'})
    assert r.status_code in (200, 201)
    r = client.get('/api/admin/users', headers=auth_headers)
    users = r.get_json().get('users', [])
    usernames = [u.get('username') for u in users]
    assert f'testuser{suffix}' in usernames

def test_delete_user(client, auth_headers):
    if not auth_headers:
        return
    import time
    suffix = str(int(time.time()))[-6:]
    r = client.post('/api/admin/users', headers=auth_headers,
                    json={'username': f'deleteme{suffix}', 'password': 'test123', 'role': 'operator'})
    assert r.status_code in (200, 201)
    r = client.get('/api/admin/users', headers=auth_headers)
    users = r.get_json().get('users', [])
    target = next((u for u in users if u['username'] == f'deleteme{suffix}'), None)
    if target:
        r = client.delete(f'/api/admin/users/{target["id"]}', headers=auth_headers)
        assert r.status_code == 200

def test_create_user_duplicate(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/admin/users', headers=auth_headers,
                    json={'username': 'admin', 'password': 'test123'})
    # Should return error, either 400, 409, or 500 with error message
    assert r.status_code >= 400
    data = r.get_json()
    assert data is not None
    assert 'error' in data
