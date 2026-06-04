#!/bin/bash
set -e

INSTALLED_FLAG="/tmp/desktop-installed"

if [ -f "$INSTALLED_FLAG" ]; then
  echo "[STATUS] Ubuntu Desktop already installed. Skipping."
  echo "[DONE]"
  exit 0
fi

echo "[STATUS] Starting Ubuntu Desktop installation..."

echo "[1/4] Updating package lists..."
sudo apt-get update -qq 2>&1

echo "[2/4] Installing Ubuntu Desktop and dependencies..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ubuntu-desktop xvfb x11vnc dbus-x11 2>&1

echo "[3/4] Setting up noVNC client..."
if [ ! -d "/opt/novnc" ]; then
  sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc 2>&1
fi

echo "[4/4] Finalizing..."
touch "$INSTALLED_FLAG"

echo "[STATUS] Installation complete!"
echo "[DONE]"
