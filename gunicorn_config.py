"""
Gunicorn configuration for ZDT API Server.

Multi-worker setup:
- 4 workers for handling concurrent requests
- SQLite WAL mode allows concurrent reads; writes are serialized via SQLite locking
- Redis rate limiter for shared state across workers (optional, falls back to per-worker in-memory)
  - With Redis: rate limit terpusat (240 req/min per IP across ALL workers)
  - Without Redis: per-worker rate limit (effective limit = 240 * workers)
- Preload app for faster worker startup and memory sharing
- `post_fork` hook ensures each worker gets its own SQLite connection
"""
import os
import multiprocessing

# Bind address
bind = f"{os.environ.get('ZDT_API_HOST', '0.0.0.0')}:{os.environ.get('ZDT_API_PORT', '2000')}"

# Workers — 4 workers optimal for most VPS (2-4 cores)
workers = int(os.environ.get('ZDT_GUNICORN_WORKERS', '4'))
worker_class = 'sync'
threads = int(os.environ.get('ZDT_GUNICORN_THREADS', '1'))

# Timeouts
timeout = 120
keepalive = 5
graceful_timeout = 30

# Preload app for memory sharing between workers
preload_app = True

# Logging
accesslog = '-'
errorlog = '-'
loglevel = os.environ.get('ZDT_LOG_LEVEL', 'info').lower()

# Worker settings
max_requests = 10000
max_requests_jitter = 1000

# Server hooks
def on_starting(server):
    """Log startup information."""
    server.log.info(f"ZDT API Server starting with {workers} workers on {bind}")
    # Check Redis config from config.env (loaded by Flask at runtime)
    try:
        config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.env')
        if os.path.exists(config_path):
            with open(config_path) as f:
                for line in f:
                    if line.startswith('REDIS_URL='):
                        val = line.strip().split('=', 1)[1].strip().strip('"').strip("'")
                        if val:
                            server.log.info(f"Redis rate limiter: enabled ({val})")
                        else:
                            server.log.info("Redis rate limiter: disabled (REDIS_URL empty in config.env)")
                        break
        else:
            server.log.info("Redis rate limiter: disabled (config.env not found)")
    except Exception:
        server.log.info("Redis rate limiter: disabled (in-memory fallback)")

def post_fork(server, worker):
    """Ensure each worker has its own DB connection after fork."""
    from database import close_connection
    close_connection()
    server.log.debug(f"Worker {worker.pid} initialized")

def worker_int(worker):
    """Clean up worker resources on shutdown."""
    from database import close_connection
    close_connection()
