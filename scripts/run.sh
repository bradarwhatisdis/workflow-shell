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
  sudo useradd -m -s /bin/bash "$USERNAME"
  sudo usermod -aG sudo "$USERNAME"
  echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/"$USERNAME" >/dev/null
  echo "  User created: $USERNAME (home: $USER_HOME, sudo: NOPASSWD)"
else
  echo "[1/3] System user '$USERNAME' already exists."
fi

# ─── Set up workspace owned by workflow-shell ───────────────────
echo "[2/3] Setting up workspace..."
sudo mkdir -p "$WORKSPACE_DIR"
sudo chown -R "$USERNAME:$USERNAME" "$WORKSPACE_DIR"

# Let workflow-shell access the repo by adding it to the runner's group
# and making parent directories traversable (GitHub Actions puts repo
# under /home/runner/ which is 700 by default)
RUNNER_GROUP=$(id -gn 2>/dev/null || echo "root")
sudo usermod -aG "$RUNNER_GROUP" "$USERNAME" 2>/dev/null || true
sudo chmod +x /home/runner 2>/dev/null || true
sudo chmod +x /home/runner/work 2>/dev/null || true
for dir in /home/runner/work/*/; do
  sudo chmod +x "$dir" 2>/dev/null || true
done
sudo chmod -R g+rx "$WORKDIR" 2>/dev/null || true
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
cloudflared tunnel --url http://localhost:8080 > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!
sleep 5

TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.trycloudflare\.com' /tmp/tunnel.log 2>/dev/null | head -1 || true)
if [ -z "$TUNNEL_URL" ]; then
  echo ""
  echo "ERROR: Tunnel URL not found. cloudflared log:"
  cat /tmp/tunnel.log 2>/dev/null
  exit 1
fi

echo ""
echo "=========================================="
echo "Tunnel URL: $TUNNEL_URL"
echo "=========================================="
echo ""
echo "Server logs (live):"
tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!

# Monitor the server PID — when it dies (shutdown), kill the tunnel and exit
# This avoids hanging if the tunnel can't be killed by the server's own user.
cleanup() {
  kill ${TAIL_PID:-} ${TUNNEL_PID:-} ${SERVER_PID:-} 2>/dev/null || true
  echo ''
  echo '=== FULL SERVER LOG ==='
  cat /tmp/workflow-shell.log 2>/dev/null || true
}
trap cleanup EXIT

while kill -0 "$SERVER_PID" 2>/dev/null; do
  sleep 1
done
echo "Server process exited. Shutting down..."