#!/usr/bin/env python3
"""ZDT API Server - Standalone API server for ZDT Mobile app."""

import os
import sys
import threading
import time
import logging

from flask import Flask
from flask_cors import CORS

# Import config at module level
from config import config as app_config

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('zdt-api')

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)
    CORS(app)
    
    # Initialize database
    from database import init_db, create_admin_user
    
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
    
    # Register middleware
    from middleware import check_rate_limit, log_request, cleanup_rate_limits
    app.before_request(check_rate_limit)
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
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(daemon_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(admin_bp)
    
    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        from flask import jsonify
        return jsonify({'error': 'Not found', 'message': 'Endpoint tidak ditemukan'}), 404
    
    @app.errorhandler(Exception)
    def handle_exception(e):
        from flask import jsonify
        logger.exception('Unhandled exception')
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
    
    # Serve admin dashboard static files
    
    admin_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'admin-dashboard', 'dist')
    if os.path.exists(admin_dist):
        from flask import send_from_directory
        
        @app.route('/admin/')
        @app.route('/admin/<path:path>')
        def serve_admin(path='index.html'):
            if path and os.path.exists(os.path.join(admin_dist, path)):
                return send_from_directory(admin_dist, path)
            return send_from_directory(admin_dist, 'index.html')
        
        logger.info(f'Admin dashboard served at /admin/ from {admin_dist}')
    
    logger.info('ZDT API Server started')
    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('ZDT_API_PORT', 2000))
    host = os.environ.get('ZDT_API_HOST', '0.0.0.0')
    debug = os.environ.get('ZDT_API_DEBUG', '').lower() == 'true'
    
    print(f'''
╔══════════════════════════════════════════════╗
║        ZDT API Server v{app_config.get_version():<8}           ║
║                                              ║
║  🌐 Listening on http://{host}:{port}              ║
║  📂 Target: {app_config.get_target_dir():<20}  ║
║  🔐 Auth: X-API-Key / Bearer Token           ║
║                                              ║
║  🏠 Health: http://localhost:{port}/api/health    ║
╚══════════════════════════════════════════════╝
    ''')
    
    app.run(host=host, port=port, debug=debug)
