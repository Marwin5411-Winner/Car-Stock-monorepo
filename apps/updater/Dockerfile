FROM docker:27-cli

# Install docker compose plugin, git, and utilities
RUN apk add --no-cache \
    docker-cli-compose \
    git \
    curl \
    jq \
    bash \
    socat \
    postgresql16-client \
    tzdata

# Set timezone (for cron schedule accuracy)
ENV TZ=Asia/Bangkok
RUN cp /usr/share/zoneinfo/Asia/Bangkok /etc/localtime && \
    echo "Asia/Bangkok" > /etc/timezone

WORKDIR /app

# Copy scripts
COPY apps/updater/server.sh /app/server.sh
COPY apps/updater/update.sh /app/update.sh
COPY apps/updater/check.sh /app/check.sh
COPY apps/updater/backup.sh /app/backup.sh
COPY apps/updater/rollback.sh /app/rollback.sh
COPY apps/updater/crontab /etc/crontabs/root

# Make scripts executable
RUN chmod +x /app/*.sh

# Create directories
RUN mkdir -p /app/status /app/backups /app/logs

EXPOSE 9000

# Start cron daemon in background + HTTP server
CMD ["bash", "-c", "crond -b -l 2 && /app/server.sh"]
