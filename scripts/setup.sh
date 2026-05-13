#!/bin/bash

echo "--- Installing Dependencies ---"
sudo apt-get update
sudo apt-get install -y ttyd tmux
sleep 1

echo "--- Installing FileBrowser ---"
curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash
sleep 1

echo "--- Setup is done! ---"
