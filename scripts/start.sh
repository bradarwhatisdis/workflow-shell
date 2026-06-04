#!/bin/bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USERNAME="workflow-shell"
HOME_DIR="/home/$USERNAME"
WORKSPACE_DIR="$HOME_DIR/work"
LOG_FILE="/tmp/workflow-shell.log"
TUNNEL_LOG="/tmp/tunnel.log"

cd "$WORKDIR"

echo "=========================================="
echo "  Workflow Shell — Startup"
echo "=========================================="
echo "Repository: $WORKDIR"
echo ""

# ─── Create workflow-shell user if missing ──────────────────────
if ! id -u "$USERNAME" &>/dev/null; then
  echo "[1/4] Creating system user '$USERNAME'..."
  sudo useradd -m -s /bin/bash "$USERNAME"
  sudo usermod -aG sudo "$USERNAME"
  echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/"$USERNAME" >/dev/null
  echo "  User created: $USERNAME (home: $HOME_DIR, sudo: NOPASSWD)"
else
  echo "[1/4] System user '$USERNAME' already exists."
fi

# ─── Ensure workspace directory exists with correct ownership ───
echo "[2/4] Setting up workspace..."
sudo mkdir -p "$WORKSPACE_DIR"
sudo chown -R "$USERNAME:$USERNAME" "$WORKSPACE_DIR"
sudo chown -R "$USERNAME:$USERNAME" "$WORKDIR"
echo "  Workspace: $WORKSPACE_DIR"
echo "  Repository owner: $USERNAME"

# ─── Kill any existing server ───────────────────────────────────
pkill -f "node backend/server.js" 2>/dev/null || true
sleep 1

# ─── Start backend as workflow-shell user ───────────────────────
echo "[3/4] Starting server as '$USERNAME'..."
export WORKSPACE_DIR
sudo -u "$USERNAME" env WORKSPACE_DIR="$WORKSPACE_DIR" HOME="$HOME_DIR" \
  nohup node "$WORKDIR/backend/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "  Server PID: $SERVER_PID"

# Wait for server to be ready
for i in {1..12}; do
  if curl -s http://localhost:8080/api/cwd > /dev/null 2>&1; then
    echo "  Server is ready!"
    break
  fi
  if [ "$i" -eq 12 ]; then
    echo "  ERROR: Server failed to start."
    cat "$LOG_FILE" 2>/dev/null
    exit 1
  fi
  sleep 1
done

# ─── Start Cloudflare tunnel ────────────────────────────────────
echo "[4/4] Starting Cloudflare tunnel..."
TUNNEL_URL=""
TUNNEL_PID=""
if command -v cloudflared &>/dev/null; then
  cloudflared tunnel --url http://localhost:8080 > "$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  sleep 6
  TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    echo "  Tunnel URL: $TUNNEL_URL"
  else
    echo "  Tunnel still connecting... check $TUNNEL_LOG"
  fi
else
  echo "  cloudflared not found — install with: sudo apt install cloudflared"
fi

echo ""
echo "=========================================="
echo "  Workflow Shell is running!"
echo "  Local:       http://localhost:8080"
echo "  Tunnel:      ${TUNNEL_URL:-Not available}"
echo "  Logs:        $LOG_FILE"
echo "  User:        $USERNAME"
echo "=========================================="
echo ""

# Show live logs
tail -f "$LOG_FILE" &
TAIL_PID=$!

cleanup() {
  echo ""
  echo "Shutting down..."
  kill "${TAIL_PID:-}" "${TUNNEL_PID:-}" 2>/dev/null || true
  pkill -f "node backend/server.js" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT

if [ -n "$TUNNEL_PID" ]; then
  wait "$TUNNEL_PID" 2>/dev/null || true
else
  wait "$SERVER_PID" 2>/dev/null || true
fi
