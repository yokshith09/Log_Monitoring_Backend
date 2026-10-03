# Vantage on Cloud Run.
#
# Two stages on purpose. The frontend needs ~300MB of build tooling (Vite,
# TypeScript, Tailwind) that the running service has no use for, so the builder
# stage is thrown away and only web/dist crosses into the runtime image.
#
# The API itself has zero dependencies — plain node:http — so the runtime stage
# runs no install at all. That keeps the image small and the cold start short,
# which matters on Cloud Run where the first request after scale-to-zero pays
# for the whole container boot.

# ---------------------------------------------------------------- build the UI
FROM node:22-slim AS builder
WORKDIR /build

# Lockfile first: this layer is cached unless the dependencies actually change,
# so an edit to a component does not re-download the toolchain.
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

COPY web/ ./web/
RUN npm --prefix web run build

# ------------------------------------------------------------------- runtime
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# No `npm ci` here: the API has no dependencies to install.
COPY package.json ./
COPY api/ ./api/
COPY --from=builder /build/web/dist ./web/dist

# Cloud Run runs containers as a non-root user by preference; node:22-slim ships
# an unprivileged `node` user, and nothing here needs to write to disk.
USER node

# Cloud Run injects PORT and expects the container to honour it. api/server.js
# already reads `process.env.PORT ?? 8090` and binds 0.0.0.0, so this value is
# only the local-run default.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "api/server.js"]
