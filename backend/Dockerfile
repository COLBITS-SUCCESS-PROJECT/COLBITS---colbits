# Development image for the COLBITS backend (NestJS, watch mode).
# Usage: `docker compose up` from the repo root  →  http://localhost:3000
# Debian-based (not alpine) so native modules such as bcrypt install from prebuilt binaries.
FROM node:22-slim

WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Re-check dependencies on every start so a teammate's new package is picked up after
# `git pull` without rebuilding the image.
CMD ["sh", "-c", "npm install --no-audit --no-fund && npm run start:dev"]
