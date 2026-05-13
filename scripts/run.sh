#!/bin/bash

echo "Starting ttyd on port 8080..."
ttyd -p 8080 bash &
sleep 1

echo "Starting FileManager on port 8081 without authentication..."
filebrowser -p 8081 -r /home/runner/work/ --noauth &
sleep 5 #waiting for services to properly start

echo "---------------------------------------------------"
echo "CLICK THIS LINK BELOW TO ACCESS YOUR WEB :"
ssh -o StrictHostKeyChecking=no -p 443 -R 80:localhost:8080 a.pinggy.io
