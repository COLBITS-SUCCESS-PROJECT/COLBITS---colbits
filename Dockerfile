# Development image for the COLBITS frontend.
# Usage: docker compose up  →  http://localhost:5173
FROM node:20-alpine

# Same pnpm major as CI (.github/workflows/ci.yml).
# Pin the store inside the image: otherwise pnpm creates /app/.pnpm-store on the mounted
# repo (host disk) and reinstalls node_modules on every start.
RUN npm install -g pnpm@9.15.9 && pnpm config set store-dir /pnpm/store --global

WORKDIR /app

# Git hooks run on the host, not inside the container.
ENV HUSKY=0

# Install dependencies first so this layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

# Re-check dependencies on every start (fast when nothing changed) so a teammate's
# new package is picked up after `git pull` without rebuilding the image.
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev --host 0.0.0.0 --port 5173 --strictPort"]
