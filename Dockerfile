# Playable Lessons — self-hosted web server Docker image.
# Builds the shared generators + Express server into a single image.
# The server holds the LLM key (from .env); the browser holds work in localStorage.
#
# .dockerignore excludes node_modules/, out/, .git/, etc. so COPY . . doesn't
# clobber the fresh npm ci install or copy macOS binaries into the Linux image.

FROM node:22-slim

WORKDIR /app

# Install all deps (devDeps needed for the build step + express for the server)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source (respects .dockerignore)
COPY . .

# Build the shared generators (compiled to out/shared/)
RUN npm run embed:runtime && npm run build:cli

EXPOSE 3000
CMD ["node", "server/index.js"]
