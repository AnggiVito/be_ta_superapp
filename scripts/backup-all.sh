#!/bin/bash

# Script untuk backup semua komponen (database + uploads) sekaligus
# Usage: ./scripts/backup-all.sh [backup_directory]

set -e

# Konfigurasi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Full Backup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Backup Database
echo -e "${YELLOW}[1/2] Backing up databases...${NC}"
if "$SCRIPT_DIR/backup-db.sh" "$BACKUP_DIR/database"; then
    echo -e "${GREEN}✓ Database backup completed${NC}"
else
    echo -e "${RED}✗ Database backup failed${NC}"
    exit 1
fi

echo ""

# Backup Uploads
echo -e "${YELLOW}[2/2] Backing up uploads...${NC}"
if "$SCRIPT_DIR/backup-uploads.sh" "$BACKUP_DIR/uploads"; then
    echo -e "${GREEN}✓ Uploads backup completed${NC}"
else
    echo -e "${RED}✗ Uploads backup failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Full backup completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Backup locations:"
echo "  - Database: $BACKUP_DIR/database/"
echo "  - Uploads: $BACKUP_DIR/uploads/"

