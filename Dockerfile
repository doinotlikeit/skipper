FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Install dependencies first (cache layer)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY core/package.json ./core/
COPY adapters/package.json ./adapters/
COPY cli/package.json ./cli/
COPY ui/package.json ./ui/
RUN pnpm install --frozen-lockfile

# Build
COPY tsconfig.base.json ./
COPY core/ ./core/
COPY adapters/ ./adapters/
COPY cli/ ./cli/
COPY ui/ ./ui/
RUN pnpm run build

# ── Runtime image ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy built artifacts and workspace node_modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/core/package.json ./core/
COPY --from=builder /app/core/node_modules ./core/node_modules

COPY --from=builder /app/adapters/dist ./adapters/dist
COPY --from=builder /app/adapters/package.json ./adapters/
COPY --from=builder /app/adapters/node_modules ./adapters/node_modules

COPY --from=builder /app/cli/dist ./cli/dist
COPY --from=builder /app/cli/package.json ./cli/
COPY --from=builder /app/cli/node_modules ./cli/node_modules

# UI dist is served by Core's Express server; path resolved relative to server.js
COPY --from=builder /app/ui/dist ./ui/dist

EXPOSE 3000

# Mount the target repo at /repo; pass ANTHROPIC_API_KEY for Claude adapters.
VOLUME ["/repo"]

ENTRYPOINT ["node", "cli/dist/bin/skipper.js"]
CMD ["up", "--repo", "/repo", "--port", "3000"]
