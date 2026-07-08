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
| `zdt-api.service` | API server (gunicorn) — **aplikasi unified** | 2000 |
| `zdt-telegram.service` | Telegram bot (polling) | — |
| `zdt-watch.service` | File system watcher | — |
| `zdt-scheduler.service` | Periodic playlist sync | — |
| `zdt-scheduler.timer` | Trigger scheduler every hour | — |

> **Legacy `zdt-web` service:** Endpoint `zdt-web.py` sudah di-merge ke `server.py`. File `zdt-web.py` masih ada sebagai wrapper 24 baris yang import dari `server.py`. Jika masih ada systemd service `zdt-web.service`, ia tetap jalan di port 5000 dengan aplikasi yang sama persis. Untuk produksi baru, cukup gunakan `zdt-api.service` (port 2000).

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
- `DELETE /api/downloads/history` — Clear all history
- `POST /api/spotify-sync` — Trigger Spotify playlist sync
- `POST /api/playlist/items` — Fetch playlist contents via yt-dlp
- `POST /api/download-selected` — Batch download multiple URLs

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

### Files
- `POST /api/metadata` — Edit audio file metadata (title/artist) — MP3/M4A/FLAC

### Daemon & Tools
- `POST /api/daemon` — Watch/scheduler control
- `POST /api/tools` — Run tools (clean, compress, playlist, sync_lyrics, demucs, delete_all)
- `GET /api/scheduler/status` — Check scheduler daemon status
- `GET /api/scheduler/playlists` — Get scheduled playlists
- `POST /api/scheduler/playlists` — Save playlist schedule

### Logs
- `GET /api/logs` — Recent task logs
- `GET /api/logs/stream` — Live log stream (SSE)
- `POST /api/logs/clear` — Clear task log file
- `GET /api/system/logs` — System logs (journalctl/syslog)

### Settings & Info
- `GET /api/settings` — All settings grouped
- `POST /api/settings` — Batch update settings
- `GET /api/server/info` — Version, tools, IP, storage info
- `GET /api/notify/config` — Telegram notification config
- `POST /api/notify/config` — Update notification config
- `POST /api/notify/test` — Send test notification

### Dashboard
- `GET /api/stats` — Download statistics
- `GET /api/status` — Server health
- `POST /api/stats/reset` — Reset download statistics

### Update
- `GET /api/update-check` — Check GitHub for newer version

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
├── server.py              # ✨ Flask app entrypoint — UNIFIED (semua endpoint)
├── auth.py                # JWT, API Key auth, password hashing
├── config.py              # Config reader (config.env)
├── database.py            # SQLite init + CRUD
├── middleware.py           # CORS, security headers, rate limiting (Redis + in-memory)
├── routes/                # Flask blueprints
│   ├── admin_routes.py    # Admin: dashboard, services, users, keys, system, update-check
│   ├── auth_routes.py     # Login, verify key
│   ├── daemon_routes.py   # Demucs, compress, sync, tools, scheduler status/playlists
│   ├── dashboard_routes.py# Dashboard stats + stats reset
│   ├── download_routes.py # Download queue, spotify-sync, playlist/items, download-selected
│   ├── files_routes.py    # File browser, stream, upload, metadata editor
│   ├── logs_routes.py     # Log viewer, SSE stream, system logs
│   ├── settings_routes.py # All settings CRUD, notify config, server info
│   └── vpn_routes.py      # VPN connect/disconnect/status
├── zdt-telegram.py        # Telegram bot daemon
├── zdt-scheduler.py       # Playlist sync scheduler
├── zdt-watch.py           # File watcher daemon
├── zdt-web.py             # ⏳ Legacy wrapper (24 baris, import dari server.py)
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

> **Dual server merge:** Sebelumnya ada 2 server Flask terpisah (`server.py` port 2000 dan `zdt-web.py` port 5000) dengan endpoint duplikat. Semua endpoint unik dari `zdt-web.py` sudah dipindahkan ke route blueprint `server.py`, dan `zdt-web.py` sekarang tinggal wrapper 24 baris yang import `create_app()` dari `server.py`. Kedua port serve aplikasi identik.

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
- In-memory rate limiting with optional Redis backend (redis://... in config.env → `REDIS_URL`)
  - Multi-worker Gunicorn: Redis menyediakan rate limit terpusat antar worker
  - Fallback otomatis ke in-memory jika Redis tidak tersedia
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

## Bug Fixes & Changelog

### v1.2.0 — Dual Server Merge + Redis Rate Limiter

| Perubahan | File | Deskripsi |
|-----------|------|-----------|
| **Dual Server Merge** | Semua route files | Semua endpoint unik dari `zdt-web.py` (spotify-sync, playlist/items, download-selected, metadata, scheduler, notify, system/logs, stats/reset, update-check, dll.) dipindahkan ke route blueprint `server.py`. `zdt-web.py` sekarang menjadi wrapper 24 baris. |
| **Redis Rate Limiter** | `middleware.py` | Optional Redis backend dengan fallback in-memory. Aktif jika `REDIS_URL` diisi di config.env. |

### v1.1.0 — Security & Stability Improvements

| Perbaikan | File | Deskripsi |
|-----------|------|-----------|
| **Dual Database** | `routes/dashboard_routes.py` | Dashboard stats sekarang query langsung ke `database.py` (single source of truth), bukan via subprocess ke `zdt_db.py` yang terpisah. Data download tidak lagi tercecer di database berbeda. |

| Perbaikan | File | Deskripsi |
|-----------|------|-----------|
| **Dual Database** | `routes/dashboard_routes.py` | Dashboard stats sekarang query langsung ke `database.py` (single source of truth), bukan via subprocess ke `zdt_db.py` yang terpisah. Data download tidak lagi tercecer di database berbeda. |
| **CSRF Validation** | `server.py` | CSRF middleware disederhanakan: jika cookie CSRF ada → validasi header; jika tidak ada cookie → bypass untuk Bearer token, API Key, atau Basic Auth yang valid. Tidak ada false positive 403 lagi untuk admin dashboard. |
| **Command Injection (Telegram)** | `zdt-telegram.py` | URL dari AI response AI sekarang divalidasi dengan regex `https?://[^\s]+` sebelum dieksekusi. Query pencarian dibatasi 500 karakter. Mencegah injection via response AI yang dimanipulasi. |
| **Shell Injection (Demucs)** | `routes/daemon_routes.py` | Menghapus `bash -c` dengan string concatenation. Diganti dengan Python subprocess murni menggunakan array arguments dan path traversal validation via `os.path.commonpath()`. Aman untuk filename dengan karakter spesial. |
| **Config Race Condition** | `config.py` | `update_config()` sekarang thread-safe dengan `threading.Lock()`. Mencegah konflik saat dua request update config bersamaan. |
| **Upload Overwrite** | `routes/files_routes.py` | Upload file sekarang return 409 Conflict jika file sudah ada, bukan meng-overwrite secara diam-diam. |
| **Password Sync** | `routes/auth_routes.py` | Setelah update password, config di-reload segera (`_load_config()`) agar Basic Auth langsung menggunakan password baru tanpa perlu restart server. |
| **Download Cancel** | `routes/download_routes.py` | Endpoint DELETE download hanya mengubah status ke 'cancelled' (soft delete), tidak menghapus record. History tetap tersimpan. |
| **Download Retry Format** | `routes/download_routes.py` | Fix fallback format dari `download.get('format', 'auto')` menjadi `download.get('format') or 'auto'` untuk handle kasus nilai NULL di database. |
| **Lazy Import (Mutagen)** | `zdt-web.py` | Mutagen import dipindah ke endpoint `update_metadata()` (lazy import) agar error message jelas jika belum terinstall, bukan silent pass. |
| **SSE Thread Safety** | `zdt-web.py` | Menggunakan `threading.RLock()` untuk SSE connection counter agar aman dari race condition. |

### Sebelumnya

- v1.0.0 — Initial release with admin dashboard SPA, Telegram bot, download engine, VPN manager
