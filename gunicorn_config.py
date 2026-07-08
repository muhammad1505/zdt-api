"""
Gunicorn configuration for ZDT API Server.

Multi-worker setup:
- 3 workers for handling concurrent requests
- SQLite WAL mode allows concurrent reads; writes are serialized via SQLite locking
- Redis rate limiter for shared state across workers (optional, falls back to per-worker in-memory)
- Preload app for faster worker startup and memory sharing
"""
import os
import multiprocessing

# Bind address
bind = f"{os.environ.get('ZDT_API_HOST', '0.0.0.0')}:{os.environ.get('ZDT_API_PORT', '2000')}"

# Workers
workers = int(os.environ.get('ZDT_GUNICORN_WORKERS', '3'))
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

# Restart workers after processing this many requests to avoid memory leaks

# Server hooks
def on_starting(server):
    """Log startup information."""
    server.log.info(f"ZDT API Server starting with {workers} workers on {bind}")

def post_fork(server, worker):
    """Ensure each worker has its own DB connection."""
    from database import close_connection
    close_connection()
    server.log.debug(f"Worker {worker.pid} initialized")

def worker_int(worker):
    """Clean up worker resources on shutdown."""
    from database import close_connection
    close_connection()
