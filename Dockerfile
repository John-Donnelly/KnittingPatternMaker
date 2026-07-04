# Multi-stage build: compile everything, then ship a production-only image where the API
# serves both /api and the built frontend (single deployable).

FROM node:20-bookworm-slim AS build
# Native-module toolchain (better-sqlite3 compiles from source when no prebuilt binary
# matches). Only the build stage needs it; the runtime stage copies compiled node_modules.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build
# Strip dev dependencies in place: native modules (sharp, better-sqlite3) keep the binaries
# they installed with, so the runtime stage needs no compiler toolchain and no second install.
RUN npm prune --omit=dev \
    && mkdir -p packages/core/node_modules apps/api/node_modules

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/node_modules packages/core/node_modules
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/web/dist apps/web/dist

ENV PORT=4000 \
    HOST=0.0.0.0 \
    STATIC_ROOT=/app/apps/web/dist \
    DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
