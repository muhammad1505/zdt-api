import time
import threading
from collections import defaultdict
from flask import request, jsonify, g

# Rate limiting
RATE_LIMIT_MAX = 240  # requests per minute
RATE_LIMIT_WINDOW = 60  # seconds
_rate_limit_lock = threading.Lock()

# In-memory fallback store
_IN_MEMORY_STORE = defaultdict(list)

# Redis client (lazy init)
_redis_client = None
_redis_available = False


def _get_redis():
    """Lazy-initialize Redis client from config."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client if _redis_available else None

    try:
        from config import config
        redis_url = config.get('REDIS_URL', '')
        if redis_url:
            import redis as _r
            _redis_client = _r.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
            _redis_client.ping()
            _redis_available = True
            return _redis_client
    except Exception:
        pass
    _redis_client = None
    _redis_available = False
    return None


class RateLimiter:
    """Rate limiter with optional Redis backend and in-memory fallback.

    In multi-worker Gunicorn setups, each worker has its own in-memory
    store, so the effective limit becomes RATE_LIMIT_MAX * workers.
    Redis solves this by providing a shared counter across all workers.

    Usage:
        limiter = RateLimiter()
        if not limiter.check(request.remote_addr):
            return 429
    """

    def __init__(self, max_requests=RATE_LIMIT_MAX, window=RATE_LIMIT_WINDOW):
        self.max_requests = max_requests
        self.window = window

    def _check_redis(self, key: str) -> bool:
        """Check rate limit via Redis sorted set."""
        redis = _get_redis()
        if not redis:
            return None  # signal fallback
        now = time.time()
        window_start = now - self.window
        import secrets
        pipe = redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.zadd(key, {f'{now}:{secrets.token_hex(4)}': now})
        pipe.expire(key, int(self.window * 2))
        _, count, _, _ = pipe.execute()
        return int(count) < self.max_requests

    def _check_memory(self, key: str) -> bool:
        """Check rate limit via in-memory defaultdict."""
        global _IN_MEMORY_STORE
        now = time.time()
        with _rate_limit_lock:
            entries = _IN_MEMORY_STORE[key]
            # Clean old entries
            _IN_MEMORY_STORE[key] = [t for t in entries if now - t < self.window]
            if len(_IN_MEMORY_STORE[key]) >= self.max_requests:
                return False
            _IN_MEMORY_STORE[key].append(now)
        return True

    def check(self, ip: str) -> bool:
        """Check if request is allowed. Returns True if under limit."""
        result = self._check_redis(ip)
        if result is not None:
            return result
        return self._check_memory(ip)


# Global instance
_rate_limiter = RateLimiter()


def check_rate_limit():
    """Rate limiting middleware. Apply as before_request.

    Supports optional Redis backend for multi-worker Gunicorn setups.
    Falls back to in-memory defaultdict if Redis is unavailable.
    """
    from flask import current_app
    if current_app.config.get('TESTING'):
        return None

    # Skip rate limiting for SSE endpoint
    if request.path == '/api/logs/stream':
        return None

    # Bypass rate limiting for localhost (browser testing, local clients)
    ip = request.remote_addr or 'unknown'
    if ip in ('127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'):
        return None
    if not _rate_limiter.check(ip):
        return jsonify({
            'error': 'Rate limit exceeded',
            'message': 'Too many requests. Try again later.'
        }), 429

    return None


def cleanup_rate_limits():
    """Periodic cleanup of old rate limit entries in memory store."""
    while True:
        time.sleep(300)  # Every 5 minutes
        now = time.time()
        with _rate_limit_lock:
            for ip in list(_IN_MEMORY_STORE.keys()):
                _IN_MEMORY_STORE[ip] = [t for t in _IN_MEMORY_STORE[ip] if now - t < RATE_LIMIT_WINDOW]
                if not _IN_MEMORY_STORE[ip]:
                    del _IN_MEMORY_STORE[ip]


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
    except Exception as e:
        from flask import current_app
        try:
            current_app.logger.warning(f"Failed to log activity: {e}")
        except Exception:
            pass
    return response


# SSE connection limiter
SSE_MAX_CONNECTIONS = 50
_active_sse_connections = 0
_sse_lock = threading.Lock()


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
