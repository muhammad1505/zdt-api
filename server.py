#!/usr/bin/env python3
"""ZDT API Server - Standalone server for ZDT Mobile app."""

import os
import sys
import threading
import time
import logging

from flask import Flask
from flask_cors import CORS

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
    from config import config
    
    try:
        init_db()
        # Create default admin user from config.env if not exists
        web_user = config.get_web_user()
        web_pass = config.get_web_pass()
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
    
    logger.info('ZDT API Server started')
    return app


app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('ZDT_API_PORT', 2000))
    host = os.environ.get('ZDT_API_HOST', '0.0.0.0')
    debug = os.environ.get('ZDT_API_DEBUG', '').lower() == 'true'
    
    print(f'''
╔══════════════════════════════════════════════╗
║        ZDT API Server v{config.get_version():<8}           ║
║                                              ║
║  🌐 Listening on http://{host}:{port}              ║
║  📂 Target: {config.get_target_dir():<20}  ║
║  🔐 Auth: X-API-Key / Bearer Token           ║
║                                              ║
║  🏠 Health: http://localhost:{port}/api/health    ║
╚══════════════════════════════════════════════╝
    ''')
    
    from config import config
    app.run(host=host, port=port, debug=debug)
else:
    from config import config
