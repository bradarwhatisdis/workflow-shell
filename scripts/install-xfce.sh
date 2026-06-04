#!/bin/bash
set -e

INSTALLED_FLAG="/tmp/xfce-installed"

if [ -f "$INSTALLED_FLAG" ]; then
  echo "[STATUS] XFCE4 already installed. Skipping."
  echo "[DONE]"
  exit 0
fi

echo "[STATUS] Starting XFCE4 desktop installation..."

echo "[1/4] Updating package lists..."
sudo apt-get update -qq 2>&1

echo "[2/4] Installing XFCE4 and dependencies..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y xfce4 xfce4-terminal xvfb x11vnc 2>&1

echo "[3/4] Setting up noVNC client..."
if [ ! -d "/opt/novnc" ]; then
  sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc 2>&1
fi

echo "[4/4] Finalizing..."
touch "$INSTALLED_FLAG"

echo "[STATUS] Installation complete!"
echo "[DONE]"
