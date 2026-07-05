import time
import threading
from collections import defaultdict
from flask import request, jsonify, g

# Rate limiting
RATE_LIMIT_STORE = defaultdict(list)
RATE_LIMIT_MAX = 240  # requests per minute
RATE_LIMIT_WINDOW = 60  # seconds
_rate_limit_lock = threading.Lock()

# SSE connection limiter
SSE_MAX_CONNECTIONS = 50
_active_sse_connections = 0
_sse_lock = threading.Lock()


def check_rate_limit():
    """Rate limiting middleware. Apply as before_request."""
    # Skip rate limiting for SSE endpoint
    if request.path == '/api/logs/stream':
        return None
    
    ip = request.remote_addr or 'unknown'
    now = time.time()
    
    with _rate_limit_lock:
        # Clean old entries
        RATE_LIMIT_STORE[ip] = [t for t in RATE_LIMIT_STORE[ip] if now - t < RATE_LIMIT_WINDOW]
        
        if len(RATE_LIMIT_STORE[ip]) >= RATE_LIMIT_MAX:
            return jsonify({'error': 'Rate limit exceeded', 'message': 'Too many requests. Try again later.'}), 429
        
        RATE_LIMIT_STORE[ip].append(now)
    
    return None


def cleanup_rate_limits():
    """Periodic cleanup of old rate limit entries."""
    while True:
        time.sleep(300)  # Every 5 minutes
        now = time.time()
        with _rate_limit_lock:
            for ip in list(RATE_LIMIT_STORE.keys()):
                RATE_LIMIT_STORE[ip] = [t for t in RATE_LIMIT_STORE[ip] if now - t < RATE_LIMIT_WINDOW]
                if not RATE_LIMIT_STORE[ip]:
                    del RATE_LIMIT_STORE[ip]


def log_request(response):
    """Log API request to database. Use as after_request."""
    try:
        from database import log_activity
        api_key_id = None
        user_id = None
        if hasattr(g, 'api_key'):
            api_key_id = g.api_key.get('key_id')
        if hasattr(g, 'user'):
            user_id = g.user.get('user_id')
        
        log_activity(
            api_key_id=api_key_id,
            user_id=user_id,
            endpoint=request.path,
            method=request.method,
            ip_address=request.remote_addr,
            status_code=response.status_code
        )
    except Exception:
        pass
    return response


def sse_connect():
    """Track SSE connection. Returns True if allowed."""
    global _active_sse_connections
    with _sse_lock:
        if _active_sse_connections >= SSE_MAX_CONNECTIONS:
            return False
        _active_sse_connections += 1
        return True


def sse_disconnect():
    """Track SSE disconnection."""
    global _active_sse_connections
    with _sse_lock:
        _active_sse_connections = max(0, _active_sse_connections - 1)
