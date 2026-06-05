#!/bin/bash
# No set -e — we handle errors explicitly

INSTALLED_FLAG="/tmp/desktop-installed"

if [ -f "$INSTALLED_FLAG" ]; then
  echo "[STATUS] Desktop already installed. Skipping."
  echo "[DONE]"
  exit 0
fi

echo "[STATUS] Starting desktop installation..."

echo "[1/4] Updating package lists..."
sudo apt-get update -qq 2>&1 || echo "[WARN] apt-get update failed, continuing..."

echo "[2/4] Installing fluxbox and dependencies..."
sudo apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" fluxbox xvfb x11vnc 2>&1 || {
  echo "[ERROR] Package installation failed. Trying with --fix-broken..."
  sudo apt-get --fix-broken install -y 2>&1
  sudo apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" fluxbox xvfb x11vnc 2>&1 || {
    echo "[ERROR] Desktop installation failed."
    exit 1
  }
}

echo "[3/4] Setting up noVNC client..."
if [ ! -d "/opt/novnc" ]; then
  sudo git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc 2>&1 || {
    echo "[WARN] noVNC clone failed, will try later"
  }
fi

echo "[4/4] Finalizing..."
touch "$INSTALLED_FLAG"
sudo chmod 644 "$INSTALLED_FLAG"

echo "[STATUS] Installation complete!"
echo "[DONE]"
