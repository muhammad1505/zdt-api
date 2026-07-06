#!/usr/bin/env bash
# ZDT API Standalone Installer
# Installs zdt-api and its daemon services (telegram, scheduler) as systemd units.
# Run: sudo bash install.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
PYTHON_PATH="$(which python3 || echo '/usr/bin/python3')"

echo "========================================"
echo " ZDT API Standalone Installer"
echo "========================================"
echo "Source dir : $SCRIPT_DIR"
echo "User       : $USER_NAME"
echo "Python     : $PYTHON_PATH"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run with sudo."
    exit 1
fi

install_service() {
    local src="$1"
    local name="$(basename "$src")"
    echo "Installing $name ..."
    cp "$src" "/etc/systemd/system/$name"
    sed -i "s|__USER__|$USER_NAME|g" "/etc/systemd/system/$name"
    sed -i "s|__ZDT_API_DIR__|$SCRIPT_DIR|g" "/etc/systemd/system/$name"
    sed -i "s|__PYTHON__|$PYTHON_PATH|g" "/etc/systemd/system/$name"
}

# --- Install service files ---
for f in "$SCRIPT_DIR/systemd/"*.service; do
    install_service "$f"
done

# Install timer (if any)
for f in "$SCRIPT_DIR/systemd/"*.timer; do
    cp "$f" "/etc/systemd/system/$(basename "$f")"
done

systemctl daemon-reload

# --- Enable & start ---
echo ""
echo "Enabling and starting services..."

systemctl enable --now zdt-api.service

if [ -f "$SCRIPT_DIR/zdt-telegram.py" ]; then
    systemctl enable --now zdt-telegram.service
fi

if [ -f "$SCRIPT_DIR/zdt-scheduler.py" ]; then
    systemctl enable --now zdt-scheduler.timer
    systemctl enable --now zdt-scheduler.service
fi

echo ""
echo "========================================"
echo " ZDT API installed successfully!"
echo "========================================"
echo "Check status:"
echo "  systemctl status zdt-api.service"
echo "  systemctl status zdt-telegram.service"
echo ""
echo "Logs:"
echo "  journalctl -u zdt-api -n 50 --no-pager"
echo "========================================"
