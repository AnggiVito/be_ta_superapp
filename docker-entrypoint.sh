#!/bin/sh
set -e

# DB migrations run when the app starts (app.js), not during docker build.
# SQL legacy + migration JS (node-pg-migrate) untuk modul yang pending dijalankan lewat
# unified runner — tidak perlu `npm run migrate:pg:registration up` manual kecuali deploy/CI khusus.

# Sync node_modules when missing/empty or package-lock.json changed (bind mount + anonymous volume)
if [ -f scripts/docker-install-if-needed.sh ]; then
  sh scripts/docker-install-if-needed.sh production
else
  if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "node_modules is empty or missing, installing dependencies..."
    npm install --omit=dev
  fi
fi

# Start the application
exec npm start

