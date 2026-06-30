# Playable Lessons — self-hosted web server Docker image.
# Builds the shared generators + Express server into a single image.
# The server holds the LLM key (from .env); the browser holds work in localStorage.

FROM node:22-slim

WORKDIR /app

# Install deps (including devDeps for the build step)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source + build the shared generators
COPY . .
RUN npm run embed:runtime && npm run build:cli

# Prune devDeps to slim the runtime image (keep only what the server needs)
RUN npm prune --production

EXPOSE 3000
CMD ["node", "server/index.js"]
