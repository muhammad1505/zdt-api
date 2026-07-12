OPENAPI_SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "ZDT API Server",
        "version": "1.3.0",
        "description": "API untuk mengelola download media, file, pengaturan, monitoring server, task queue, VPN, backup, dan plugin ZDT.\n\n## Auth\n- **X-API-Key**: Smart API Key (Base64) atau `key_id|secret` untuk mobile app\n- **Bearer Token**: JWT untuk admin dashboard (dapat refresh token)\n- **Basic Auth**: username:password untuk kompatibilitas legacy\n\nDokumentasi interaktif: [Swagger UI](/api/docs)",
        "contact": {"name": "ZDT Project"}
    },
    "servers": [{"url": "/", "description": "Local server"}],
    "components": {
        "securitySchemes": {
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "X-API-Key",
                "description": "Smart API Key (Base64) atau key_id|secret"
            },
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "JWT Bearer token dari /api/login"
            },
            "BasicAuth": {
                "type": "http",
                "scheme": "basic"
            }
        },
        "schemas": {
            "Error": {
                "type": "object",
                "properties": {
                    "success": {"type": "boolean", "example": False},
                    "error": {"type": "string"},
                    "message": {"type": "string"}
                }
            },
            "Task": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "type": {"type": "string", "enum": ["download_audio", "download_video", "demucs", "sync_lirik", "kompres"]},
                    "status": {"type": "string", "enum": ["queued", "running", "completed", "failed", "cancelled"]},
                    "priority": {"type": "integer", "minimum": 0, "maximum": 2},
                    "url": {"type": "string"},
                    "progress": {"type": "integer", "minimum": 0, "maximum": 100},
                    "progress_message": {"type": "string"},
                    "file_path": {"type": "string"},
                    "error_message": {"type": "string"},
                    "source": {"type": "string", "enum": ["api", "telegram", "web"]},
                    "created_at": {"type": "string", "format": "date-time"},
                    "started_at": {"type": "string", "format": "date-time"},
                    "completed_at": {"type": "string", "format": "date-time"}
                }
            },
            "QueueStats": {
                "type": "object",
                "properties": {
                    "queued": {"type": "integer"},
                    "running": {"type": "integer"},
                    "completed": {"type": "integer"},
                    "failed": {"type": "integer"},
                    "cancelled": {"type": "integer"},
                    "total": {"type": "integer"}
                }
            }
        }
    },
    "security": [{"ApiKeyAuth": []}, {"BearerAuth": []}, {"BasicAuth": []}],
    "paths": {
        # === AUTH ===
        "/api/login": {
            "post": {
                "summary": "Login",
                "description": "Login dengan username & password. Mengembalikan Bearer token (24 jam) + refresh token (30 hari).\n\nBrute-force protection: 5 gagal dalam 5 menit = blokir 15 menit.",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "username": {"type": "string", "example": "admin"},
                                    "password": {"type": "string", "example": "password"}
                                },
                                "required": ["username", "password"]
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Login berhasil"},
                    "401": {"description": "Invalid credentials"},
                    "429": {"description": "Too many attempts, coba 15 menit lagi"}
                }
            }
        },
        "/api/auth/refresh": {
            "post": {
                "summary": "Refresh Token",
                "description": "Tukar refresh token dengan Bearer token baru + refresh token baru (token lama invalid setelah dipakai).",
                "security": [],
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "refresh_token": {"type": "string"}
                                },
                                "required": ["refresh_token"]
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Token baru"},
                    "401": {"description": "Invalid/expired refresh token"}
                }
            }
        },
        "/api/verify-key": {
            "post": {
                "summary": "Verifikasi API Key",
                "description": "Cek apakah Smart API Key valid.",
                "security": [],
                "responses": {"200": {"description": "Key valid"}, "401": {"description": "Key invalid"}}
            }
        },
        "/api/health": {
            "get": {
                "summary": "Health Check",
                "description": "Cek status server, database, uptime.",
                "security": [],
                "responses": {"200": {"description": "Server sehat"}, "503": {"description": "Database down"}}
            }
        },
        "/api/profile": {
            "get": {
                "summary": "Profil user",
                "description": "Ambil profil user yang sedang login.",
                "responses": {"200": {"description": "User profile"}}
            },
            "put": {
                "summary": "Update display label",
                "responses": {"200": {"description": "Label updated"}}
            }
        },
        "/api/profile/password": {
            "post": {
                "summary": "Ganti password",
                "description": "Ganti password dengan verifikasi password lama.",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "old_password": {"type": "string"},
                                    "new_password": {"type": "string"}
                                },
                                "required": ["old_password", "new_password"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Password updated"}}
            }
        },

        # === TASKS ===
        "/api/tasks": {
            "post": {
                "summary": "Buat task baru",
                "description": "Membuat task download/processing baru di antrian.\n\nTipe task:\n- `download_audio`: Download audio dari URL\n- `download_video`: Download video dari URL\n- `demucs`: Pisah vokal (param: filepath)\n- `sync_lirik`: Sync lirik (param: filepath)\n- `kompres`: Kompres media (param: filepath)",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string", "enum": ["download_audio", "download_video", "demucs", "sync_lirik", "kompres"], "example": "download_audio"},
                                    "url": {"type": "string", "description": "URL untuk download"},
                                    "params": {
                                        "type": "object",
                                        "description": "Parameter tambahan",
                                        "properties": {
                                            "audio_format": {"type": "string", "example": "mp3"},
                                            "bitrate": {"type": "string", "example": "320"},
                                            "quality": {"type": "string", "example": "720"},
                                            "video_format": {"type": "string", "example": "mp4"},
                                            "filepath": {"type": "string"}
                                        }
                                    },
                                    "priority": {"type": "integer", "default": 1, "minimum": 0, "maximum": 2}
                                },
                                "required": ["type"]
                            }
                        }
                    }
                },
                "responses": {
                    "201": {"description": "Task created"},
                    "400": {"description": "Invalid type or missing URL"}
                }
            },
            "get": {
                "summary": "Daftar task",
                "description": "Ambil daftar task (milik user sendiri untuk non-admin).",
                "parameters": [
                    {"name": "status", "in": "query", "schema": {"type": "string", "enum": ["queued", "running", "completed", "failed", "cancelled"]}},
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50, "maximum": 200}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}}
                ],
                "responses": {"200": {"description": "List tasks + queue stats"}}
            }
        },
        "/api/tasks/queue/stats": {
            "get": {
                "summary": "Statistik antrian",
                "description": "Jumlah task per status (queued, running, completed, failed, cancelled).",
                "responses": {"200": {"description": "Queue statistics"}}
            }
        },
        "/api/tasks/{id}": {
            "get": {
                "summary": "Detail task",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Task detail"}, "404": {"description": "Task not found"}}
            },
            "delete": {
                "summary": "Hapus task dari history",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Task deleted"}}
            }
        },
        "/api/tasks/{id}/cancel": {
            "post": {
                "summary": "Batalkan task",
                "description": "Membatalkan task queued atau running.\n\n- Queued: langsung dihapus dari antrian\n- Running: dikirim SIGTERM, lalu SIGKILL setelah 5 detik",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Task cancelled"}}
            }
        },
        "/api/tasks/stream": {
            "get": {
                "summary": "SSE Task Events",
                "description": "Server-Sent Events stream untuk update real-time task.\n\nEvent: `task_update` — data task lengkap setiap kali status berubah.\nKoneksi bertahan selama client terhubung (ping tiap 30 detik).",
                "responses": {"200": {"description": "SSE event stream"}}
            }
        },

        # === DOWNLOADS ===
        "/api/download": {
            "post": {
                "summary": "Queue download (legacy)",
                "description": "Download URL via subprocess langsung tanpa task queue (legacy).",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "url": {"type": "string"},
                                    "format": {"type": "string", "enum": ["audio", "video", "auto"]}
                                },
                                "required": ["url"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Download queued"}}
            }
        },
        "/api/downloads": {
            "get": {
                "summary": "History download",
                "parameters": [
                    {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                    {"name": "per_page", "in": "query", "schema": {"type": "integer", "default": 20, "maximum": 100}},
                    {"name": "status", "in": "query", "schema": {"type": "string"}}
                ],
                "responses": {"200": {"description": "List downloads"}}
            }
        },
        "/api/downloads/{id}": {
            "get": {
                "summary": "Detail download",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Download detail"}, "404": {"description": "Not found"}}
            },
            "delete": {
                "summary": "Hapus record download",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Deleted"}}
            }
        },
        "/api/downloads/{id}/retry": {
            "post": {
                "summary": "Ulangi download gagal",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Retry queued"}}
            }
        },
        "/api/download-selected": {
            "post": {
                "summary": "Batch download",
                "description": "Download beberapa URL sekaligus di background.",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "urls": {"type": "array", "items": {"type": "string"}},
                                    "format": {"type": "string", "enum": ["audio", "video"]},
                                    "quality": {"type": "string"}
                                }
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Batch started"}}
            }
        },
        "/api/spotify-sync": {
            "post": {
                "summary": "Sync playlist Spotify",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {"url": {"type": "string"}},
                                "required": ["url"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Sync started"}}
            }
        },
        "/api/playlist/items": {
            "post": {
                "summary": "Ambil item playlist YouTube",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {"url": {"type": "string"}},
                                "required": ["url"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Playlist items"}}
            }
        },

        # === FILES ===
        "/api/files/list": {
            "get": {
                "summary": "Daftar file media",
                "description": "List file di direktori target dengan filter type (audio/video) dan folder.",
                "parameters": [
                    {"name": "dir", "in": "query", "schema": {"type": "string"}},
                    {"name": "type", "in": "query", "schema": {"type": "string", "enum": ["audio", "video", ""]}}
                ],
                "responses": {"200": {"description": "File list"}}
            }
        },
        "/api/files/info/{filename}": {
            "get": {
                "summary": "Info file detail",
                "parameters": [{"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "File metadata"}, "404": {"description": "File not found"}}
            }
        },
        "/api/files/rename": {
            "post": {
                "summary": "Rename file",
                "responses": {"200": {"description": "Renamed"}}
            }
        },
        "/api/files/delete": {
            "post": {
                "summary": "Hapus file",
                "responses": {"200": {"description": "Deleted"}}
            }
        },

        # === SETTINGS ===
        "/api/settings": {
            "get": {
                "summary": "Ambil semua setting",
                "description": "Mengembalikan semua konfigurasi user (download preferences, VPN, UI).",
                "responses": {"200": {"description": "All settings"}}
            },
            "post": {
                "summary": "Update setting",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "key": {"type": "string"},
                                    "value": {"type": "string"}
                                },
                                "required": ["key", "value"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Updated"}}
            }
        },

        # === ADMIN ===
        "/api/admin/dashboard": {
            "get": {
                "summary": "Dashboard metrics",
                "description": "CPU load, Memory, Disk, Uptime, Service status (zdt-watch, zdt-telegram, zdt-scheduler), VPN status, System info, File count.",
                "responses": {"200": {"description": "Dashboard data"}}
            }
        },
        "/api/admin/metrics/history": {
            "get": {
                "summary": "Metrics history",
                "description": "Histori CPU, memory, disk dalam rentang waktu tertentu. Dikumpulkan setiap 60 detik.\nData disimpan 7 hari.",
                "parameters": [
                    {"name": "hours", "in": "query", "schema": {"type": "integer", "default": 24, "minimum": 1, "maximum": 168}}
                ],
                "responses": {"200": {"description": "Array of metric snapshots"}}
            }
        },
        "/api/admin/notifications": {
            "get": {
                "summary": "Notifikasi activity",
                "description": "Activity logs penting dengan tracking `since_id` untuk unread count.",
                "responses": {"200": {"description": "Notifications"}}
            }
        },
        "/api/admin/activity": {
            "get": {
                "summary": "Activity logs",
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50, "maximum": 200}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}}
                ],
                "responses": {"200": {"description": "Paginated activity logs"}}
            }
        },
        "/api/admin/keys": {
            "get": {
                "summary": "Daftar API Keys",
                "description": "Semua API key (secret tidak dikembalikan).",
                "responses": {"200": {"description": "List API keys"}}
            },
            "post": {
                "summary": "Generate API Key",
                "responses": {"200": {"description": "API key created"}}
            }
        },
        "/api/admin/keys/{id}": {
            "delete": {"summary": "Revoke API key", "responses": {"200": {"description": "Revoked"}}}
        },
        "/api/admin/users": {
            "get": {"summary": "Daftar users", "responses": {"200": {"description": "User list"}}},
            "post": {"summary": "Create user", "responses": {"200": {"description": "User created"}}}
        },
        "/api/admin/users/{id}": {
            "delete": {"summary": "Delete user", "responses": {"200": {"description": "Deleted"}}}
        },
        "/api/admin/services": {
            "get": {
                "summary": "Status services",
                "description": "Cek status systemd services: zdt-api, zdt-web, zdt-scheduler, zdt-telegram, zdt-watch.",
                "responses": {"200": {"description": "Service states"}}
            }
        },
        "/api/admin/services/{name}/restart": {
            "post": {
                "summary": "Restart service",
                "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Restart initiated"}}
            }
        },
        "/api/admin/services/{name}/logs": {
            "get": {
                "summary": "Log service",
                "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Recent log lines"}}
            }
        },
        "/api/admin/dependencies": {
            "get": {
                "summary": "Cek dependencies",
                "description": "Cek ketersediaan semua tools (yt-dlp, ffmpeg, spotdl, dll).",
                "responses": {"200": {"description": "Dependency status"}}
            }
        },

        # === BACKUP ===
        "/api/admin/backup": {
            "post": {
                "summary": "Buat backup",
                "description": "Backup database SQLite + file config.env ke folder backups/.",
                "responses": {"200": {"description": "Backup created"}}
            }
        },
        "/api/admin/backups": {
            "get": {
                "summary": "Daftar backup",
                "description": "List semua file backup yang tersedia.",
                "responses": {"200": {"description": "Backup list"}}
            }
        },
        "/api/admin/backup/restore": {
            "post": {
                "summary": "Restore database",
                "description": "Restore database dari file backup. Sebelum restore, database saat ini di-backup otomatis.",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "path": {"type": "string", "description": "Absolute path ke file backup .db"}
                                },
                                "required": ["path"]
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Restore result"}}
            }
        },

        # === UPDATE ===
        "/api/update-check": {
            "get": {
                "summary": "Cek update",
                "description": "Cek versi terbaru dari GitHub releases. Bandingkan dengan versi lokal.",
                "responses": {"200": {"description": "Update info"}}
            }
        },
        "/api/update-apply": {
            "post": {
                "summary": "Apply update",
                "description": "Git pull + pip install -r requirements.txt + restart service.\n\nCatatan: Server akan restart setelah update.",
                "responses": {"200": {"description": "Update in progress"}}
            }
        },
        "/api/update-log": {
            "get": {
                "summary": "Log update terakhir",
                "responses": {"200": {"description": "Update log"}}
            }
        },

        # === PLUGINS ===
        "/api/admin/plugins": {
            "get": {
                "summary": "Daftar plugin",
                "description": "Scan direktori plugins/ dan kembalikan semua plugin yang ditemukan + status loaded.",
                "responses": {"200": {"description": "Plugin list"}}
            }
        },
        "/api/admin/plugins/{name}/load": {
            "post": {
                "summary": "Load plugin",
                "description": "Load plugin ke memory. Plugin harus extends PluginBase.",
                "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Plugin loaded"}}
            }
        },
        "/api/admin/plugins/{name}/unload": {
            "post": {
                "summary": "Unload plugin",
                "parameters": [{"name": "name", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "Plugin unloaded"}}
            }
        },

        # === VPN ===
        "/api/admin/vpn/status": {
            "get": {
                "summary": "Status VPN",
                "description": "Cek koneksi ppp0 + status service xl2tpd.",
                "responses": {"200": {"description": "VPN status"}}
            }
        },
        "/api/admin/vpn/connect": {
            "post": {
                "summary": "Konek VPN",
                "description": "Pre-check server reachability (ping), start xl2tpd, connect L2TP.\nTimeout koneksi 30 detik.",
                "responses": {
                    "200": {"description": "VPN connected"},
                    "502": {"description": "Gagal konek (server unreachable / credentials salah)"}
                }
            }
        },
        "/api/admin/vpn/disconnect": {
            "post": {
                "summary": "Putus VPN",
                "description": "Disconnect L2TP + kill pppd.",
                "responses": {"200": {"description": "VPN disconnected"}}
            }
        },
        "/api/admin/vpn/restart": {
            "post": {
                "summary": "Restart VPN",
                "responses": {"200": {"description": "VPN restarted"}}
            }
        },
        "/api/admin/vpn/config": {
            "get": {
                "summary": "Konfigurasi VPN",
                "responses": {"200": {"description": "VPN config"}}
            },
            "post": {
                "summary": "Update konfigurasi VPN",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "server": {"type": "string", "example": "remote4.vpnmurahjogja.my.id"},
                                    "username": {"type": "string"},
                                    "password": {"type": "string"},
                                    "auto_start": {"type": "boolean"}
                                }
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Config updated"}}
            }
        },
        "/api/admin/vpn/log": {
            "get": {
                "summary": "Log VPN",
                "parameters": [{"name": "limit", "in": "query", "schema": {"type": "integer", "default": 100, "maximum": 500}}],
                "responses": {"200": {"description": "VPN event logs"}}
            }
        },
        "/api/admin/vpn/auto-reconnect": {
            "post": {
                "summary": "Auto-reconnect config",
                "requestBody": {
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "enabled": {"type": "boolean"},
                                    "interval_seconds": {"type": "integer", "minimum": 10}
                                }
                            }
                        }
                    }
                },
                "responses": {"200": {"description": "Configured"}}
            }
        },

        # === LOGS ===
        "/api/logs": {
            "get": {
                "summary": "Log task terakhir",
                "parameters": [{"name": "lines", "in": "query", "schema": {"type": "integer", "default": 50, "maximum": 500}}],
                "responses": {"200": {"description": "Log content"}}
            }
        },
        "/api/logs/stream": {
            "get": {
                "summary": "SSE Log Stream",
                "description": "Server-Sent Events untuk streaming log file real-time. Koneksi maksimal 1 jam.",
                "responses": {"200": {"description": "SSE stream"}}
            }
        },
        "/api/logs/clear": {
            "post": {
                "summary": "Bersihkan log file",
                "responses": {"200": {"description": "Cleared"}}
            }
        },
        "/api/system/logs": {
            "get": {
                "summary": "System logs (journalctl)",
                "parameters": [{"name": "lines", "in": "query", "schema": {"type": "integer", "default": 50, "maximum": 500}}],
                "responses": {"200": {"description": "System log entries"}}
            }
        }
    }
}
