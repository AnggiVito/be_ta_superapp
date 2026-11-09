#!/bin/sh
# Install npm deps when node_modules is missing/empty or package files changed.
# Needed for Docker setups that bind-mount the repo and use an anonymous volume
# for /app/node_modules. Without this, a git pull can update package.json while
# the Docker volume still holds old dependencies.

set -e

MODE="${1:-production}"
STAMP_FILE="node_modules/.dependency-stamp"

dependency_hash() {
  if [ -f package-lock.json ]; then
    sha256sum package-lock.json
  else
    sha256sum package.json
  fi | awk '{print $1}'
}

need_install=0
if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  need_install=1
elif [ ! -f "$STAMP_FILE" ]; then
  need_install=1
elif [ "$(dependency_hash)" != "$(cat "$STAMP_FILE")" ]; then
  need_install=1
fi

if [ "$need_install" -eq 0 ]; then
  exit 0
fi

echo "Installing/updating npm dependencies (mode: $MODE)..."

if [ "$MODE" = "development" ]; then
  npm install
else
  if [ -f package-lock.json ]; then
    npm ci --omit=dev || (echo "npm ci failed, falling back to npm install..." && npm install --omit=dev)
  else
    npm install --omit=dev
  fi
fi

dependency_hash > "$STAMP_FILE"
