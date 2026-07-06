from flask import Blueprint, request, jsonify, g
import time

_start_time = time.time()

from auth import requires_auth, generate_bearer_token
from database import verify_user, parse_smart_api_key, validate_api_key, get_connection
from config import config

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
    """Admin login - returns Bearer token."""
    data = request.get_json(silent=True) or {}
    username = data.get('username', '')
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    user = verify_user(username, password)
    if not user:
        # Fallback to config.env credentials
        if username == config.get_web_user() and password == config.get_web_pass():
            token = generate_bearer_token(0, username, 'admin')
            return jsonify({
                'token': token,
                'user': {'username': username, 'role': 'admin', 'id': 0}
            })
        return jsonify({'error': 'Invalid credentials'}), 401
    
    token = generate_bearer_token(user['id'], user['username'], user['role'])
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'label': user.get('label', '')
        }
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
    """Public health check endpoint."""
    uptime = int(time.time() - _start_time)
    return jsonify({
        'status': 'ok',
        'version': config.get_version(),
        'uptime': uptime
    })


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
