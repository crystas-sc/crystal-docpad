FROM node:22-bookworm-slim

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/export-service/package.json apps/export-service/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install dependencies (including tsx for runtime & vite for build)
RUN npm ci --legacy-peer-deps

# Download Chromium / Chrome headless shell + OS dependencies for PDF print
RUN npx playwright install --with-deps chromium

# Copy source and build frontend assets
COPY . .
RUN npm run build && mkdir -p /app/data

ENV NODE_ENV=production
ENV APP_PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
