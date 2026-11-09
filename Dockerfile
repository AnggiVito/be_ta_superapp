FROM node:20-bullseye-slim

# Install Chromium runtime dependencies required by puppeteer
# Also install tzdata for timezone configuration
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  wget \
  xdg-utils \
  lsb-release \
  chromium \
  libx11-6 \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libnss3 \
  libxrandr2 \
  libxrender1 \
  libgbm1 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libgtk-3-0 \
  libxss1 \
  tzdata \
&& rm -rf /var/lib/apt/lists/*

# Set timezone to Asia/Jakarta (GMT+7)
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copy package files
# Prevent puppeteer from attempting to download Chromium during npm install
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./

# Install dependencies (production only). We use system Chromium installed above.
RUN if [ -f package-lock.json ]; then \
      echo "package-lock.json ditemukan, mencoba npm ci..."; \
      npm ci --omit=dev || (echo "npm ci gagal, fallback ke npm install..." && npm install --omit=dev); \
    else \
      echo "package-lock.json tidak ditemukan, menggunakan npm install..."; \
      npm install --omit=dev; \
    fi

# Copy application code
COPY . .

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Ensure entrypoint has Unix line endings (in case of Windows CRLF in repo)
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh || true

# Ensure entrypoint has no Windows CR characters inside the image
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh || true

# Expose port
EXPOSE 3000

# Health check - menggunakan wget karena lebih ringan di Alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use entrypoint script via sh to avoid shebang/CRLF issues
ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
