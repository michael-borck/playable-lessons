# Playable Lessons — self-hosted web server Docker image.
#
# Multi-stage: the build stage needs devDependencies (TypeScript, the runtime
# embedder); the runtime stage installs production dependencies only and runs
# as the unprivileged `node` user.
#
# .dockerignore excludes node_modules/, out/, .git/, etc. so COPY . . doesn't
# clobber the fresh npm ci install or copy macOS binaries into the Linux image.

FROM node:26-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run embed:runtime && npm run build:cli

FROM node:26-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps && npm cache clean --force

COPY --from=build /app/out ./out
COPY --from=build /app/server ./server

# Never run the server as root.
USER node

EXPOSE 3000

# /api/health is public even when ACCESS_CODE is set, so this works either way.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
