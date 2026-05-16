#!/bin/bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WORKDIR"

case "${1:-}" in
  --kill|-k)
    echo "Killing all servers..."
    pkill -f "node backend/server.js" 2>/dev/null || true
    pkill -f "a.pinggy" 2>/dev/null || true
    pkill -f "pinggy" 2>/dev/null || true
    echo "Done."
    exit 0
    ;;
esac

echo "=========================================="
echo "  Workflow Shell - Local Dev"
echo "=========================================="

# Kill any existing server before starting
pkill -f "node backend/server.js" 2>/dev/null || true
pkill -f "a.pinggy" 2>/dev/null || true
sleep 1

# Start backend (log to file AND terminal)
nohup node backend/server.js > /tmp/workflow-shell.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

tail -f /tmp/workflow-shell.log 2>/dev/null &
TAIL_PID=$!

# Wait for server
echo "Waiting for server..."
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

echo ""
echo "  Local:       http://localhost:8080"
echo ""

# Start pinggy tunnel
echo "Starting tunnel via pinggy.io..."
echo "Server logs:"
echo ""
ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
    -p 443 -R 80:localhost:8080 a.pinggy.io
kill "$TAIL_PID" 2>/dev/null || true
