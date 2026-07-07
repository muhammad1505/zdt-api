# ZDT API Server

Standalone API server untuk ZDT Mobile app & Telegram Bot. Flask + SQLite backend dengan download queue, VPN management, file management, admin dashboard SPA, dan AI-powered Telegram assistant.

## Features

- **Admin Dashboard SPA** — React + Tailwind SPA untuk manage server, file, download, users, API keys, VPN, settings
- **Telegram Bot** — AI-powered assistant (Gemini/OpenRouter), search & download YouTube, pisah vokal, kompres media, dll.
- **Download Engine** — yt-dlp backend untuk download audio/video dari YouTube, TikTok, Instagram, dll.
- **File Management** — Browse, search, stream, download, upload, rename, delete file langsung dari browser
- **VPN Manager** — Connect/disconnect VPN, auto-reconnect, connection log
- **API Key Auth** — Smart API Key untuk mobile app, JWT untuk admin dashboard
- **Systemd Services** — zdt-api, zdt-telegram, zdt-watch, zdt-scheduler sebagai systemd service
- **Watch Daemon** — Auto-process file baru (rename, kompres, extract vocal)

## Quick Install

```bash
# Di server Ubuntu/Debian/Fedora/Arch/Alpine fresh:
sudo bash -c "$(curl -sL https://raw.githubusercontent.com/muhammad1505/zdt-api/main/install.sh)"
```

Installer akan:
1. Auto-detect OS & install dependencies (ffmpeg, python3, nodejs)
2. Setup Python virtual environment & install requirements
3. Build admin dashboard frontend
4. Generate config.env dengan JWT secret & random password
5. Init database SQLite
6. Install & start systemd services
7. Prompt Gemini/OpenRouter API key (opsional)

## Manual Install

```bash
# 1. Clone
git clone https://github.com/muhammad1505/zdt-api.git
cd zdt-api

# 2. System dependencies
sudo apt install -y python3 python3-venv python3-pip ffmpeg nodejs npm
# atau: sudo dnf install -y python3 python3-virtualenv python3-pip ffmpeg-free nodejs npm

# 3. Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pyTelegramBotAPI watchdog

# 4. Build frontend
cd admin-dashboard
npm ci && npm run build
cd ..

# 5. Configuration
cp config.env.example config.env  # atau buat manual
# Edit config.env — setidaknya JWT_SECRET dan TELEGRAM_BOT_TOKEN

# 6. Database
python3 -c "from database import init_db; init_db()"

# 7. Run
gunicorn --bind 0.0.0.0:2000 --workers 1 --timeout 120 server:app
```

## Systemd Services

```bash
# Install semua service
sudo ./install.sh

# Atau manual:
sudo cp systemd/*.service /etc/systemd/system/
sudo cp systemd/*.timer /etc/systemd/system/ 2>/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now zdt-api.service
sudo systemctl enable --now zdt-telegram.service
sudo systemctl enable --now zdt-watch.service
sudo systemctl enable --now zdt-scheduler.timer
```

| Service | Description | Port |
|---------|-------------|------|
| `zdt-api.service` | API server (gunicorn) | 2000 |
| `zdt-telegram.service` | Telegram bot (polling) | — |
| `zdt-watch.service` | File system watcher | — |
| `zdt-scheduler.service` | Periodic playlist sync | — |
| `zdt-scheduler.timer` | Trigger scheduler every hour | — |

## Configuration

File: `config.env` di project root.

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_DIR` | `~/Music/ZDT_Downloads` | Media storage path |
| `JWT_SECRET` | Auto-generated | JWT signing secret |
| `ZDT_WEB_USER` | `admin` | Dashboard login username |
| `ZDT_WEB_PASS` | Auto-generated | Dashboard login password |
| `TELEGRAM_BOT_TOKEN` | `""` | Telegram bot token (isi untuk aktifkan) |
| `TELEGRAM_CHAT_ID` | `""` | Chat ID untuk notifikasi |
| `TELEGRAM_ENABLED` | `false` | Start Telegram bot on boot |
| `VPN_SERVER` | `remote4.vpnmurahjogja.my.id` | VPN server |
| `VPN_USERNAME` | `gemini` | VPN username |
| `VPN_PASSWORD` | `""` | VPN password |
| `VPN_AUTOSTART` | `false` | Auto-start VPN |
| `WATCH_AUTOSTART` | `true` | Auto-start watch daemon |
| `ZDT_API_PORT` | `2000` | API server port |
| `ZDT_API_HOST` | `0.0.0.0` | Bind address |
| `ZDT_API_DEBUG` | `false` | Flask debug mode |

Telegram token juga bisa disimpan di `~/.config/zdt/telegram_token.txt`.  
API keys AI: `~/.config/zdt/gemini_key` atau `~/.config/zdt/openrouter_key`.

## Development

```bash
# Backend
python server.py  # Flask dev server

# Frontend (hot reload)
cd admin-dashboard
npm run dev       # Vite dev server, proxy API ke :2000

# Tests
pytest tests/ -v
```

## Telegram Bot

Fitur bot:
- **Chat AI** — Ngobrol pake Gemini atau OpenRouter
- **Cari lagu** — `carikan link moonlight` → search YouTube + inline buttons
- **Download** — Kirim link YouTube/Spotify/TikTok langsung di-download
- **Kompres Media** — Kompres file audio/video
- **Hapus Vokal** — Pisah vokal pake AI Demucs
- **Sync Lirik** — Cari & download LRC lyrics
- **Info Sistem** — Cek status server

Format response AI (JSON):
```json
{"reply":"Gue cariin dulu ya! 🔍","intent":"cari lagu","query":"moonlight"}
```

## API Endpoints

### Public
- `GET /api/health` — Health check

### Auth
- `POST /api/login` — Admin login (returns JWT)
- `POST /api/verify-key` — Verify Smart API Key

### Files
- `GET /api/files` — List files (paginated, sortable, filterable)
- `GET /api/files/search?q=term` — Search files
- `GET /api/files/info/<path>` — File metadata (duration via ffprobe)
- `DELETE /api/files/<path>` — Delete file/directory
- `POST /api/files/mkdir` — Create directory
- `POST /api/files/rename` — Rename file
- `GET /api/stream/<path>` — Stream media (video/audio)
- `GET /api/dl/<path>` — Download file
- `POST /api/upload` — Upload file

### Downloads
- `POST /api/download` — Queue download
- `GET /api/downloads` — List download history
- `GET /api/downloads/<id>` — Download detail + progress
- `DELETE /api/downloads/<id>` — Cancel download
- `POST /api/downloads/retry/<id>` — Retry failed

### Admin (Bearer Token)
- `GET /api/admin/dashboard` — System overview stats
- `GET /api/admin/services` — Service status list
- `POST /api/admin/services/<name>/<action>` — Start/stop/restart/enable/disable
- `GET /api/admin/keys` — List API keys
- `POST /api/admin/keys` — Generate Smart API Key
- `DELETE /api/admin/keys/<id>` — Revoke key
- `GET /api/admin/users` — List users
- `POST /api/admin/users` — Create user
- `DELETE /api/admin/users/<id>` — Delete user
- `GET /api/admin/config` — View config (masked secrets)
- `POST /api/admin/config` — Update config
- `GET /api/admin/activity` — Activity logs
- `GET /api/admin/system/status` — Service health
- `POST /api/admin/system/restart` — Restart API service
- `POST /api/admin/system/shutdown` — Shutdown server

### VPN
- `GET /api/vpn/status` — Connection status (mobile-friendly)
- `GET /api/admin/vpn/status` — Detailed status
- `POST /api/admin/vpn/connect` — Connect
- `POST /api/admin/vpn/disconnect` — Disconnect
- `GET /api/admin/vpn/config` — View config
- `POST /api/admin/vpn/config` — Update config
- `GET /api/admin/vpn/log` — Connection log
- `POST /api/admin/vpn/auto-reconnect` — Toggle auto-reconnect

### Daemon & Tools
- `POST /api/daemon` — Watch/scheduler control
- `POST /api/tools` — Run tools (clean, compress, playlist, sync_lyrics, demucs)
- `GET /api/logs` — Recent logs
- `GET /api/logs/stream` — Live log stream (SSE)

### Auth Methods

**Mobile App** — X-API-Key header:
```
GET /api/files
X-API-Key: <base64-encoded-smart-key>
```

**Admin Dashboard** — Bearer token:
```
POST /api/login  →  { "token": "jwt..." }
Authorization: Bearer <jwt-token>
```

## Architecture

```
zdt-api/
├── server.py              # Flask app entrypoint
├── auth.py                # JWT, API Key auth, password hashing
├── config.py              # Config reader (config.env)
├── database.py            # SQLite init + CRUD
├── middleware.py           # CORS, security headers, rate limiting
├── routes/                # Flask blueprints
│   ├── admin_routes.py    # Admin: dashboard, services, users, keys, system
│   ├── auth_routes.py     # Login, verify key
│   ├── daemon_routes.py   # Demucs, compress, sync, tools
│   ├── dashboard_routes.py# Dashboard stats
│   ├── download_routes.py # Download queue
│   ├── files_routes.py    # File browser, stream, upload
│   ├── logs_routes.py     # Log viewer, SSE stream
│   ├── settings_routes.py # All settings CRUD
│   └── vpn_routes.py      # VPN connect/disconnect/status
├── zdt-telegram.py        # Telegram bot daemon
├── zdt-scheduler.py       # Playlist sync scheduler
├── zdt-watch.py           # File watcher daemon
├── zdt-web.py             # Legacy Flask web dashboard
├── admin-dashboard/       # React + Tailwind SPA
│   └── src/
│       ├── api/           # API client (axios)
│       ├── components/    # Shared components (Layout, modals)
│       ├── context/       # React contexts
│       ├── pages/         # Dashboard, Files, Settings, Tools, etc.
│       └── types/         # TypeScript types
├── systemd/               # systemd unit files
├── zdt-modules/           # Shared shell + python modules
├── templates/             # Legacy Flask templates
└── tests/                 # pytest tests
```

## Docker

```bash
docker build -t zdt-api .
docker run -d \
  -p 2000:2000 \
  -v /path/to/music:/home/user/Music \
  -v /path/to/config.env:/app/config.env \
  --name zdt-api \
  zdt-api
```

## Security

- Passwords hashed with werkzeug (bcrypt/scrypt), transparent SHA-256 migration
- JWT secret persisted in config.env
- CSRF protection for cookie sessions
- Path traversal protection on all file endpoints
- Filename sanitization via `werkzeug.utils.secure_filename`
- Subprocess commands validated against shell metacharacters
- VPN credentials masked in API responses
- In-memory rate limiting
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
- Request ID tracking (X-Request-ID)
- Graceful shutdown on SIGTERM/SIGINT
- Config file permissions: 600

## Testing

```bash
pytest tests/ -v
pytest tests/test_auth.py -v
python tests/verify_production.py
```
