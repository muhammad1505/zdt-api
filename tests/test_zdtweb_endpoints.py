"""Integration tests for endpoints ported from zdt-web.py to server.py route blueprints."""
import json
import pytest


# === STATS RESET ===

def test_stats_reset_requires_auth(client):
    r = client.post('/api/stats/reset')
    assert r.status_code in (401, 403)


def test_stats_reset_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/stats/reset', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data.get('success') is True


# === SYSTEM LOGS ===

def test_system_logs_requires_auth(client):
    r = client.get('/api/system/logs')
    assert r.status_code in (401, 403)


def test_system_logs_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/system/logs', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    # 'entries' might be empty but should exist
    assert 'entries' in data
    assert 'source' in data


def test_system_logs_with_lines_param(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/system/logs?lines=10', headers=auth_headers)
    assert r.status_code == 200


# === UPDATE CHECK ===

def test_update_check_requires_admin(client):
    """update-check requires admin (not just auth)."""
    r = client.get('/api/update-check')
    assert r.status_code in (401, 403)


def test_update_check_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/update-check', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    # Since Flask's jsonify with dict returns JSON, but the endpoint uses
    # _ju.dumps() + Content-Type header, the response should be valid JSON
    assert data is not None
    assert 'has_update' in data
    assert 'current' in data


# === METADATA ===

def test_metadata_requires_auth(client):
    r = client.post('/api/metadata', json={'filename': 'test.mp3'})
    assert r.status_code in (401, 403)


def test_metadata_missing_file(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/metadata', headers=auth_headers,
                    json={'filename': 'nonexistent.mp3', 'title': 'Test'})
    assert r.status_code == 404


def test_metadata_missing_fields(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/metadata', headers=auth_headers,
                    json={'filename': 'test.mp3'})
    # Must provide title or artist
    assert r.status_code == 400


# === PLAYLIST ITEMS ===

def test_playlist_items_requires_auth(client):
    r = client.post('/api/playlist/items', json={'url': 'http://example.com'})
    assert r.status_code in (401, 403)


def test_playlist_items_empty_url(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/playlist/items', headers=auth_headers,
                    json={'url': ''})
    assert r.status_code == 400


# === SPOTIFY SYNC ===

def test_spotify_sync_requires_auth(client):
    r = client.post('/api/spotify-sync', json={'url': 'http://example.com'})
    assert r.status_code in (401, 403)


def test_spotify_sync_invalid_url(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/spotify-sync', headers=auth_headers,
                    json={'url': 'not-a-url'})
    assert r.status_code == 400


# === DOWNLOAD SELECTED ===

def test_download_selected_requires_auth(client):
    r = client.post('/api/download-selected', json={'urls': []})
    assert r.status_code in (401, 403)


def test_download_selected_empty_urls(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/download-selected', headers=auth_headers,
                    json={'urls': []})
    assert r.status_code == 400


# === SCHEDULER ===

def test_scheduler_status_requires_auth(client):
    r = client.get('/api/scheduler/status')
    assert r.status_code in (401, 403)


def test_scheduler_status_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/scheduler/status', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'running' in data


def test_scheduler_playlists_get_requires_auth(client):
    r = client.get('/api/scheduler/playlists')
    assert r.status_code in (401, 403)


def test_scheduler_playlists_get_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/scheduler/playlists', headers=auth_headers)
    assert r.status_code == 200


def test_scheduler_playlists_post_requires_auth(client):
    r = client.post('/api/scheduler/playlists', json={})
    assert r.status_code in (401, 403)


def test_scheduler_playlists_post_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/scheduler/playlists', headers=auth_headers,
                    json={'playlists': []})
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data.get('success') is True


# === NOTIFY ===

def test_notify_config_get_requires_auth(client):
    r = client.get('/api/notify/config')
    assert r.status_code in (401, 403)


def test_notify_config_get_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/notify/config', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'configured' in data


def test_notify_config_post_requires_auth(client):
    r = client.post('/api/notify/config', json={})
    assert r.status_code in (401, 403)


def test_notify_config_post_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/notify/config', headers=auth_headers,
                    json={'token': 'test:123', 'chat_id': '12345'})
    assert r.status_code == 200


def test_notify_test_requires_auth(client):
    r = client.post('/api/notify/test')
    assert r.status_code in (401, 403)


# === SERVER INFO ===

def test_server_info_requires_auth(client):
    r = client.get('/api/server/info')
    assert r.status_code in (401, 403)


def test_server_info_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.get('/api/server/info', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert 'version' in data
    assert 'tools' in data
    assert 'ip_addresses' in data
    assert 'storage' in data


# === LOGS CLEAR ===

def test_logs_clear_requires_auth(client):
    r = client.post('/api/logs/clear')
    assert r.status_code in (401, 403)


def test_logs_clear_success(client, auth_headers):
    if not auth_headers:
        return
    r = client.post('/api/logs/clear', headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()
    assert data is not None
    assert data.get('success') is True
