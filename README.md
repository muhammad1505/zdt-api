# ZDT API Server

Standalone API server untuk ZDT Mobile app.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python server.py

# Or with gunicorn
gunicorn --bind 0.0.0.0:2000 --workers 2 --timeout 120 server:app
```

## Docker

```bash
docker build -t zdt-api .
docker run -d -p 2000:2000 --name zdt-api zdt-api
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZDT_API_PORT` | 2000 | Server port |
| `ZDT_API_HOST` | 0.0.0.0 | Bind address |
| `ZDT_API_DEBUG` | false | Debug mode |

## API Endpoints

### Public
- `GET /api/health` - Health check

### Auth
- `POST /api/login` - Admin login
- `POST /api/verify-key` - Verify Smart API Key

### Mobile (X-API-Key)
- `GET /api/stats` - Dashboard stats
- `GET /api/status` - Server status
- `GET /api/files` - File explorer
- `GET /api/stream/<path>` - Audio stream
- `GET /api/dl/<path>` - Download file
- `POST /api/upload` - Upload file
- `POST /api/daemon` - Daemon control
- `POST /api/tools` - Execute tools
- `GET /api/logs` - Recent logs
- `GET /api/logs/stream` - Live log stream (SSE)
- `POST /api/logs/clear` - Clear logs
- `GET /api/csrf-token` - CSRF token
- `POST /api/download` - Queue download
- `POST /api/settings/storage` - Update storage path

### Admin (Bearer Token)
- `GET /api/admin/dashboard` - System overview
- `GET /api/admin/keys` - List API keys
- `POST /api/admin/keys` - Generate Smart API Key
- `DELETE /api/admin/keys/<id>` - Revoke key
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `DELETE /api/admin/users/<id>` - Delete user
- `GET /api/admin/config` - View config
- `POST /api/admin/config` - Update config
- `GET /api/admin/activity` - Activity logs
- `POST /api/admin/system/restart` - Restart service
- `GET /api/admin/system/status` - Service status

## Smart API Key

Generate via admin dashboard, format:
```
Base64(v=1|host|port|key_id|secret|label|role|expired)
```
