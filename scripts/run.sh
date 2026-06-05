#!/bin/bash
set -euo pipefail

# Resolve repo root relative to this script
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USERNAME="workflow-shell"
USER_HOME="/home/$USERNAME"
WORKSPACE_DIR="$USER_HOME/work"

cd "$WORKDIR"

echo "=========================================="
echo "  Starting Workflow Shell"
echo "=========================================="
echo "Working directory: $WORKDIR"
echo ""

# ─── Create workflow-shell user if missing ──────────────────────
if ! id -u "$USERNAME" &>/dev/null; then
  echo "[1/3] Creating system user '$USERNAME'..."
  # Dioptimalkan: Mengunci ke /bin/bash dan quoting aman
  sudo useradd -m -s /bin/bash "$USERNAME"
  sudo usermod -aG sudo "$USERNAME"
  echo "workflow-shell ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/workflow-shell
else
  echo "[1/3] System user '$USERNAME' already exists."
fi

# ─── Set up workspace owned by workflow-shell ───────────────────
echo "[2/3] Setting up workspace..."
sudo mkdir -p "$WORKSPACE_DIR"
sudo chown -R "$USERNAME:$USERNAME" "$WORKSPACE_DIR"

# Let workflow-shell access the repo by adding it to the runner's group
RUNNER_GROUP=$(id -gn 2>/dev/null || echo "root")
sudo usermod -aG "$RUNNER_GROUP" "$USERNAME" 2>/dev/null || true
sudo chmod +x /home/runner 2>/dev/null || true
sudo chmod +x /home/runner/work 2>/dev/null || true
for dir in /home/runner/work/*/; do
  sudo chmod +x "$dir" 2>/dev/null || true
done
sudo chmod -R g+rx "$WORKDIR" 2>/dev/null || true
sudo chmod -R g+rw "$WORKDIR/.git" 2>/dev/null || true
echo "  Workspace: $WORKSPACE_DIR"
echo ""

# Kill any existing node process running our server
pkill -f "node backend/server.js" 2>/dev/null || true
sleep 1

# Start the backend server as workflow-shell user
echo "[3/3] Starting server as '$USERNAME'..."
sudo -u "$USERNAME" env WORKSPACE_DIR="$WORKSPACE_DIR" HOME="$USER_HOME" \
  nohup node "$WORKDIR/backend/server.js" > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..12}; do
  if curl -s http://localhost:8080/api/cwd > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [ "$i" -eq 12 ]; then
    echo "Server failed to start."
    cat /tmp/workflow-shell.log 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Start tunnel via cloudflared
echo ""
echo "Starting tunnel via Cloudflare..."
for i in 1 2 3; do
  [ "$i" -gt 1 ] && echo "Retrying tunnel ($i/3)..."
  cloudflared tunnel --url http://localhost:8080 > /tmp/tunnel.log 2>&1 &
  TUNNEL_PID=$!
  sleep 8

  TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then break; fi
  kill "$TUNNEL_PID" 2>/dev/null || true
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo ""
  echo "ERROR: Tunnel URL not found after 3 attempts. cloudflared log:"
  cat /tmp/tunnel.log 2>/dev/null
  exit 1
fi

echo ""
echo "=========================================="
echo "Tunnel URL: $TUNNEL_URL"
echo "=========================================="

# POST the tunnel URL to the server so it can be displayed in the UI
curl -s -X POST http://localhost:8080/api/tunnel-url \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TUNNEL_URL\"}" > /dev/null || true

echo ""
echo "Server logs (live):"
tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!

# Monitor and restart loop
RESTART_FLAG="/tmp/workflow-restart-flag"
sudo rm -f "$RESTART_FLAG" 2>/dev/null || true

cleanup() {
  kill "${TAIL_PID:-}" "${TUNNEL_PID:-}" "${SERVER_PID:-}" 2>/dev/null || true
  echo ''
  echo '=== FULL SERVER LOG ==='
  cat /tmp/workflow-shell.log 2>/dev/null || true
}
trap cleanup EXIT

while true; do
  # Peningkatan: Loop sekarang memantau KEDUA proses (Server DAN Tunnel)
  while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$TUNNEL_PID" 2>/dev/null; do
    sleep 1
  done

  # Jika tunnel yang mati duluan, kita matikan server sekalian agar memicu restart total
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Cloudflare tunnel dropped. Triggering full restart..."
    kill "$SERVER_PID" 2>/dev/null || true
  fi

  if [ ! -f "$RESTART_FLAG" ] && [ ! -f "/tmp/tunnel.log" ]; then
    echo "Critical process exited. Shutting down..."
    break
  fi

  sudo rm -f "$RESTART_FLAG" 2>/dev/null || true
  echo "Update requested — pulling latest code..."
  git pull 2>&1 || echo "Warning: git pull failed"
  echo "Restarting server..."

  sudo -u "$USERNAME" env WORKSPACE_DIR="$WORKSPACE_DIR" HOME="$USER_HOME" \
    nohup node "$WORKDIR/backend/server.js" >> /tmp/workflow-shell.log 2>&1 &
  SERVER_PID=$!
  echo "Server PID: $SERVER_PID"
  echo "--- restart at $(date) ---" >> /tmp/workflow-shell.log

  # Menghidupkan kembali tunnel jika sempat mati
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Restarting Cloudflare tunnel..."
    cloudflared tunnel --url http://localhost:8080 > /tmp/tunnel.log 2>&1 &
    TUNNEL_PID=$!
  fi

  for i in {1..15}; do
    if curl -s http://localhost:8080/api/cwd > /dev/null 2>&1; then
      echo ""
      echo "=========================================="
      echo "Server restarted. Tunnel URL: $TUNNEL_URL"
      echo "=========================================="
      break
    fi
    if [ "$i" -eq 15 ]; then
      echo "Server failed to restart."
      cat /tmp/workflow-shell.log | tail -5
      break
    fi
    sleep 1
  done
done
