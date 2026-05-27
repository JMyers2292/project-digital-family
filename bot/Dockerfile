FROM node:20-alpine

# Install the Claude Code CLI so `claude -p` is available inside the container.
# Auth is provided at runtime by mounting ~/.claude from the host (see docker-compose.yml).
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Install dependencies first (cached layer — only invalidated when package files change)
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# These directories are mounted as named volumes at runtime
RUN mkdir -p /app/data /app/vault

CMD ["node", "dist/index.js"]
