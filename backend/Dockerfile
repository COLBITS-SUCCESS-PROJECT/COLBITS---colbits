# Development image for the COLBITS backend (NestJS, watch mode).
# Usage: `docker compose up` from the repo root  →  http://localhost:3000
# Node 24: Jest loads the ESM-only NestJS 12 packages natively (require(esm)).
# Debian-based (not alpine) so native modules such as bcrypt install from prebuilt binaries.
FROM node:24-slim

WORKDIR /app

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

# Re-check dependencies on every start so a teammate's new package is picked up after
# `git pull` without rebuilding the image.
# Watch mode: `tsc --watch` recompiles and `node --watch` restarts the app in place.
# - `nest start --watch` is not used: on this slim image (no `ps`) it leaves the old app holding
#   port 3000 and every reload fails with EADDRINUSE.
# - The output goes to /tmp/dist (inside the container, not the bind mount) because file events
#   from the Windows/macOS mount do not reach `node --watch`; NODE_PATH finds /app/node_modules.
ENV NODE_PATH=/app/node_modules
CMD ["sh", "-c", "npm install --no-audit --no-fund && npx tsc -p tsconfig.build.json --outDir /tmp/dist && (npx tsc -p tsconfig.build.json --outDir /tmp/dist --watch --preserveWatchOutput & node --enable-source-maps --watch /tmp/dist/main.js)"]
