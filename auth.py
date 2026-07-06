import hashlib
import secrets
import time
from functools import wraps
from flask import request, jsonify, g
import jwt

from config import config

# JWT Secret (retrieve from config, or generate and persist if missing)
JWT_SECRET = config.get('JWT_SECRET')
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)
    config.update_config('JWT_SECRET', JWT_SECRET)

JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_HOURS = 24


def generate_bearer_token(user_id, username, role):
    """Generate JWT Bearer token for admin dashboard."""
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'exp': time.time() + JWT_EXPIRY_HOURS * 3600,
        'iat': time.time()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_bearer_token(token):
    """Verify JWT Bearer token. Returns payload or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def requires_auth(f):
    """Decorator: require X-API-Key (mobile) OR Bearer token (admin)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Check X-API-Key first (mobile app)
        api_key_header = request.headers.get('X-API-Key', '')
        if api_key_header:
            from database import parse_smart_api_key, validate_api_key
            
            # Try Smart API Key first (Base64 encoded)
            parsed = parse_smart_api_key(api_key_header)
            if parsed:
                key_data = validate_api_key(parsed['key_id'], parsed['secret'])
                if key_data:
                    g.auth_type = 'mobile'
                    g.api_key = key_data
                    return f(*args, **kwargs)
            
            # Try direct key_id|secret format (legacy)
            if '|' in api_key_header:
                parts = api_key_header.split('|')
                if len(parts) == 2:
                    key_data = validate_api_key(parts[0], parts[1])
                    if key_data:
                        g.auth_type = 'mobile'
                        g.api_key = key_data
                        return f(*args, **kwargs)
        
        # Check Bearer token (admin dashboard) — header or query param
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        if not token:
            token = request.args.get('token', '')
        if token:
            payload = verify_bearer_token(token)
            if payload:
                g.auth_type = 'admin'
                g.user = payload
                return f(*args, **kwargs)
        
        # Check Basic Auth (backward compatibility with zdt-web)
        from config import config
        auth = request.authorization
        if auth and auth.username and auth.password:
            web_user = config.get_web_user()
            web_pass = config.get_web_pass()
            if auth.username == web_user and auth.password == web_pass:
                g.auth_type = 'basic'
                g.user = {'username': web_user, 'role': 'admin'}
                return f(*args, **kwargs)
        
        return jsonify({'success': False, 'error': 'Unauthorized', 'message': 'Invalid or missing API key / token'}), 401
    
    return decorated


def optional_auth(f):
    """Decorator: optional auth - doesn't block if no auth."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Try to authenticate, but don't block
        api_key_header = request.headers.get('X-API-Key', '')
        if api_key_header:
            from database import parse_smart_api_key, validate_api_key
            parsed = parse_smart_api_key(api_key_header)
            if parsed:
                key_data = validate_api_key(parsed['key_id'], parsed['secret'])
                if key_data:
                    g.auth_type = 'mobile'
                    g.api_key = key_data
        
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            payload = verify_bearer_token(token)
            if payload:
                g.auth_type = 'admin'
                g.user = payload
        
        return f(*args, **kwargs)
    
    return decorated


def requires_admin(f):
    """Decorator: require admin-level access (Bearer token or Basic Auth)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        if not token:
            token = request.args.get('token', '')
        if token:
            payload = verify_bearer_token(token)
            if payload and payload.get('role') in ('admin',):
                g.auth_type = 'admin'
                g.user = payload
                return f(*args, **kwargs)
        
        # Check Basic Auth
        from config import config
        auth = request.authorization
        if auth and auth.username and auth.password:
            web_user = config.get_web_user()
            web_pass = config.get_web_pass()
            if auth.username == web_user and auth.password == web_pass:
                g.auth_type = 'basic'
                g.user = {'username': web_user, 'role': 'admin'}
                return f(*args, **kwargs)
        
        return jsonify({'success': False, 'error': 'Forbidden', 'message': 'Admin access required'}), 403
    
    return decorated
