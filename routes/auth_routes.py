from flask import Blueprint, request, jsonify
import time

from auth import requires_auth, generate_bearer_token
from database import verify_user, parse_smart_api_key, validate_api_key
from config import config

auth_bp = Blueprint('auth', __name__)


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


_start_time = time.time()
