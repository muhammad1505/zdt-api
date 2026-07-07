#!/bin/bash
# ZDT VPN Manager — L2TP/xl2tpd
ACTION="$1"
LAC_NAME="zdtvpn"
L2TP_CONTROL="/var/run/xl2tpd/l2tp-control"

case "$ACTION" in
  connect)
    if ip addr show ppp0 &>/dev/null; then
      echo '{"status":"connected","ip":"'"$(ip -4 addr show ppp0 | grep inet | awk '{print $2}')"'"}'
      exit 0
    fi
    systemctl is-active xl2tpd &>/dev/null || systemctl start xl2tpd
    sleep 1
    if [ -f "$L2TP_CONTROL" ]; then
      echo "d $LAC_NAME" > "$L2TP_CONTROL" 2>/dev/null
      sleep 1
    fi
    echo "c $LAC_NAME" > "$L2TP_CONTROL" 2>/dev/null
    echo '{"status":"connecting"}'
    ;;
  disconnect)
    if [ -f "$L2TP_CONTROL" ]; then
      echo "d $LAC_NAME" > "$L2TP_CONTROL" 2>/dev/null
    fi
    kill "$(cat /var/run/ppp0.pid 2>/dev/null)" 2>/dev/null || true
    echo '{"status":"disconnecting"}'
    ;;
  restart)
    "$0" disconnect
    sleep 2
    systemctl restart xl2tpd 2>/dev/null || true
    sleep 3
    echo "c $LAC_NAME" > "$L2TP_CONTROL" 2>/dev/null
    echo '{"status":"restarting"}'
    ;;
  status)
    if ip addr show ppp0 &>/dev/null; then
      echo '{"status":"connected","ip":"'"$(ip -4 addr show ppp0 | grep inet | awk '{print $2}')"'"}'
    else
      echo '{"status":"disconnected"}'
    fi
    ;;
  *)
    echo '{"error":"Usage: zdt-vpn.sh {connect|disconnect|restart|status}"}'
    exit 1
    ;;
esac
