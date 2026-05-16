#!/bin/bash
set -euo pipefail

# Resolve repo root relative to this script
WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$WORKDIR"

# Kill any existing node process running our server
pkill -f "node backend/server.js" 2>/dev/null || true
sleep 1

echo "=========================================="
echo "  Starting Workflow Shell"
echo "=========================================="
echo "Working directory: $WORKDIR"
echo ""

# Start the backend server in background (log to file), set WORKSPACE_DIR to repo root
export WORKSPACE_DIR="$WORKDIR"
nohup node backend/server.js > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server to start..."
for i in {1..10}; do
  if curl -s http://localhost:8080/api/cwd > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Server failed to start."
    cat /tmp/workflow-shell.log 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Start tunnel via pinggy.io (background to avoid full-screen UI)
echo ""
echo "Starting tunnel via pinggy.io..."
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
    -p 443 -R 80:localhost:8080 a.pinggy.io > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!
sleep 6

echo ""
echo "=========================================="
TUNNEL_URL=$(grep -o 'https\?://[^[:space:]]*\.run\.pinggy-free\.link' /tmp/tunnel.log 2>/dev/null | head -1)
echo "Tunnel URL: ${TUNNEL_URL:-http://localhost:8080}"
echo "=========================================="
echo ""
echo "Server logs (live):"
tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!
trap "kill $TAIL_PID $TUNNEL_PID 2>/dev/null; echo ''; echo '=== FULL SERVER LOG ==='; cat /tmp/workflow-shell.log 2>/dev/null" EXIT
wait "$TUNNEL_PID" || true