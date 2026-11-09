#!/bin/bash

# Script untuk sync .env file dan restart container
# Usage: ./scripts/sync-env.sh

echo "=== Sync .env dan Restart Container ==="
echo ""

# Cek apakah .env file ada
if [ ! -f .env ]; then
    echo "❌ File .env tidak ditemukan!"
    exit 1
fi

echo "📋 .env file ditemukan"
echo ""

# Tampilkan FIRST_KAUR_LAB_USER_ID dari host
echo "=== .env di HOST ==="
HOST_USER_ID=$(grep FIRST_KAUR_LAB_USER_ID .env | cut -d'=' -f2)
echo "FIRST_KAUR_LAB_USER_ID=$HOST_USER_ID"
echo ""

# Cek apakah container running
if ! docker ps | grep -q fri-backend; then
    echo "⚠️  Container fri-backend tidak running"
    echo "🚀 Starting container..."
    docker-compose up -d backend
    sleep 5
else
    echo "🔄 Recreating container untuk load .env terbaru..."
    docker-compose down backend
    docker-compose up -d backend
    sleep 5
fi

# Verifikasi environment variable di container
echo ""
echo "=== Verifikasi di CONTAINER ==="
CONTAINER_USER_ID=$(docker exec fri-backend sh -c 'echo $FIRST_KAUR_LAB_USER_ID' 2>/dev/null)
echo "FIRST_KAUR_LAB_USER_ID=$CONTAINER_USER_ID"
echo ""

# Bandingkan
if [ "$HOST_USER_ID" = "$CONTAINER_USER_ID" ]; then
    echo "✅ .env sudah sync! User ID sama di host dan container."
else
    echo "⚠️  .env belum sync!"
    echo "   Host: $HOST_USER_ID"
    echo "   Container: $CONTAINER_USER_ID"
    echo ""
    echo "💡 Coba recreate container lagi:"
    echo "   docker-compose down backend && docker-compose up -d backend"
fi

echo ""
echo "📊 Status container:"
docker-compose ps backend

