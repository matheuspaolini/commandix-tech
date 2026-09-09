FROM oven/bun:1.4.0 AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown bun:bun /app
USER bun
COPY --chown=bun:bun package.json bun.lock bunfig.toml ./
COPY --chown=bun:bun apps/api/package.json apps/api/package.json
COPY --chown=bun:bun apps/worker/package.json apps/worker/package.json
COPY --chown=bun:bun apps/web/package.json apps/web/package.json
COPY --chown=bun:bun packages/database/package.json packages/database/package.json
RUN bun install --frozen-lockfile
COPY --chown=bun:bun . .
RUN bun run build

FROM build AS server
ENV NODE_ENV=production
USER bun
CMD ["bun", "apps/api/src/main.ts"]

FROM nginx:1.28-alpine AS web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
