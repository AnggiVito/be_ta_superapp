#!/bin/bash

# Script untuk restore database PostgreSQL ke Docker containers
# Usage: ./scripts/restore-db.sh <backup_directory> [database_name]
# Example: ./scripts/restore-db.sh backups/database/20240101_120000 registration_db
# Example: ./scripts/restore-db.sh backups/database/20240101_120000 conduct_db

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
    echo -e "${RED}Error: Backup directory is required${NC}"
    echo "Usage: $0 <backup_directory> [database_name]"
    echo "Example: $0 backups/database/20240101_120000"
    echo "Example: $0 backups/database/20240101_120000 registration_db"
    exit 1
fi

BACKUP_DIR="$1"
SPECIFIC_DB="$2"

# Validate backup directory
if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}Error: Backup directory not found: $BACKUP_DIR${NC}"
    exit 1
fi

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

echo -e "${BLUE}=== Database Restore Script ===${NC}"
echo "Backup directory: $BACKUP_DIR"
echo ""

# Function to restore database
restore_database() {
    local container_name=$1
    local db_name=$2
    local db_user=$3
    local backup_file=$4
    
    if [ ! -f "$backup_file" ]; then
        echo -e "${YELLOW}Warning: Backup file not found: $backup_file${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Restoring $db_name to $container_name...${NC}"
    
    # Check if container is running
    if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
        echo -e "${RED}Error: Container $container_name is not running!${NC}"
        echo "Please start the container first: docker-compose up -d $container_name"
        return 1
    fi
    
    # Copy backup file to container
    docker cp "$backup_file" "${container_name}:/tmp/restore_backup.dump"
    
    # Drop existing connections and restore
    echo "  Dropping existing connections..."
    docker exec "$container_name" psql -U "$db_user" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db_name' AND pid <> pg_backend_pid();" postgres 2>/dev/null || true
    
    # Restore database
    echo "  Restoring database..."
    if docker exec -i "$container_name" pg_restore -U "$db_user" -d "$db_name" -c --if-exists "/tmp/restore_backup.dump" 2>/dev/null; then
        # Clean up temporary file in container
        docker exec "$container_name" rm -f "/tmp/restore_backup.dump"
        echo -e "${GREEN}✓ Successfully restored $db_name${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to restore $db_name${NC}"
        docker exec "$container_name" rm -f "/tmp/restore_backup.dump"
        return 1
    fi
}

# Confirm before proceeding
if [ -z "$SPECIFIC_DB" ]; then
    echo -e "${RED}WARNING: This will restore ALL databases from backup!${NC}"
    echo "This will overwrite existing data in:"
    echo "  - $REGISTRATION_DB_NAME"
    echo "  - $CONDUCT_DB_NAME"
    echo "  - $USER_MANAGEMENT_DB_NAME"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Restore databases
SUCCESS_COUNT=0
FAIL_COUNT=0

if [ -z "$SPECIFIC_DB" ] || [ "$SPECIFIC_DB" = "registration_db" ]; then
    if restore_database "$REGISTRATION_DB_CONTAINER" "$REGISTRATION_DB_NAME" "$REGISTRATION_DB_USER" "$BACKUP_DIR/registration_db.dump"; then
        ((SUCCESS_COUNT++))
    else
        ((FAIL_COUNT++))
    fi
fi

# conduct_db (alias CLI lama: execution_db); backup baru: conduct_db.dump, lama: execution_db.dump
if [ -z "$SPECIFIC_DB" ] || [ "$SPECIFIC_DB" = "conduct_db" ] || [ "$SPECIFIC_DB" = "execution_db" ]; then
    CONDUCT_DUMP="$BACKUP_DIR/conduct_db.dump"
    if [ ! -f "$CONDUCT_DUMP" ] && [ -f "$BACKUP_DIR/execution_db.dump" ]; then
        CONDUCT_DUMP="$BACKUP_DIR/execution_db.dump"
    fi
    if restore_database "$CONDUCT_DB_CONTAINER" "$CONDUCT_DB_NAME" "$CONDUCT_DB_USER" "$CONDUCT_DUMP"; then
        ((SUCCESS_COUNT++))
    else
        ((FAIL_COUNT++))
    fi
fi

if [ -z "$SPECIFIC_DB" ] || [ "$SPECIFIC_DB" = "user_management_db" ]; then
    if restore_database "$USER_MANAGEMENT_DB_CONTAINER" "$USER_MANAGEMENT_DB_NAME" "$USER_MANAGEMENT_DB_USER" "$BACKUP_DIR/user_management_db.dump"; then
        ((SUCCESS_COUNT++))
    else
        ((FAIL_COUNT++))
    fi
fi

# Summary
echo ""
echo -e "${BLUE}=== Restore Summary ===${NC}"
echo "Successful restores: $SUCCESS_COUNT"
echo "Failed restores: $FAIL_COUNT"

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All restores completed successfully!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some restores failed. Please check the errors above.${NC}"
    exit 1
fi

