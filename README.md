# ZDT API Server

Standalone API server untuk ZDT Mobile app. Flask + SQLite backend dengan download queue, VPN management, file management, dan admin dashboard.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run server (development)
python server.py

# Production with gunicorn (single worker for SQLite safety)
gunicorn --bind 0.0.0.0:2000 --workers 1 --timeout 120 server:app
```

## Docker

```bash
docker build -t zdt-api .
docker run -d -p 2000:2000 --name zdt-api zdt-api
```

## Configuration

Config file: `config.env` di project root.

| Variable | Default | Description |
|----------|---------|-------------|
| `ZDT_API_PORT` | 2000 | Server port |
| `ZDT_API_HOST` | 0.0.0.0 | Bind address |
| `ZDT_API_DEBUG` | false | Debug mode |
| `TARGET_DIR` | ~/Music/ZDT_Downloads | Media storage path |
| `JWT_SECRET` | Auto-generated | JWT signing secret (persisted) |
| `VPN_SERVER` | remote4.vpnmurahjogja.my.id | VPN server hostname |
| `VPN_USERNAME` | gemini | VPN username |
| `VPN_PASSWORD` | (empty) | VPN password |
| `VPN_AUTOSTART` | false | Auto-start VPN on boot |

## API Endpoints

### Public
- `GET /api/health` — Health check

### Auth
- `POST /api/login` — Admin login (returns JWT Bearer token)
- `POST /api/verify-key` — Verify Smart API Key (mobile auth)

### Profile
- `GET /api/profile` — Get current user profile
- `PUT /api/profile` — Update display name
- `POST /api/profile/password` — Change password (requires current password)

### Settings
- `GET /api/settings` — All settings grouped by category (storage, download, telegram, notifications, server, vpn)
- `POST /api/settings` — Update multiple settings at once
- `GET /api/settings/download` — Download preferences
- `POST /api/settings/download` — Update download preferences
- `GET /api/settings/telegram` — Telegram config (sensitive fields masked)
- `POST /api/settings/telegram` — Update Telegram config
- `POST /api/settings/telegram/test` — Send test Telegram message
- `GET /api/server/info` — Server info with tool versions (yt-dlp, ffmpeg, spotdl)

### File Management
- `GET /api/files` — List files (paginated, sortable, filterable by dir)
- `GET /api/files/search?q=term` — Search files by name (paginated)
- `GET /api/files/info/<path>` — File metadata with duration (via ffprobe)
- `DELETE /api/files/<path>` — Delete file or directory
- `POST /api/files/mkdir` — Create subdirectory
- `POST /api/files/rename` — Rename file
- `GET /api/stream/<path>` — Stream media file
- `GET /api/dl/<path>` — Download file (binary attachment)
- `POST /api/upload` — Upload file

### Download Queue
- `POST /api/download` — Queue new download (returns download ID)
- `GET /api/downloads` — List download history (paginated, filter by status)
- `GET /api/downloads/<id>` — Single download detail with progress
- `DELETE /api/downloads/<id>` — Cancel/delete download entry
- `POST /api/downloads/retry/<id>` — Retry failed download
- `DELETE /api/downloads/history` — Clear completed/failed history

### VPN
- `GET /api/vpn/status` — VPN connection status (mobile-accessible, no admin required)

### Admin (Bearer Token Required)
- `GET /api/admin/dashboard` — System overview stats
- `GET /api/admin/keys` — List API keys
- `POST /api/admin/keys` — Generate Smart API Key
- `DELETE /api/admin/keys/<id>` — Revoke key
- `GET /api/admin/users` — List users
- `POST /api/admin/users` — Create user
- `DELETE /api/admin/users/<id>` — Delete user
- `GET /api/admin/config` — View config (sensitive fields masked)
- `POST /api/admin/config` — Update config value
- `GET /api/admin/activity` — Activity logs
- `POST /api/admin/system/restart` — Restart zdt-api service
- `GET /api/admin/system/status` — Service status
- `POST /api/admin/system/shutdown` — Server shutdown

### Admin VPN
- `GET /api/admin/vpn/status` — Detailed VPN status (uptime, IP, service state)
- `POST /api/admin/vpn/connect` — Connect VPN (polls ppp0 up to 10s for confirmation)
- `POST /api/admin/vpn/disconnect` — Disconnect VPN (polls ppp0 up to 10s for confirmation)
- `GET /api/admin/vpn/config` — VPN config (password masked)
- `POST /api/admin/vpn/config` — Update VPN config (server, username, password, enabled)
- `GET /api/admin/vpn/log` — VPN connection/disconnection event log
- `POST /api/admin/vpn/auto-reconnect` — Enable/disable auto-reconnect with interval

### Admin Services
- `GET /api/admin/services` — List ZDT services status
- `POST /api/admin/services/<name>/<action>` — Start/stop/restart/enable/disable service

### Daemon & Tools
- `POST /api/daemon` — Daemon control (watch/scheduler)
- `POST /api/tools` — Execute tools (clean, compress, playlist, sync_lyrics)
- `GET /api/logs` — Recent application logs
- `GET /api/logs/stream` — Live log stream (SSE)
- `POST /api/logs/clear` — Clear logs
- `GET /api/csrf-token` — CSRF token

### Auth Methods

**Mobile App**: X-API-Key header with Smart API Key
```
GET /api/files
X-API-Key: <base64-encoded-smart-key>
```

**Admin Dashboard**: Bearer token from `/api/login`
```
Authorization: Bearer <jwt-token>
```

### Smart API Key

Format: `Base64(v=1|host|port|key_id|secret|label|role|expired)`

Generate via `POST /api/admin/keys` or admin dashboard.

## Response Format

Success: `{"success": true, ...data}`
Error: `{"error": "ERROR_CODE", "message": "Human readable detail"}`

## Security

- Passwords hashed with werkzeug (bcrypt/scrypt), transparent SHA-256 migration
- JWT secret persisted in config.env across restarts
- CSRF protection for cookie-based sessions (bypassed for API auth headers)
- Path traversal protection on all file endpoints
- Filenames sanitized via `werkzeug.utils.secure_filename`
- Subprocess commands validated against shell metacharacters
- VPN credentials always masked in API responses
- Rate limiting (in-memory, per-worker)
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
- Request ID tracking (X-Request-ID header)
- Graceful shutdown on SIGTERM/SIGINT
- Log rotation (10MB, 5 backups)

## Testing

```bash
# Run all tests
pytest tests/ -v

# Specific test file
pytest tests/test_auth.py -v

# Production verification
python tests/verify_production.py
```
