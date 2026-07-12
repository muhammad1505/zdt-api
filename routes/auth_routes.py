from flask import Blueprint, request, jsonify, g
import time
import secrets
import threading

_start_time = time.time()

from auth import requires_auth, generate_bearer_token
from database import verify_user, parse_smart_api_key, validate_api_key, get_connection
from config import config

# === Brute-force protection ===
_login_attempts: dict[str, list[float]] = {}
_login_lock = threading.Lock()
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW = 300  # 5 minutes
LOGIN_BLOCK_DURATION = 900  # 15 minutes
_login_blocked: dict[str, float] = {}

def _check_login_rate_limit(ip: str) -> bool:
    now = time.time()
    with _login_lock:
        if ip in _login_blocked:
            if now - _login_blocked[ip] < LOGIN_BLOCK_DURATION:
                return False
            del _login_blocked[ip]
        attempts = [t for t in _login_attempts.get(ip, []) if now - t < LOGIN_WINDOW]
        if len(attempts) >= LOGIN_MAX_ATTEMPTS:
            _login_blocked[ip] = now
            del _login_attempts[ip]
            return False
        _login_attempts[ip] = attempts
    return True

def _record_login_attempt(ip: str, success: bool):
    now = time.time()
    with _login_lock:
        if success:
            _login_attempts.pop(ip, None)
            _login_blocked.pop(ip, None)
        else:
            if ip not in _login_attempts:
                _login_attempts[ip] = []
            _login_attempts[ip].append(now)

# === Refresh token store ===
REFRESH_TOKENS: dict[str, dict] = {}
_refresh_lock = threading.Lock()

def _generate_refresh_token(user_id: int, username: str, role: str) -> str:
    token = 'zdt_rt_' + secrets.token_hex(32)
    with _refresh_lock:
        REFRESH_TOKENS[token] = {
            'user_id': user_id,
            'username': username,
            'role': role,
            'created_at': time.time(),
            'expires_at': time.time() + 86400 * 30  # 30 days
        }
    return token

auth_bp = Blueprint('auth', __name__)


def get_current_user():
    conn = get_connection()
    user_id = None
    if getattr(g, 'auth_type', None) == 'admin':
        user_id = g.user.get('user_id')
    elif getattr(g, 'auth_type', None) == 'mobile':
        user_id = g.api_key.get('created_by')
    
    if user_id is not None:
        user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        if user:
            return dict(user)
    
    # Basic Auth fallback
    if getattr(g, 'auth_type', None) == 'basic' and hasattr(g, 'user'):
        username = g.user.get('username', config.get_web_user())
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        if user:
            return dict(user)
    
    # Admin auth but user not found in DB: return emergency fallback
    if getattr(g, 'auth_type', None) == 'admin':
        return {
            'id': 0,
            'username': g.user.get('username', 'admin'),
            'role': g.user.get('role', 'admin'),
            'label': 'Administrator'
        }
    
    return None


@auth_bp.route('/api/login', methods=['POST'])
def login():
    """Admin login - returns Bearer token + refresh token."""
    ip = request.remote_addr or 'unknown'
    if not _check_login_rate_limit(ip):
        return jsonify({'error': 'Too many login attempts. Try again in 15 minutes.'}), 429

    data = request.get_json(silent=True) or {}
    username = data.get('username', '')
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    user = verify_user(username, password)
    if not user:
        if username == config.get_web_user() and password == config.get_web_pass():
            _record_login_attempt(ip, True)
            token = generate_bearer_token(0, username, 'admin')
            refresh = _generate_refresh_token(0, username, 'admin')
            return jsonify({
                'token': token,
                'refresh_token': refresh,
                'user': {'username': username, 'role': 'admin', 'id': 0}
            })
        _record_login_attempt(ip, False)
        return jsonify({'error': 'Invalid credentials'}), 401
    
    _record_login_attempt(ip, True)
    token = generate_bearer_token(user['id'], user['username'], user['role'])
    refresh = _generate_refresh_token(user['id'], user['username'], user['role'])
    return jsonify({
        'token': token,
        'refresh_token': refresh,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'label': user.get('label', '')
        }
    })


@auth_bp.route('/api/auth/refresh', methods=['POST'])
def refresh_token():
    """Exchange a refresh token for a new Bearer token."""
    data = request.get_json(silent=True) or {}
    refresh = data.get('refresh_token', '')
    if not refresh:
        return jsonify({'error': 'Refresh token required'}), 400
    
    with _refresh_lock:
        stored = REFRESH_TOKENS.pop(refresh, None)
    if not stored:
        return jsonify({'error': 'Invalid or expired refresh token'}), 401
    if time.time() > stored['expires_at']:
        return jsonify({'error': 'Refresh token expired'}), 401
    
    new_token = generate_bearer_token(stored['user_id'], stored['username'], stored['role'])
    new_refresh = _generate_refresh_token(stored['user_id'], stored['username'], stored['role'])
    return jsonify({
        'token': new_token,
        'refresh_token': new_refresh
    })


@auth_bp.route('/api/verify-key', methods=['POST'])
def verify_key():
    """Verify a Smart API Key and return decoded info."""
    data = request.get_json(silent=True) or {}
    encoded_key = data.get('key', '')
    
    if not encoded_key:
        return jsonify({'error': 'API Key required'}), 400
    
    parsed = parse_smart_api_key(encoded_key)
    if not parsed:
        return jsonify({'error': 'Invalid API Key format'}), 400
    
    key_data = validate_api_key(parsed['key_id'], parsed['secret'])
    if not key_data:
        return jsonify({'error': 'API Key invalid or expired'}), 401
    
    return jsonify({
        'success': True,
        'valid': True,
        'host': parsed['host'],
        'port': parsed['port'],
        'label': parsed['label'],
        'role': parsed['role'],
        'expired': parsed.get('expired', '')
    })


@auth_bp.route('/api/health', methods=['GET'])
def health():
    """Public health check endpoint for monitoring (Uptime Kuma, systemd, etc.)."""
    uptime = int(time.time() - _start_time)
    
    # Check database connectivity
    db_ok = False
    try:
        from database import get_connection
        conn = get_connection()
        conn.execute('SELECT 1').fetchone()
        db_ok = True
    except Exception:
        pass
    
    # Determine overall status
    status = 'ok' if db_ok else 'degraded'
    http_code = 200 if db_ok else 503
    
    return jsonify({
        'status': status,
        'version': config.get_version(),
        'uptime': uptime,
        'database': 'connected' if db_ok else 'disconnected',
        'service': 'zdt-api'
    }), http_code


@auth_bp.route('/api/profile', methods=['GET'])
@requires_auth
def get_profile():
    """Get the current user profile."""
    user = get_current_user()
    if not user:
        # Emergency fallback if no database record exists
        return jsonify({
            'success': True,
            'user': {
                'id': 0,
                'username': getattr(g, 'user', {}).get('username', 'admin'),
                'role': getattr(g, 'user', {}).get('role', 'admin'),
                'label': 'Administrator'
            }
        })
    
    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'label': user.get('label', '')
        }
    })


@auth_bp.route('/api/profile', methods=['PUT'])
@requires_auth
def update_profile():
    """Update current user's display label."""
    try:
        data = request.get_json(silent=True) or {}
        label = data.get('label')
        
        if label is None or not isinstance(label, str) or label.strip() == '':
            return jsonify({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'Display label is required'
            }), 400
            
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'USER_NOT_FOUND',
                'message': 'Current user not found'
            }), 404
            
        conn = get_connection()
        conn.execute('UPDATE users SET label = ? WHERE id = ?', (label.strip(), user['id']))
        conn.commit()
        
        # Fetch updated user record
        updated_user = conn.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()
        
        return jsonify({
            'success': True,
            'user': {
                'id': updated_user['id'],
                'username': updated_user['username'],
                'role': updated_user['role'],
                'label': updated_user['label']
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500


@auth_bp.route('/api/profile/password', methods=['POST'])
@requires_auth
def update_password():
    """Update current user's password with old password verification."""
    try:
        data = request.get_json(silent=True) or {}
        old_password = data.get('old_password')
        new_password = data.get('new_password')
        
        if not old_password or not new_password:
            return jsonify({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'Both old and new passwords are required'
            }), 400
            
        if len(new_password) < 4:
            return jsonify({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'Password must be at least 4 characters'
            }), 400
            
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'USER_NOT_FOUND',
                'message': 'Current user not found'
            }), 404
            
        # Verify old password
        from database import verify_user
        verified = verify_user(user['username'], old_password)
        if not verified:
            return jsonify({
                'success': False,
                'error': 'INVALID_CREDENTIALS',
                'message': 'Incorrect old password'
            }), 400
            
        # Update password hash in SQLite
        from werkzeug.security import generate_password_hash
        new_hash = generate_password_hash(new_password)
        
        conn = get_connection()
        conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', (new_hash, user['id']))
        conn.commit()
        
        # Sync with config.env if it's the default web user
        if user['username'] == config.get_web_user():
            config.update_config('ZDT_WEB_PASS', new_password)
            # Reload config so Basic Auth fallback picks up the new password immediately
            config._load_config()
            
        return jsonify({
            'success': True,
            'message': 'Password updated successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'INTERNAL_ERROR',
            'message': str(e)
        }), 500
