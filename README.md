# ZDT API Server

Standalone API server untuk ZDT Mobile app & Telegram Bot. Flask + SQLite backend dengan download queue, VPN management, file management, admin dashboard SPA, dan AI-powered Telegram assistant.

## Features

- **ZDT Web Console** (`/`) — Template-based web console untuk download, Spotify sync, metadata editor, tools, logs, scheduler, notifikasi. Dengan login overlay + JWT Bearer token.
- **Admin Dashboard** (`/admin/`) — React + Tailwind SPA untuk manage server, users, API keys, VPN, services, system config, dependencies, notifications.
- **Telegram Bot** — AI-powered assistant (Gemini/OpenRouter), search & download YouTube, pisah vokal, kompres media, dll.
- **Download Engine** — yt-dlp backend untuk download audio/video dari YouTube, TikTok, Instagram, dll.
- **File Management** — Browse, search, stream, download, upload, rename, delete file langsung dari browser
- **VPN Manager** — Connect/disconnect VPN, auto-reconnect, connection log, restart
- **Task Queue** — SQLite-backed persistent antrian task dengan worker thread, max 3 concurrent, support cancel + timeout kill. Task types: download, demucs, sync_lirik, kompres.
- **Real-time Notifications** — SSE stream untuk task events + EventBus pub/sub internal + admin notification system dengan unread count.
- **Backup & Restore** — Backup database SQLite + config.env, list backup, restore dengan auto-backup sebelumnya.
- **Auto-Update** — Cek rilis GitHub, git pull + pip install + restart service otomatis.
- **Plugin System** — Hot-loadable plugins dengan hooks: on_load, on_unload, on_task_complete, on_task_fail, on_download_complete, on_startup.
- **Metrics History** — Background collector untuk CPU load, memory, disk tiap 60 detik, retention 7 hari.
- **API Key Auth** — Smart API Key untuk mobile app, JWT + refresh token untuk admin dashboard. Brute-force protection (5 gagal = blokir 15 menit).
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
gunicorn --bind 0.0.0.0:2000 --worker-class gthread --workers 1 --threads 2 --timeout 120 server:app
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
| `zdt-api.service` | API server (gunicorn) — **1 port untuk semua** | 2000 |
| `zdt-telegram.service` | Telegram bot (polling) | — |
| `zdt-watch.service` | File system watcher | — |
| `zdt-scheduler.service` | Periodic playlist sync | — |
| `zdt-scheduler.timer` | Trigger scheduler every hour | — |

> **Port 5000 (zdt-web) sudah deprecated.** Semua endpoint udah merger ke `server.py` port 2000.
> `zdt-web.py` masih ada sebagai wrapper 24 baris untuk backward compatibility, tapi ga perlu diaktifkan.

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
| `REDIS_URL` | `""` | Redis connection URL untuk rate limiting terpusat (multi-worker). Contoh: `redis://localhost:6379/0`. Jika kosong, pakai in-memory fallback. |

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
- `GET /api/csrf-token` — Generate CSRF token

### Auth
- `POST /api/login` — Admin login (returns JWT Bearer + refresh token). Brute-force protection: 5 gagal dalam 5 menit = blokir 15 menit.
- `POST /api/auth/refresh` — Tukar refresh token dengan Bearer token baru (refresh token lama invalid setelah dipakai)
- `POST /api/verify-key` — Verify Smart API Key
- `GET /api/profile` — Profile user yg login (id, username, role, label)
- `PUT /api/profile` — Update display label user
- `POST /api/profile/password` — Ganti password dengan verifikasi password lama

### Files
- `GET /api/files` — List files (paginated, sortable, filterable)
- `GET /api/files/browse` — Browse files/folders flat (non-rekursif), scope `media` / `system`
- `GET /api/files/search?q=term` — Search files
- `GET /api/files/info/<path>` — File metadata (duration via ffprobe)
- `DELETE /api/files/<path>` — Delete file/directory
- `POST /api/files/delete` — Delete via POST (alternatif), support scope media/system
- `POST /api/files/mkdir` — Create directory
- `POST /api/files/rename` — Rename file
- `GET /api/stream/<path>` — Stream media (video/audio)
- `GET /api/dl/<path>` — Download file
- `POST /api/upload` — Upload file
- `POST /api/metadata` — Edit audio file metadata (title/artist) — MP3/M4A/FLAC

### Downloads (Legacy)
- `POST /api/download` — Queue download
- `GET /api/downloads` — List download history
- `GET /api/downloads/<id>` — Download detail + progress
- `DELETE /api/downloads/<id>` — Cancel download
- `POST /api/downloads/retry/<id>` — Retry failed
- `DELETE /api/downloads/history` — Clear all history
- `POST /api/spotify-sync` — Trigger Spotify playlist sync
- `POST /api/playlist/items` — Fetch playlist contents via yt-dlp
- `POST /api/download-selected` — Batch download multiple URLs

### Task Queue (New)
- `POST /api/tasks` — Buat task baru: `download_audio`, `download_video`, `demucs`, `sync_lirik`, `kompres`
- `GET /api/tasks` — Daftar task milik user; filter by `status`, `limit`, `offset`
- `GET /api/tasks/<id>` — Detail task (status, progress, error_message, file_path)
- `POST /api/tasks/<id>/cancel` — Batalkan task (queued dihapus, running dikirim SIGTERM → SIGKILL)
- `DELETE /api/tasks/<id>` — Hapus task dari history
- `GET /api/tasks/queue/stats` — Statistik antrian per status (queued/running/completed/failed/cancelled)
- `GET /api/tasks/stream` — SSE real-time task updates (EventBus + SSEManager, ping 30 detik)

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
- `GET /api/settings/storage` — Get storage config
- `POST /api/settings/storage` — Update target directory
- `GET /api/settings/download` — Get download preferences
- `POST /api/settings/download` — Update download preferences
- `GET /api/settings/telegram` — Get Telegram config (masked)
- `POST /api/settings/telegram` — Update Telegram config
- `POST /api/settings/telegram/test` — Kirim test message Telegram
- `GET /api/settings/ai-keys` — Get AI API keys (masked)
- `POST /api/settings/ai-keys` — Update/delete AI API keys
- `GET /api/settings/browse-dir` — Browse filesystem directories
- `GET /api/server/info` — Version, tools, IP, storage info
- `GET /api/notify/config` — Telegram notification config
- `POST /api/notify/config` — Update notification config
- `POST /api/notify/test` — Send test notification

### Dashboard
- `GET /api/stats` — Download statistics
- `GET /api/status` — Server health
- `POST /api/stats/reset` — Reset download statistics

### VPN
- `GET /api/vpn/status` — Connection status (mobile-friendly)
- `GET /api/admin/vpn/status` — Detailed status
- `POST /api/admin/vpn/connect` — Connect
- `POST /api/admin/vpn/disconnect` — Disconnect
- `POST /api/admin/vpn/restart` — Restart koneksi (disconnect + connect ulang)
- `GET /api/admin/vpn/config` — View config
- `POST /api/admin/vpn/config` — Update config
- `GET /api/admin/vpn/log` — Connection log
- `POST /api/admin/vpn/auto-reconnect` — Toggle auto-reconnect

### Admin — Users & Keys
- `GET /api/admin/keys` — List API keys
- `POST /api/admin/keys` — Generate Smart API Key
- `DELETE /api/admin/keys/<id>` — Revoke key
- `GET /api/admin/users` — List users
- `POST /api/admin/users` — Create user
- `PUT /api/admin/users/<id>` — Update user (username, password, role, label, active)
- `DELETE /api/admin/users/<id>` — Delete user

### Admin — System
- `GET /api/admin/dashboard` — System overview stats
- `GET /api/admin/services` — Service status list
- `POST /api/admin/services/<name>/<action>` — Start/stop/restart/enable/disable
- `GET /api/admin/config` — View config (masked secrets)
- `POST /api/admin/config` — Update config
- `GET /api/admin/system/status` — Service health
- `POST /api/admin/system/restart` — Restart API service
- `POST /api/admin/system/shutdown` — Shutdown server
- `GET /api/admin/dependencies` — Cek ketersediaan tools (ffmpeg, yt-dlp, spotdl, dll)
- `POST /api/admin/dependencies/install` — Install missing dependencies (timeout 10 menit)

### Admin — Activity & Notifications
- `GET /api/admin/activity` — Activity logs
- `POST /api/admin/activity/clear` — Hapus semua activity logs
- `GET /api/admin/notifications` — Notifikasi penting dengan unread_count + since_id
- `GET /api/admin/notifications/last-seen` — Ambil last seen notification ID
- `POST /api/admin/notifications/last-seen` — Simpan last seen notification ID
- `GET /api/admin/notifications/settings` — Preferensi notifikasi (sound, desktop)
- `POST /api/admin/notifications/settings` — Simpan preferensi notifikasi

### Admin — Metrics
- `GET /api/admin/metrics/history` — Histori CPU load, memory, disk (?hours=1-168)

### Admin — Backup
- `POST /api/admin/backup` — Backup database + config.env ke folder `backups/`
- `GET /api/admin/backups` — Daftar semua file backup
- `POST /api/admin/backup/restore` — Restore database dari file backup

### Admin — Plugins
- `GET /api/admin/plugins` — Scan & list semua plugin + status loaded
- `POST /api/admin/plugins/<name>/load` — Load plugin ke memory
- `POST /api/admin/plugins/<name>/unload` — Unload plugin dari memory

### Update
- `GET /api/update-check` — Check GitHub for newer version
- `POST /api/update-apply` — Git pull + pip install + restart service
- `GET /api/update-log` — Log update terakhir

### Auth Methods

**Mobile App** — X-API-Key header:
```
GET /api/files
X-API-Key: <base64-encoded-smart-key>
```

**Admin Dashboard** — Bearer token:
```
POST /api/login  →  { "token": "jwt...", "refresh_token": "zdt_rt_..." }
Authorization: Bearer <jwt-token>
```

## Access

Semua akses via **1 port: 2000**. Bisa lewat VPN atau LAN.

| URL | Untuk | Fitur |
|-----|-------|-------|
| `http://ip:2000/` | **ZDT Web Console** | Download, Spotify sync, metadata editor, tools, logs, scheduler, notifikasi. Login via overlay. |
| `http://ip:2000/admin/` | **Admin Dashboard** | Users, API keys, VPN, services, system config, dependencies. Login via React SPA. |
| `http://ip:2000/api/...` | **API Endpoint** | Mobile app & Telegram bot. Auth via X-API-Key (mobile) atau Bearer token (admin). |

## Redis Setup (Optional)

Redis provides centralized rate limiting for multi-worker Gunicorn setups.
Without Redis, each worker has its own in-memory rate limit counter
(effective limit becomes `max_requests * workers`).

```bash
# 1. Install Redis (included in install.sh)
sudo apt install -y redis-server redis-tools

# 2. Start & enable on boot
sudo systemctl enable --now redis-server

# 3. Verify
redis-cli ping  # Should return PONG

# 4. Add to config.env
REDIS_URL=redis://localhost:6379/0

# 5. Restart API server
sudo systemctl restart zdt-api
```

Rate limiting is handled by `middleware.py`. Default: 240 requests/minute per IP.

## Architecture

```
zdt-api/
├── server.py              # 🎯 Flask app entrypoint — serve ZDT Web (/) + Admin (/admin/) + API
├── auth.py                # JWT, API Key auth, password hashing, refresh token, brute-force protection
├── config.py              # Config reader (config.env)
├── database.py            # SQLite init + CRUD
├── middleware.py           # CORS, security headers, rate limiting (Redis + in-memory)
├── events.py              # EventBus pub/sub internal + SSEManager untuk task events
├── metrics.py             # Background metrics collector (CPU, memory, disk tiap 60 detik, retention 7 hari)
├── plugin_system.py       # Plugin discovery, load/unload, hooks system
├── task_queue.py          # SQLite-backed persistent task queue + worker thread (max 3 concurrent)
├── openapi_spec.py        # OpenAPI 3.0.3 spec untuk Swagger UI
├── routes/                # Flask blueprints
│   ├── admin_routes.py    # Admin: dashboard, services, users, keys, system, backup, plugins, dependencies, notifications, metrics, update
│   ├── auth_routes.py     # Login, refresh token, verify key, profile
│   ├── daemon_routes.py   # Demucs, compress, sync, tools, scheduler status/playlists
│   ├── dashboard_routes.py# Dashboard stats + stats reset
│   ├── download_routes.py # Download queue, spotify-sync, playlist/items, download-selected
│   ├── files_routes.py    # File browser, stream, upload, metadata editor
│   ├── logs_routes.py     # Log viewer, SSE stream, system logs
│   ├── settings_routes.py # All settings CRUD, notify config, server info, AI keys
│   └── vpn_routes.py      # VPN connect/disconnect/status/restart
├── zdt-telegram.py        # Telegram bot daemon
├── zdt-scheduler.py       # Playlist sync scheduler
├── zdt-watch.py           # File watcher daemon
├── zdt-web.py             # ⏳ Legacy wrapper (24 baris, import dari server.py) — deprecated
├── admin-dashboard/       # React + Tailwind SPA (serve di /admin/)
│   └── src/
│       ├── api/           # API client (axios)
│       ├── components/    # Shared components (Layout, modals)
│       ├── context/       # React contexts
│       ├── pages/         # Dashboard, Files, Settings, Tools, etc.
│       └── types/         # TypeScript types
├── static/                # ZDT Web Console static files
│   ├── dashboard.css      #   CSS: Warm Console design system (v5.0)
│   ├── dashboard.js       #   JS: Auth, SSE, tools, scheduler, logs, themes
│   └── swagger-ui-bundle.js # Swagger UI bundle
├── templates/             # ZDT Web Console (serve di /) — dashboard.html
├── systemd/               # systemd unit files
├── zdt-modules/           # Shared shell + python modules
├── plugins/               # Plugin directory (hot-loadable)
├── backups/               # Backup files (database + config)
└── tests/                 # pytest tests
```

> **Single port architecture:** Semua endpoint dari `zdt-web.py` (dulu port 5000) dan `server.py` (port 2000) sudah merger ke 1 aplikasi di port 2000.
> - `http://ip:2000/` → `templates/dashboard.html` (ZDT Web Console)
> - `http://ip:2000/admin/` → `admin-dashboard/dist/` (React SPA)
> - `http://ip:2000/api/...` → API endpoints dari route blueprints

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
- JWT secret persisted in config.env. Refresh token (`zdt_rt_` + 32 byte hex) berlaku 30 hari, sekali pakai.
- Brute-force login protection: 5 gagal dalam 5 menit = blokir 15 menit per IP
- CSRF protection for cookie sessions
- Path traversal protection on all file endpoints
- Filename sanitization via `werkzeug.utils.secure_filename`
- Subprocess commands validated against shell metacharacters
- VPN credentials masked in API responses
- In-memory rate limiting with optional Redis backend (`REDIS_URL` di config.env)
  - Multi-worker Gunicorn: Redis menyediakan rate limit terpusat antar worker
  - Fallback otomatis ke in-memory jika Redis tidak tersedia
- **ZDT Web Console** di `/` dengan login overlay + JWT Bearer token stored di localStorage
- **Admin Dashboard** di `/admin/` sebagai React SPA terpisah
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

### v2.0.0 — Task Queue, Event System, Backup, Plugin System, Refresh Token

| Perubahan | File | Deskripsi |
|-----------|------|-----------|
| **Task Queue Engine** | `task_queue.py` | SQLite-backed persistent antrian task dengan worker thread, max 3 concurrent tasks. Support cancel dengan SIGTERM → SIGKILL. Task types: download_audio, download_video, demucs, sync_lirik, kompres. |
| **Task Queue API** | `routes/admin_rules.py` | 7 endpoint: CRUD task + cancel + queue stats + SSE stream real-time |
| **EventBus** | `events.py` | Event pub/sub internal untuk task updates. Support subscribe/unsubscribe/emit. |
| **SSEManager** | `events.py` | Manajemen koneksi SSE: add/remove client, broadcast event ke semua client. Ping tiap 30 detik. |
| **Metrics Collector** | `metrics.py` | Background thread mengumpulkan CPU load, memory, disk tiap 60 detik ke SQLite. Retention 7 hari. |
| **Metrics API** | `routes/admin_routes.py` | `GET /api/admin/metrics/history` dengan parameter `?hours=1-168` |
| **Plugin System** | `plugin_system.py` | Plugin discovery dari folder `plugins/`, hot load/unload. Hooks: on_load, on_unload, on_task_complete, on_task_fail, on_download_complete, on_startup. |
| **Plugin API** | `routes/admin_routes.py` | `GET /api/admin/plugins`, `POST .../load`, `POST .../unload` |
| **Backup & Restore** | `routes/admin_routes.py` | Backup database SQLite + config.env ke folder `backups/`. Restore dengan auto-backup sebelumnya. |
| **Auto-Update** | `routes/admin_routes.py` | `POST /api/update-apply` — git pull + pip install + restart service. `GET /api/update-log`. |
| **Admin Notifications** | `routes/admin_routes.py` | Sistem notifikasi penting dengan unread_count, since_id tracking, preferensi sound/desktop per user. |
| **Dependencies Check** | `routes/admin_routes.py` | `GET /api/admin/dependencies` cek ketersediaan tools, `POST .../install` install missing. |
| **Refresh Token** | `routes/auth_routes.py` | Refresh token (`zdt_rt_` + 32 byte hex) berlaku 30 hari, sekali pakai (token lama di-pop). Brute-force: 5 gagal dalam 5 menit = blokir 15 menit per IP. |
| **Profile API** | `routes/auth_routes.py` | `GET /api/profile`, `PUT /api/profile`, `POST /api/profile/password` |
| **Settings Sub-endpoints** | `routes/settings_routes.py` | Endpoint individual untuk storage, download, telegram, ai-keys. |
| **File Browse** | `routes/files_routes.py` | `GET /api/files/browse` — browse non-rekursif dengan scope media/system. |
| **VPN Restart** | `routes/vpn_routes.py` | `POST /api/admin/vpn/restart` — disconnect + connect ulang, timeout 30 detik. |
| **OpenAPI Spec** | `openapi_spec.py` | Update ke v1.3.0, tambah semua endpoint baru, contoh request/response, info refresh token & brute-force. |
| **Swagger UI** | `static/swagger-ui-bundle.js` | Swagger UI bundle di `/api/docs` untuk dokumentasi interaktif. |

### v1.4.0 — daisyUI Migration, Telegram Overhaul, CSRF Fixes

| Perubahan | File | Deskripsi |
|-----------|------|-----------|
| **daisyUI Migration** | Semua 13 TSX files | Admin Dashboard migrasi penuh ke daisyUI components. App.css dihapus, index.css dibersihkan. FileBrowser 100% daisyUI classes. |
| **Dashboard Backend** | `routes/dashboard_routes.py` | File count cache 30 detik, ThreadPoolExecutor untuk parallel stat, timeout 2s. |
| **Timezone Fix** | `LogsPage.tsx`, `NotificationsPage.tsx` | Waktu tidak lagi pakai `+Z` suffix. |
| **VPN Python Rewrite** | `routes/vpn_routes.py` | VPN menggunakan l2tp-control write langsung + sudo fallback. `NoNewPrivileges=true` dihapus dari systemd. |
| **Telegram Overhaul** | `zdt-telegram.py` | Interactive download flow dengan progress bar, demucs post-processing, unified stats, keyword fallback `cari/search/carikan`, index-based callback data (tidak pakai URL di callback_data), `get_target_dir()` baca project config.env dulu, bitrate (64–320) & resolution (144p–2160p) lengkap, post-download button Sync Lirik & Pisah Vokal. |
| **apiSilent Migration** | `ToolsPage.tsx`, `FileBrowser.tsx`, `client.ts`, `AppHeader.tsx` | Semua background polling & silent API calls pakai `apiSilent` (tanpa redirect 403). |
| **CSRF Bearer Bypass** | `server.py` | Bearer token yang valid skip CSRF validation, mencegah 403 false positive. |
| **resolve_path** | `routes/daemon_routes.py` | Absolute paths (system-scope browser) langsung diproses tanpa path traversal check. |
| **delete_all** | `routes/daemon_routes.py` | Hapus SEMUA item (file + recursive folder), bukan hanya media files. |
| **External Update Check** | `routes/admin_routes.py` | Endpoint `/api/update-check` dihapus. |
| **System Restart** | `routes/admin_routes.py` | Pakai `systemctl` langsung, bukan subprocess shell. |
| **gunicorn Config** | systemd service | `--worker-class gthread --workers 1 --threads 2 --timeout 120` |

### v1.3.0 — ZDT Web Console + Single Port Architecture

| Perubahan | File | Deskripsi |
|-----------|------|-----------|
| **ZDT Web Login Overlay** | `templates/dashboard.html` | Login modal dengan username/password. JWT disimpan di localStorage. Semua fetch() auto-inject Bearer token. Logout button di sidebar. |
| **Single Port Architecture** | `server.py` | `http://ip:2000/` → ZDT Web Console, `http://ip:2000/admin/` → Admin Dashboard (React SPA). 404 redirect ke `/`. |
| **Port 5000 Deprecated** | README | `zdt-web.py` masih ada sebagai wrapper 24 baris, tapi semua via port 2000. |

### v1.2.0 — Dual Server Merge + Redis Rate Limiter

| Perubahan | File | Deskripsi |
|-----------|------|-----------|
| **Dual Server Merge** | Semua route files | Semua endpoint unik dari `zdt-web.py` (spotify-sync, playlist/items, download-selected, metadata, scheduler, notify, system/logs, stats/reset, update-check, dll.) dipindahkan ke route blueprint `server.py`. `zdt-web.py` sekarang menjadi wrapper 24 baris. |
| **Redis Rate Limiter** | `middleware.py` | Optional Redis backend dengan fallback in-memory. Aktif jika `REDIS_URL` diisi di config.env. |

### v1.1.0 — Security & Stability Improvements

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
