#!/bin/bash
# Script wrapper untuk menjalankan docker-compose dengan .env.dev
# Ini memastikan Docker Compose menggunakan .env.dev untuk variable substitution

set -e

# Check if .env.dev exists
if [ ! -f ".env.dev" ]; then
  echo "Error: .env.dev file not found!"
  echo "Please create .env.dev file based on env.example"
  exit 1
fi

# Run docker-compose with --env-file .env.dev
# Ini memastikan Docker Compose menggunakan .env.dev untuk substitusi variabel
# bukan .env (production)
docker-compose --env-file .env.dev -f docker-compose.dev.yml "$@"

