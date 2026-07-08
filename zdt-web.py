#!/usr/bin/env python3
"""
ZDT Web Dashboard — Legacy Wrapper
===================================
All endpoints have been merged into server.py (port 2000).
This file is kept for backward compatibility so that existing
systemd services and scripts pointing to port 5000 still work.

Usage:
    python3 zdt-web.py              # runs on 0.0.0.0:5000
    python3 zdt-web.py --port 5000  # explicit port
    python3 zdt-web.py --bind 127.0.0.1 --port 5000
"""
import os
import sys
import argparse

# Import the unified app from server.py
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

from server import create_app

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='ZDT Web Dashboard (legacy wrapper)')
    parser.add_argument('--bind', default='0.0.0.0', help='Bind address (default: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=5000, help='Port number (default: 5000)')
    args = parser.parse_args()

    app = create_app()
    print(f"ZDT Unified API Server (legacy wrapper) running on {args.bind}:{args.port}")
    print(f"  → Admin Dashboard: http://localhost:{args.port}/admin/")
    print(f"  → API Health:      http://localhost:{args.port}/api/health")
    app.run(host=args.bind, port=args.port, debug=False)
