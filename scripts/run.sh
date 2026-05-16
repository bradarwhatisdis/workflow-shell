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

# Start the backend server in background (log to file AND workflow output)
nohup node backend/server.js > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Tail server logs to workflow output in background
tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!

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

# Start tunnel via pinggy.io
echo ""
echo "Starting tunnel via pinggy.io..."
echo "Tunnel logs:"
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -p 443 -R 80:localhost:8080 a.pinggy.io &
TUNNEL_PID=$!

sleep 5

echo ""
echo "=========================================="
echo "  Workflow Shell is running!"
echo "=========================================="
echo "Server logs:"
echo ""
wait "$TUNNEL_PID"
kill "$TAIL_PID" 2>/dev/null || true