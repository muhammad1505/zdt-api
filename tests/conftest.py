import sys, os, json, pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

@pytest.fixture
def app():
    from server import app
    app.config['TESTING'] = True
    return app

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
