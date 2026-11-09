#!/bin/bash

# Script untuk backup database PostgreSQL dari Docker containers
# Usage: ./scripts/backup-db.sh [backup_directory]

set -e

# Konfigurasi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$PROJECT_ROOT/backups/database}"
DATE=$(date +%Y%m%d_%H%M%S)
TIMESTAMP_DIR="$BACKUP_DIR/$DATE"

# Container names
REGISTRATION_DB_CONTAINER="fri-registration-db"
CONDUCT_DB_CONTAINER="fri-conduct-db"
USER_MANAGEMENT_DB_CONTAINER="fri-user-management-db"

# Database names (default, bisa di-override via env)
REGISTRATION_DB_NAME="${REGISTRATION_DB_NAME:-registration_db}"
CONDUCT_DB_NAME="${CONDUCT_DB_NAME:-conduct_db}"
USER_MANAGEMENT_DB_NAME="${USER_MANAGEMENT_DB_NAME:-user_management_db}"

# Database users (default, bisa di-override via env)
REGISTRATION_DB_USER="${REGISTRATION_DB_USER:-postgres}"
CONDUCT_DB_USER="${CONDUCT_DB_USER:-postgres}"
USER_MANAGEMENT_DB_USER="${USER_MANAGEMENT_DB_USER:-postgres}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Database Backup Script ===${NC}"
echo "Backup directory: $TIMESTAMP_DIR"
echo ""

# Create backup directory
mkdir -p "$TIMESTAMP_DIR"

# Function to backup database
backup_database() {
    local container_name=$1
    local db_name=$2
    local db_user=$3
    local output_file=$4
    
    echo -e "${YELLOW}Backing up $db_name from $container_name...${NC}"
    
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo -e "${RED}Error: Container $container_name is not running!${NC}"
        return 1
    fi
    
    # Perform backup
    if docker exec "$container_name" pg_dump -U "$db_user" -F c -f "/tmp/${db_name}_backup.dump" "$db_name" 2>/dev/null; then
        # Copy backup file from container to host
        docker cp "${container_name}:/tmp/${db_name}_backup.dump" "$output_file"
        # Clean up temporary file in container
        docker exec "$container_name" rm -f "/tmp/${db_name}_backup.dump"
        echo -e "${GREEN}✓ Successfully backed up $db_name${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to backup $db_name${NC}"
        return 1
    fi
}

# Backup all databases
SUCCESS_COUNT=0
FAIL_COUNT=0

# Backup Registration DB
if backup_database "$REGISTRATION_DB_CONTAINER" "$REGISTRATION_DB_NAME" "$REGISTRATION_DB_USER" "$TIMESTAMP_DIR/registration_db.dump"; then
    ((SUCCESS_COUNT++))
else
    ((FAIL_COUNT++))
fi

# Backup Conduct DB (modul conduct; file conduct_db.dump)
if backup_database "$CONDUCT_DB_CONTAINER" "$CONDUCT_DB_NAME" "$CONDUCT_DB_USER" "$TIMESTAMP_DIR/conduct_db.dump"; then
    ((SUCCESS_COUNT++))
else
    ((FAIL_COUNT++))
fi

# Backup User Management DB
if backup_database "$USER_MANAGEMENT_DB_CONTAINER" "$USER_MANAGEMENT_DB_NAME" "$USER_MANAGEMENT_DB_USER" "$TIMESTAMP_DIR/user_management_db.dump"; then
    ((SUCCESS_COUNT++))
else
    ((FAIL_COUNT++))
fi

# Create metadata file
cat > "$TIMESTAMP_DIR/backup_info.txt" <<EOF
Backup Date: $(date)
Backup Directory: $TIMESTAMP_DIR

Databases Backed Up:
- Registration DB: $REGISTRATION_DB_NAME
- Conduct DB: $CONDUCT_DB_NAME
- User Management DB: $USER_MANAGEMENT_DB_NAME

Container Names:
- Registration: $REGISTRATION_DB_CONTAINER
- Conduct: $CONDUCT_DB_CONTAINER
- User Management: $USER_MANAGEMENT_DB_CONTAINER

Backup Format: PostgreSQL Custom Format (.dump)
Restore Command: See restore-db.sh script or documentation
EOF

# Summary
echo ""
echo -e "${GREEN}=== Backup Summary ===${NC}"
echo "Backup location: $TIMESTAMP_DIR"
echo "Successful backups: $SUCCESS_COUNT"
echo "Failed backups: $FAIL_COUNT"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All backups completed successfully!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some backups failed. Please check the errors above.${NC}"
    exit 1
fi

