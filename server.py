#!/usr/bin/env python3
"""ZDT API Server - Standalone API server for ZDT Mobile app."""

import os
import sys
import threading
import time
import logging
import uuid
import signal

from flask import Flask, request, jsonify, g
from flask_cors import CORS

# Import config at module level
from config import config as app_config

# Set up logging with rotation
from logging.handlers import RotatingFileHandler
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'zdt-api.log')
file_handler = RotatingFileHandler(log_file, maxBytes=10*1024*1024, backupCount=5)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[file_handler, logging.StreamHandler()]
)
logger = logging.getLogger('zdt-api')

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)

    # Restrict CORS to known origins for security
    allowed_origins = [
        'http://localhost:2000',
        'http://localhost:5173',
        'http://127.0.0.1:2000',
        'http://127.0.0.1:5173',
    ]
    # Add any origins from config
    cors_origin = app_config.get('CORS_ORIGIN', '')
    if cors_origin:
        allowed_origins.extend([o.strip() for o in cors_origin.split(',') if o.strip()])
    CORS(app, origins=allowed_origins, supports_credentials=True)

    # Request ID tracking
    @app.before_request
    def assign_request_id():
        g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4())[:8])

    # Security headers
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Request-ID'] = getattr(g, 'request_id', '')
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['Cache-Control'] = 'no-store'
        return response
    
    # Initialize database
    from database import init_db, create_admin_user, close_connection
    
    try:
        init_db()
        # Create default admin user from config.env if not exists
        web_user = app_config.get_web_user()
        web_pass = app_config.get_web_pass()
        if web_user and web_pass:
            create_admin_user(web_user, web_pass)
        logger.info('Database initialized successfully')
    except Exception as e:
        logger.error(f'Failed to initialize database: {e}')
    
    # Register teardown context hook
    app.teardown_appcontext(close_connection)
    
    # Register middleware
    from middleware import check_rate_limit, log_request, cleanup_rate_limits
    app.before_request(check_rate_limit)
    
    @app.before_request
    def validate_csrf():
        """CSRF Double Submit Cookie validation."""
        if request.path in ('/api/login', '/api/verify-key'):
            return None

        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            csrf_cookie = request.cookies.get('csrf_token')
            bypass = False

            if not csrf_cookie:
                has_api_key = bool(request.headers.get('X-API-Key', ''))
                has_bearer = request.headers.get('Authorization', '').startswith('Bearer ')
                has_basic = request.authorization is not None

                if not (has_api_key or has_bearer or has_basic):
                    return None

                from database import parse_smart_api_key, validate_api_key
                from auth import verify_bearer_token

                if has_api_key:
                    parsed = parse_smart_api_key(request.headers.get('X-API-Key', ''))
                    if parsed:
                        bypass = bool(validate_api_key(parsed['key_id'], parsed['secret']))
                    if not bypass and '|' in request.headers.get('X-API-Key', ''):
                        parts = request.headers.get('X-API-Key', '').split('|')
                        if len(parts) == 2:
                            bypass = bool(validate_api_key(parts[0], parts[1]))

                if not bypass and has_bearer:
                    token = request.headers.get('Authorization', '')[7:]
                    bypass = bool(verify_bearer_token(token))

                if not bypass:
                    return None

            if not bypass:
                csrf_header = request.headers.get('X-CSRF-Token')
                if not csrf_cookie or not csrf_header or csrf_header != csrf_cookie:
                    return jsonify({
                        'success': False,
                        'error': 'CSRF validation failed',
                        'message': 'Missing or mismatched CSRF token'
                    }), 403
        return None




    app.after_request(log_request)
    
    # Start rate limit cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_rate_limits, daemon=True)
    cleanup_thread.start()
    
    # Register blueprints
    from routes.auth_routes import auth_bp
    from routes.dashboard_routes import dashboard_bp
    from routes.files_routes import files_bp
    from routes.daemon_routes import daemon_bp
    from routes.logs_routes import logs_bp
    from routes.settings_routes import settings_bp
    from routes.admin_routes import admin_bp
    from routes.download_routes import downloads_bp
    from routes.vpn_routes import vpn_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(daemon_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(downloads_bp)
    app.register_blueprint(vpn_bp)
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        from flask import jsonify, request, redirect
        accept = request.headers.get('Accept', '')
        if 'text/html' in accept and not request.path.startswith('/api/'):
            return redirect('/admin/')
        return jsonify({'error': 'Not found', 'message': 'Endpoint tidak ditemukan'}), 404
    
    @app.errorhandler(Exception)
    def handle_exception(e):
        from flask import jsonify
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return jsonify({'error': e.name, 'message': e.description}), e.code
        logger.exception('Unhandled exception')
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
    
    # Serve admin dashboard static files
    
    admin_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'admin-dashboard', 'dist')
    if os.path.exists(admin_dist):
        from flask import send_from_directory

        @app.route('/favicon.ico')
        @app.route('/favicon.svg')
        def favicon():
            return send_from_directory(admin_dist, 'favicon.svg')

        @app.route('/')
        def redirect_to_admin():
            from flask import redirect
            return redirect('/admin/')

        @app.route('/admin/')
        @app.route('/admin/<path:path>')
        def serve_admin(path='index.html'):
            if path and os.path.exists(os.path.join(admin_dist, path)):
                return send_from_directory(admin_dist, path)
            return send_from_directory(admin_dist, 'index.html')
        
        logger.info(f'Admin dashboard served at /admin/ from {admin_dist}')
    
    # Graceful shutdown handler
    shutdown_event = threading.Event()

    @app.before_request
    def check_shutdown():
        if shutdown_event.is_set():
            return jsonify({'error': 'Server shutting down', 'message': 'Server is shutting down'}), 503

    def handle_shutdown(signum, frame):
        logger.info(f'Received signal {signum}, shutting down gracefully...')
        shutdown_event.set()
        # Give ongoing requests time to finish
        time.sleep(2)
        os._exit(0)

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    logger.info('ZDT API Server started')
    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('ZDT_API_PORT', 2000))
    host = os.environ.get('ZDT_API_HOST', '0.0.0.0')
    debug = os.environ.get('ZDT_API_DEBUG', '').lower() == 'true'
    
    # Bikin output startup bersih
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    try:
        import flask.cli
        original_banner = flask.cli.show_server_banner
        flask.cli.show_server_banner = lambda *a, **kw: None
    except Exception:
        pass
    
    import sys
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    already_running = sock.connect_ex(('127.0.0.1', port)) == 0
    sock.close()
    
    if already_running:
        print(f'''
╔══════════════════════════════════════════════╗
║  ⚠️  Port {port} already in use!              ║
║                                              ║
║  Another ZDT API server is already running.  ║
║  Stop it first with:                         ║
║    sudo systemctl stop zdt-api               ║
║  Or if running manually:                     ║
║    pkill -f "python.*server.py"              ║
╚══════════════════════════════════════════════╝
        ''', flush=True)
        sys.exit(1)
    
    # Detect all IPs (including VPN)
    detected_ips = []
    try:
        import subprocess
        ip_result = subprocess.run(['ip', '-4', 'addr', 'show'], capture_output=True, text=True, timeout=3)
        for line in ip_result.stdout.split('\n'):
            if 'inet ' in line:
                parts = line.strip().split()
                ip = parts[1].split('/')[0]
                if ip != '127.0.0.1':
                    detected_ips.append(ip)
    except Exception:
        detected_ips = []
    
    W = 46
    def fmt(text):
        """Pad/truncate text to fit within box width (max W chars)."""
        if len(text) > W:
            text = text[:W-3] + '...'
        return f'║{text:<{W}}║'

    ip_lines = []
    if detected_ips:
        for ip in detected_ips:
            ip_lines.append(fmt(f'  🌐  http://{ip}:{port}'))
    else:
        ip_lines.append(fmt(f'  🌐  http://{host}:{port}'))
    
    target = app_config.get_target_dir()
    
    print(f'''
╔{"═" * W}╗
{fmt(f"      ZDT API Server v{app_config.get_version()}")}
{fmt('')}
{chr(10).join(ip_lines)}
{fmt('')}
{fmt(f'  📂  {target}')}
{fmt('  🔐  X-API-Key / Bearer Token')}
{fmt('')}
{fmt(f'  🏠  http://localhost:{port}/api/health')}
╚{"═" * W}╝
    ''', flush=True)
    
    app.run(host=host, port=port, debug=debug)
