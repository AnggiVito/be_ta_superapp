#!/bin/bash

# Script untuk restore folder uploads dari backup
# Usage: ./scripts/restore-uploads.sh <backup_file>
# Example: ./scripts/restore-uploads.sh backups/uploads/20240101_120000/uploads.tar.gz

set -e

# Konfigurasi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Backup file is required${NC}"
    echo "Usage: $0 <backup_file>"
    echo "Example: $0 backups/uploads/20240101_120000/uploads.tar.gz"
    exit 1
fi

BACKUP_FILE="$1"
UPLOADS_PATH="$PROJECT_ROOT/uploads"

# Validate backup file
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}=== Uploads Restore Script ===${NC}"
echo "Backup file: $BACKUP_FILE"
echo "Target directory: $UPLOADS_PATH"
echo ""

# Confirm before proceeding
echo -e "${RED}WARNING: This will restore uploads folder from backup!${NC}"
echo "This will overwrite existing files in: $UPLOADS_PATH"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Backup existing uploads (safety measure)
if [ -d "$UPLOADS_PATH" ] && [ "$(ls -A $UPLOADS_PATH)" ]; then
    SAFETY_BACKUP="$PROJECT_ROOT/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
    echo -e "${YELLOW}Creating safety backup of existing uploads...${NC}"
    tar -czf "$SAFETY_BACKUP" -C "$PROJECT_ROOT" uploads
    echo -e "${GREEN}✓ Safety backup created: $SAFETY_BACKUP${NC}"
fi

# Create uploads directory if it doesn't exist
mkdir -p "$UPLOADS_PATH"

# Extract backup
echo -e "${YELLOW}Extracting backup...${NC}"
if tar -xzf "$BACKUP_FILE" -C "$PROJECT_ROOT"; then
    echo -e "${GREEN}✓ Successfully restored uploads folder${NC}"
    
    # Show summary
    if [ -d "$UPLOADS_PATH" ]; then
        TOTAL_FILES=$(find "$UPLOADS_PATH" -type f 2>/dev/null | wc -l | tr -d ' ')
        TOTAL_SIZE=$(du -sh "$UPLOADS_PATH" 2>/dev/null | cut -f1)
        echo ""
        echo -e "${BLUE}=== Restore Summary ===${NC}"
        echo "Total files restored: $TOTAL_FILES"
        echo "Total size: $TOTAL_SIZE"
        echo -e "${GREEN}✓ Uploads restore completed successfully!${NC}"
    fi
else
    echo -e "${RED}✗ Failed to restore uploads folder${NC}"
    exit 1
fi

