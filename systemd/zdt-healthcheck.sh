#!/bin/bash
# ZDT Health Check — auto-restart zdt-api if health check fails
# Called by systemd timer: zdt-healthcheck.timer → zdt-healthcheck.service

PORT="${ZDT_API_PORT:-2000}"
API_URL="http://127.0.0.1:${PORT}/api/health"
LOG_TAG="zdt-healthcheck"

# Timeout for curl (seconds)
TIMEOUT=10

response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$API_URL" 2>/dev/null)

if [ "$response" = "200" ]; then
    logger -t "$LOG_TAG" "Health check OK (HTTP $response)"
    exit 0
fi

logger -t "$LOG_TAG" "Health check FAILED (HTTP $response) — restarting zdt-api..."
sudo systemctl restart zdt-api --no-block
logger -t "$LOG_TAG" "zdt-api restart initiated"
