OPENAPI_SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "ZDT API Server",
        "version": "1.0.0",
        "description": "API untuk mengelola download media, file, pengaturan, dan monitoring server ZDT.",
        "contact": {"name": "ZDT Project"}
    },
    "servers": [{"url": "/", "description": "Local server"}],
    "components": {
        "securitySchemes": {
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "X-API-Key",
                "description": "Smart API Key (Base64 encoded) atau key_id|secret"
            },
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "JWT Bearer token untuk admin dashboard"
            },
            "BasicAuth": {
                "type": "http",
                "scheme": "basic",
                "description": "Basic Auth (username:password) untuk kompatibilitas zdt-web"
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
                    "priority": {"type": "integer"},
                    "url": {"type": "string"},
                    "progress": {"type": "integer"},
                    "progress_message": {"type": "string"},
                    "file_path": {"type": "string"},
                    "error_message": {"type": "string"},
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
        "/api/auth/login": {
            "post": {
                "summary": "Login",
                "description": "Login dengan username & password, mengembalikan JWT Bearer token.",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "username": {"type": "string"},
                                    "password": {"type": "string"}
                                },
                                "required": ["username", "password"]
                            }
                        }
                    }
                },
                "responses": {
                    "200": {"description": "Login berhasil, mengembalikan token"},
                    "401": {"description": "Invalid credentials"}
                }
            }
        },
        "/api/verify-key": {
            "post": {
                "summary": "Verifikasi API Key",
                "description": "Cek apakah API key valid dan mengembalikan informasi key.",
                "security": [],
                "responses": {
                    "200": {"description": "Key valid"},
                    "401": {"description": "Key invalid"}
                }
            }
        },
        "/api/health": {
            "get": {
                "summary": "Health Check",
                "description": "Cek status server.",
                "security": [],
                "responses": {
                    "200": {"description": "Server sehat"}
                }
            }
        },
        "/api/tasks": {
            "post": {
                "summary": "Buat task baru",
                "description": "Membuat task download/processing baru di antrian.",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "type": {"type": "string", "enum": ["download_audio", "download_video", "demucs", "sync_lirik", "kompres"]},
                                    "url": {"type": "string", "description": "URL untuk download"},
                                    "params": {"type": "object", "description": "Parameter tambahan (format, quality, bitrate, filepath)"},
                                    "priority": {"type": "integer", "default": 1}
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
                "description": "Mengambil daftar task dengan filter status dan paginasi.",
                "parameters": [
                    {"name": "status", "in": "query", "schema": {"type": "string"}},
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}}
                ],
                "responses": {
                    "200": {"description": "Daftar task + stats"}
                }
            }
        },
        "/api/tasks/queue/stats": {
            "get": {
                "summary": "Statistik antrian",
                "responses": {
                    "200": {"description": "Queue stats", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/QueueStats"}}}}
                }
            }
        },
        "/api/tasks/{id}": {
            "get": {
                "summary": "Detail task",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Task detail"},
                    "404": {"description": "Task not found"}
                }
            },
            "delete": {
                "summary": "Hapus task dari history",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Task deleted"}
                }
            }
        },
        "/api/tasks/{id}/cancel": {
            "post": {
                "summary": "Batalkan task",
                "description": "Membatalkan task yang sedang queued atau running (kill process).",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {
                    "200": {"description": "Task cancelled"}
                }
            }
        },
        "/api/download": {
            "post": {
                "summary": "Queue download",
                "description": "Menambahkan URL ke antrian download (legacy).",
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
                "responses": {
                    "200": {"description": "Download queued"}
                }
            }
        },
        "/api/downloads": {
            "get": {
                "summary": "History download",
                "parameters": [
                    {"name": "page", "in": "query", "schema": {"type": "integer", "default": 1}},
                    {"name": "per_page", "in": "query", "schema": {"type": "integer", "default": 20}},
                    {"name": "status", "in": "query", "schema": {"type": "string"}}
                ],
                "responses": {"200": {"description": "List downloads"}}
            }
        },
        "/api/downloads/{id}": {
            "get": {
                "summary": "Detail download",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Download detail"}}
            },
            "delete": {
                "summary": "Hapus record download",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Deleted"}}
            }
        },
        "/api/downloads/{id}/retry": {
            "post": {
                "summary": "Ulangi download yang gagal",
                "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "integer"}}],
                "responses": {"200": {"description": "Retry queued"}}
            }
        },
        "/api/download-selected": {
            "post": {
                "summary": "Download multiple URL",
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
        "/api/playlist/items": {
            "post": {
                "summary": "Ambil item playlist",
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
        "/api/files/list": {
            "get": {
                "summary": "Daftar file media",
                "parameters": [
                    {"name": "dir", "in": "query", "schema": {"type": "string"}},
                    {"name": "type", "in": "query", "schema": {"type": "string"}}
                ],
                "responses": {"200": {"description": "File list"}}
            }
        },
        "/api/files/info/{filename}": {
            "get": {
                "summary": "Info file",
                "parameters": [{"name": "filename", "in": "path", "required": True, "schema": {"type": "string"}}],
                "responses": {"200": {"description": "File info"}}
            }
        },
        "/api/settings": {
            "get": {
                "summary": "Ambil semua setting",
                "responses": {"200": {"description": "Settings list"}}
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
        "/api/admin/dashboard": {
            "get": {
                "summary": "Dashboard metrics",
                "description": "CPU, Memory, Disk, Service status, System info.",
                "responses": {"200": {"description": "Dashboard data"}}
            }
        },
        "/api/admin/dependencies": {
            "get": {
                "summary": "Cek dependencies",
                "responses": {"200": {"description": "Dependency status"}}
            }
        },
        "/api/admin/activity": {
            "get": {
                "summary": "Activity logs",
                "parameters": [
                    {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}}
                ],
                "responses": {"200": {"description": "Activity list"}}
            }
        },
        "/api/logs/stream": {
            "get": {
                "summary": "SSE Log Stream",
                "description": "Server-Sent Events stream untuk log real-time. Koneksi bertahan maksimal 1 jam.",
                "responses": {"200": {"description": "SSE stream"}}
            }
        },
        "/api/vpn/status": {
            "get": {
                "summary": "Status VPN",
                "responses": {"200": {"description": "VPN status"}}
            }
        },
        "/api/vpn/connect": {
            "post": {
                "summary": "Konek VPN",
                "responses": {"200": {"description": "Connecting..."}}
            }
        },
        "/api/vpn/disconnect": {
            "post": {
                "summary": "Putus VPN",
                "responses": {"200": {"description": "Disconnected"}}
            }
        }
    }
}
