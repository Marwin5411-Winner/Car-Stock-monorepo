.PHONY: help build up down logs restart clean db-seed db-migrate db-studio shell-api shell-db logs-updater backup backups check-update update rollback shell-updater

# Default target
help:
	@echo "Car Stock Monorepo - Docker Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  build        Build all Docker images"
	@echo "  up           Start all services"
	@echo "  down         Stop all services"
	@echo "  restart      Restart all services"
	@echo "  logs         View logs from all services"
	@echo "  logs-api     View API logs"
	@echo "  logs-web     View Web logs"
	@echo "  logs-db      View Database logs"
	@echo "  clean        Remove all containers, images, and volumes"
	@echo "  db-seed      Seed the database"
	@echo "  db-push      Sync database schema (prisma db push)"
	@echo ""
	@echo "Updater:"
	@echo "  check-update   Check for available updates"
	@echo "  update         Trigger system update"
	@echo "  rollback       Trigger rollback to previous version"
	@echo "  backup         Create a manual database backup"
	@echo "  backups        List available backups"
	@echo "  logs-updater   View updater logs"
	@echo "  shell-updater  Shell into updater container"
	@echo ""

# Build all images
build:
	docker compose build

# Start all services
up:
	docker compose --env-file .env.docker up -d

# Start with build
up-build:
	docker compose --env-file .env.docker up -d --build

# Stop all services
down:
	docker compose down

# View all logs
logs:
	docker compose logs -f

# View API logs
logs-api:
	docker compose logs -f api

# View Web logs
logs-web:
	docker compose logs -f web

# View Database logs
logs-db:
	docker compose logs -f postgres

# Restart all services
restart:
	docker compose restart

# Remove everything including volumes
clean:
	docker compose down -v --rmi all --remove-orphans

# Seed the database
db-seed:
	docker compose exec api bunx prisma db seed

# Sync database schema
db-push:
	docker compose exec api bunx prisma db push

# Run migrations manually (legacy)
db-migrate:
	docker compose exec api bunx prisma migrate deploy

# Open Prisma Studio (requires api container to be running)
db-studio:
	docker compose exec api bunx prisma studio

# Shell into API container
shell-api:
	docker compose exec api sh

# Shell into database
shell-db:
	docker compose exec postgres psql -U postgres -d car_stock

# --- Updater Commands ---

# View updater logs
logs-updater:
	docker compose --env-file .env.docker logs -f updater

# Trigger a manual backup
backup:
	docker compose --env-file .env.docker exec updater /app/backup.sh manual

# List backups
backups:
	docker compose --env-file .env.docker exec updater ls -lh /app/backups/

# Check for updates
check-update:
	docker compose --env-file .env.docker exec updater /app/check.sh

# Trigger update (update.sh has built-in lock protection against concurrent runs)
update:
	docker compose --env-file .env.docker exec updater /app/update.sh

# Trigger rollback
rollback:
	docker compose --env-file .env.docker exec updater /app/rollback.sh

# Shell into updater container
shell-updater:
	docker compose --env-file .env.docker exec updater bash
