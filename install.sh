#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# ZDT API Server — Full Installer
# ──────────────────────────────────────────────
# Usage:
#   curl -sL https://raw.githubusercontent.com/muhammad1505/zdt-api/main/install.sh | sudo bash
#   # or locally:
#   sudo bash install.sh
#
# Options:
#   ZDT_API_DIR   — path to zdt-api source (default: script's dir or ~/zdt-api)
#   ZDT_NO_VENV   — set to 1 to skip Python venv creation
#   ZDT_NO_BUILD  — set to 1 to skip frontend build
#   ZDT_NO_SYSTEMD— set to 1 to skip systemd installation

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ZDT_API_DIR="${ZDT_API_DIR:-$SCRIPT_DIR}"
REPO_URL="https://github.com/muhammad1505/zdt-api.git"

# Colors
BOLD='\033[1m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()  { echo; echo -e "${BOLD}━━━ $* ━━━${NC}"; }

# ─── Root check ────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    err "Please run with sudo."
    exit 1
fi

# Real user (the one who invoked sudo)
USER_NAME="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
USER_HOME="$(eval echo "~$USER_NAME")"

# ─── Detect package manager ────────────────────
detect_pkg_manager() {
    if command -v apt &>/dev/null; then
        PKG_MANAGER="apt"
        PKG_INSTALL="apt install -y"
        PKG_UPDATE="apt update -y"
        PYTHON_PKG="python3 python3-venv python3-pip"
        FFMPEG_PKG="ffmpeg"
        NODE_PKG="nodejs npm"
    elif command -v dnf &>/dev/null; then
        PKG_MANAGER="dnf"
        PKG_INSTALL="dnf install -y"
        PKG_UPDATE="dnf check-update || true"
        PYTHON_PKG="python3 python3-virtualenv python3-pip"
        FFMPEG_PKG="ffmpeg-free"
        NODE_PKG="nodejs npm"
    elif command -v yum &>/dev/null; then
        PKG_MANAGER="yum"
        PKG_INSTALL="yum install -y"
        PKG_UPDATE="yum check-update || true"
        PYTHON_PKG="python3 python3-virtualenv python3-pip"
        FFMPEG_PKG="ffmpeg"
        NODE_PKG="nodejs npm"
    elif command -v pacman &>/dev/null; then
        PKG_MANAGER="pacman"
        PKG_INSTALL="pacman -S --noconfirm"
        PKG_UPDATE="pacman -Sy"
        PYTHON_PKG="python python-virtualenv python-pip"
        FFMPEG_PKG="ffmpeg"
        NODE_PKG="nodejs npm"
    elif command -v apk &>/dev/null; then
        PKG_MANAGER="apk"
        PKG_INSTALL="apk add --no-cache"
        PKG_UPDATE="apk update"
        PYTHON_PKG="python3 py3-pip"
        FFMPEG_PKG="ffmpeg"
        NODE_PKG="nodejs npm"
    else
        warn "Could not detect package manager. Skipping system package installation."
        info "Please install manually: python3, python3-venv, python3-pip, ffmpeg, nodejs, npm"
        PKG_MANAGER=""
    fi
}

install_system_packages() {
    [ -z "$PKG_MANAGER" ] && return
    step "Installing system dependencies"
    $PKG_UPDATE
    # Split into separate calls in case some packages don't exist
    $PKG_INSTALL $PYTHON_PKG 2>/dev/null || true
    $PKG_INSTALL $FFMPEG_PKG 2>/dev/null || warn "ffmpeg installation failed (non-critical)"
    $PKG_INSTALL git curl 2>/dev/null || true
    # Node is optional — only needed for frontend build
    if [ -z "${ZDT_NO_BUILD:-}" ] && [ -d "$ZDT_API_DIR/admin-dashboard" ]; then
        $PKG_INSTALL $NODE_PKG 2>/dev/null || warn "Node.js installation failed (will skip frontend build)"
    fi
    ok "System packages installed"
}

# ─── Clone or update source ────────────────────
ensure_source() {
    if [ ! -d "$ZDT_API_DIR/.git" ]; then
        step "Cloning zdt-api repository"
        if [ "$ZDT_API_DIR" = "$SCRIPT_DIR" ] && [ ! -f "$ZDT_API_DIR/server.py" ]; then
            # Script is run from outside the repo — clone fresh
            ZDT_API_DIR="/opt/zdt-api"
            info "Cloning to $ZDT_API_DIR ..."
            git clone --depth=1 "$REPO_URL" "$ZDT_API_DIR"
            ok "Repository cloned"
        elif [ ! -f "$ZDT_API_DIR/server.py" ]; then
            err "Directory $ZDT_API_DIR does not contain zdt-api source."
            exit 1
        fi
    fi
}

# ─── Python virtual environment ─────────────────
setup_venv() {
    [ -n "${ZDT_NO_VENV:-}" ] && return
    step "Setting up Python virtual environment"
    local venv_dir="$ZDT_API_DIR/venv"
    if [ ! -d "$venv_dir" ]; then
        python3 -m venv "$venv_dir"
        ok "Virtual environment created at $venv_dir"
    else
        info "Virtual environment already exists"
    fi
    # Install requirements
    if [ -f "$ZDT_API_DIR/requirements.txt" ]; then
        "$venv_dir/bin/pip" install --upgrade pip setuptools wheel
        "$venv_dir/bin/pip" install -r "$ZDT_API_DIR/requirements.txt"
        ok "Python requirements installed"
    fi
    # Install additional packages needed by the daemons
    "$venv_dir/bin/pip" install pyTelegramBotAPI watchdog 2>/dev/null || true
    # Create symlink so python3 resolves to venv python when run from systemd
    if [ ! -f "$ZDT_API_DIR/.venv-python" ]; then
        ln -sf "$venv_dir/bin/python3" "$ZDT_API_DIR/.venv-python"
    fi
}

# ─── Build frontend ─────────────────────────────
build_frontend() {
    [ -n "${ZDT_NO_BUILD:-}" ] && return
    [ ! -d "$ZDT_API_DIR/admin-dashboard" ] && return
    if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
        warn "Node.js/npm not found — skipping frontend build"
        return
    fi
    step "Building admin dashboard frontend"
    cd "$ZDT_API_DIR/admin-dashboard"
    if [ ! -d node_modules ]; then
        npm ci --omit=optional 2>/dev/null || npm install
    fi
    npm run build 2>/dev/null || {
        warn "Frontend build failed (non-critical — API will still work)"
        return
    }
    ok "Frontend built successfully"
}

# ─── Generate config.env ────────────────────────
generate_config() {
    step "Generating configuration"
    local config_file="$ZDT_API_DIR/config.env"
    if [ -f "$config_file" ]; then
        info "config.env already exists — skipping generation"
        info "Edit $config_file to adjust settings"
        return
    fi
    local jwt_secret
    jwt_secret="$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32 2>/dev/null || echo "change_me_$(date +%s)")"
    local web_pass
    web_pass="$(python3 -c "import secrets; print(secrets.token_urlsafe(16))" 2>/dev/null || openssl rand -base64 16 2>/dev/null || echo "admin123")"

    cat > "$config_file" <<CONFEOF
# ZDT API Configuration
# Generated by install.sh on $(date)

# Storage
TARGET_DIR=$USER_HOME/Music/ZDT_Downloads

# Security
JWT_SECRET=$jwt_secret
ZDT_WEB_USER=admin
ZDT_WEB_PASS=$web_pass

# Telegram (optional — set token to enable)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_ENABLED=false

# VPN (optional)
VPN_SERVER=remote4.vpnmurahjogja.my.id
VPN_USERNAME=gemini
VPN_PASSWORD=
VPN_AUTOSTART=false

# Watch daemon
WATCH_AUTOSTART=true

# API Server
ZDT_API_PORT=2000
ZDT_API_HOST=0.0.0.0
ZDT_API_DEBUG=false
CONFEOF
    chmod 600 "$config_file"
    ok "config.env generated at $config_file"
    warn "Please edit $config_file to set TELEGRAM_BOT_TOKEN and other secrets"
    echo -e "  ${CYAN}Web dashboard login:${NC}  admin / $web_pass"
}

# ─── Database init ──────────────────────────────
init_database() {
    step "Initializing database"
    local python_cmd
    if [ -f "$ZDT_API_DIR/.venv-python" ]; then
        python_cmd="$ZDT_API_DIR/.venv-python"
    else
        python_cmd="python3"
    fi
    cd "$ZDT_API_DIR"
    # Run a quick Python one-liner to init the database
    $python_cmd -c "
import os, sys
sys.path.insert(0, '.')
from database import init_db
init_db()
print('Database initialized')
" 2>/dev/null && ok "Database initialized" || warn "Database init failed (will be auto-created on first run)"
}

# ─── Install systemd services ───────────────────
install_systemd() {
    [ -n "${ZDT_NO_SYSTEMD:-}" ] && return
    step "Installing systemd services"
    local svc_dir="$ZDT_API_DIR/systemd"
    if [ ! -d "$svc_dir" ]; then
        warn "No systemd/ directory found — skipping"
        return
    fi
    local python_path
    if [ -f "$ZDT_API_DIR/.venv-python" ]; then
        python_path="$ZDT_API_DIR/.venv-python"
    else
        python_path="$(which python3)"
    fi

    for f in "$svc_dir"/*.service "$svc_dir"/*.timer; do
        [ ! -f "$f" ] && continue
        local name
        name="$(basename "$f")"
        info "Installing $name ..."
        cp "$f" "/etc/systemd/system/$name"
        sed -i "s|__USER__|$USER_NAME|g" "/etc/systemd/system/$name"
        sed -i "s|__ZDT_API_DIR__|$ZDT_API_DIR|g" "/etc/systemd/system/$name"
        sed -i "s|__PYTHON__|$python_path|g" "/etc/systemd/system/$name"
    done

    systemctl daemon-reload

    # Enable and start core services
    info "Enabling and starting services..."
    systemctl enable --now zdt-api.service 2>/dev/null && ok "zdt-api.service started" || warn "zdt-api.service failed to start"
    if [ -f "$svc_dir/zdt-telegram.service" ] && [ -f "$ZDT_API_DIR/zdt-telegram.py" ]; then
        systemctl enable --now zdt-telegram.service 2>/dev/null && ok "zdt-telegram.service started" || warn "zdt-telegram.service failed (set TELEGRAM_BOT_TOKEN first)"
    fi
    if [ -f "$svc_dir/zdt-scheduler.service" ] && [ -f "$ZDT_API_DIR/zdt-scheduler.py" ]; then
        systemctl enable --now zdt-scheduler.timer 2>/dev/null || true
        systemctl enable --now zdt-scheduler.service 2>/dev/null || true
    fi
    if [ -f "$svc_dir/zdt-watch.service" ] && [ -f "$ZDT_API_DIR/zdt-watch.py" ]; then
        systemctl enable --now zdt-watch.service 2>/dev/null || true
    fi
}

# ─── Summary ────────────────────────────────────
print_summary() {
    echo
    echo -e "${BOLD}========================================${NC}"
    echo -e "${BOLD}   ZDT API v$(cat "$ZDT_API_DIR/VERSION" 2>/dev/null || echo '?')  Installed!${NC}"
    echo -e "${BOLD}========================================${NC}"
    echo
    echo -e "  ${CYAN}Install dir:${NC}  $ZDT_API_DIR"
    echo -e "  ${CYAN}Config:${NC}       $ZDT_API_DIR/config.env"
    echo -e "  ${CYAN}Python venv:${NC}  $ZDT_API_DIR/venv"
    echo
    echo -e "  ${BOLD}Services:${NC}"
    echo -e "    systemctl status zdt-api.service"
    echo -e "    systemctl status zdt-telegram.service"
    echo -e "    systemctl status zdt-watch.service"
    echo -e "    systemctl status zdt-scheduler.service"
    echo
    echo -e "  ${BOLD}Logs:${NC}"
    echo -e "    journalctl -u zdt-api -n 50 --no-pager"
    echo -e "    journalctl -u zdt-telegram -n 50 --no-pager"
    echo
    if [ -f "$ZDT_API_DIR/config.env" ]; then
        local web_pass
        web_pass="$(grep ^ZDT_WEB_PASS "$ZDT_API_DIR/config.env" 2>/dev/null | cut -d= -f2)"
        local web_user
        web_user="$(grep ^ZDT_WEB_USER "$ZDT_API_DIR/config.env" 2>/dev/null | cut -d= -f2)"
        echo -e "  ${BOLD}Web Dashboard:${NC}"
        echo -e "    http://localhost:2000/admin/"
        echo -e "    Login: ${web_user:-admin} / ${web_pass:-<see config.env>}"
    fi
    echo
    echo -e "  ${YELLOW}Next steps:${NC}"
    echo -e "    1. Edit $ZDT_API_DIR/config.env for your settings"
    echo -e "    2. Set TELEGRAM_BOT_TOKEN if you want Telegram bot"
    echo -e "    3. Restart services: sudo systemctl restart zdt-api"
    echo
}

# ─── Post-install AI keys prompt ────────────────
setup_ai_keys() {
    step "AI API Keys (optional)"
    echo "  ZDT API can use Google Gemini or OpenRouter for AI chat features."
    echo "  Without these, the bot will fall back to keyword-based commands."
    echo
    local gemini_file="$USER_HOME/.config/zdt/gemini_key"
    local openrouter_file="$USER_HOME/.config/zdt/openrouter_key"

    mkdir -p "$USER_HOME/.config/zdt"
    chown "$USER_NAME:$USER_NAME" "$USER_HOME/.config/zdt" 2>/dev/null || true

    if [ ! -f "$gemini_file" ]; then
        read -r -p "  Enter Gemini API key (or leave blank to skip): " gemini_key
        if [ -n "$gemini_key" ]; then
            echo "$gemini_key" > "$gemini_file"
            chmod 600 "$gemini_file"
            chown "$USER_NAME:$USER_NAME" "$gemini_file" 2>/dev/null || true
            ok "Gemini key saved"
        fi
    fi
    if [ ! -f "$openrouter_file" ]; then
        read -r -p "  Enter OpenRouter API key (or leave blank to skip): " openrouter_key
        if [ -n "$openrouter_key" ]; then
            echo "$openrouter_key" > "$openrouter_file"
            chmod 600 "$openrouter_file"
            chown "$USER_NAME:$USER_NAME" "$openrouter_file" 2>/dev/null || true
            ok "OpenRouter key saved"
        fi
    fi
}

# ════════════════════════════════════════════════
#  Main
# ════════════════════════════════════════════════
main() {
    echo
    echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     ZDT API Server Installer         ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
    echo

    detect_pkg_manager
    ensure_source
    install_system_packages
    setup_venv
    build_frontend
    generate_config
    init_database
    install_systemd
    setup_ai_keys
    print_summary
}

main "$@"
