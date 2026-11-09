#!/bin/bash

# Script untuk backup folder uploads dari Docker container
# Usage: ./scripts/backup-uploads.sh [backup_directory]

set -e

# Konfigurasi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups/uploads}"
DATE=$(date +%Y%m%d_%H%M%S)
TIMESTAMP_DIR="$BACKUP_DIR/$DATE"

# Container name
BACKEND_CONTAINER="fri-backend"

# Uploads path (relative to project root)
UPLOADS_PATH="uploads"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Uploads Backup Script ===${NC}"
echo "Backup directory: $TIMESTAMP_DIR"
echo ""

# Create backup directory
mkdir -p "$TIMESTAMP_DIR"

# Check if uploads directory exists
UPLOADS_FULL_PATH="$PROJECT_ROOT/$UPLOADS_PATH"
if [ ! -d "$UPLOADS_FULL_PATH" ]; then
    echo -e "${YELLOW}Warning: Uploads directory not found at $UPLOADS_FULL_PATH${NC}"
    echo "Creating empty directory..."
    mkdir -p "$UPLOADS_FULL_PATH"
fi

# Check if container is running (optional, for validation)
if docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
    echo -e "${GREEN}Backend container is running${NC}"
else
    echo -e "${YELLOW}Warning: Backend container is not running, but continuing with backup from host filesystem${NC}"
fi

# Perform backup using tar
echo -e "${YELLOW}Backing up uploads folder...${NC}"

if tar -czf "$TIMESTAMP_DIR/uploads.tar.gz" -C "$PROJECT_ROOT" "$UPLOADS_PATH" 2>/dev/null; then
    # Get file size
    FILE_SIZE=$(du -h "$TIMESTAMP_DIR/uploads.tar.gz" | cut -f1)
    echo -e "${GREEN}✓ Successfully backed up uploads folder${NC}"
    echo "  File size: $FILE_SIZE"
    echo "  Location: $TIMESTAMP_DIR/uploads.tar.gz"
else
    echo -e "${RED}✗ Failed to backup uploads folder${NC}"
    exit 1
fi

# Create metadata file
cat > "$TIMESTAMP_DIR/backup_info.txt" <<EOF
Backup Date: $(date)
Backup Directory: $TIMESTAMP_DIR

Source Path: $UPLOADS_FULL_PATH
Backup File: uploads.tar.gz
Backup Format: tar.gz (gzip compressed)

Container Name: $BACKEND_CONTAINER
Restore Command: See restore-uploads.sh script or documentation
EOF

# List contents if uploads folder is not empty
if [ "$(ls -A $UPLOADS_FULL_PATH)" ]; then
    echo ""
    echo -e "${YELLOW}Contents backed up:${NC}"
    find "$UPLOADS_FULL_PATH" -type f | head -20 | while read file; do
        echo "  - $(basename "$file")"
    done
    TOTAL_FILES=$(find "$UPLOADS_FULL_PATH" -type f | wc -l | tr -d ' ')
    if [ "$TOTAL_FILES" -gt 20 ]; then
        echo "  ... and $((TOTAL_FILES - 20)) more files"
    fi
fi

echo ""
echo -e "${GREEN}=== Backup Summary ===${NC}"
echo "Backup location: $TIMESTAMP_DIR/uploads.tar.gz"
echo -e "${GREEN}✓ Uploads backup completed successfully!${NC}"

