# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
# pnpm = `packageManager` ("pnpm@x.y.z[+sha…]") — thiếu field thì build fail ngay
COPY package.json ./
RUN npm i -g "$(node -p "require('./package.json').packageManager.split('+')[0]")" \
 && pnpm config set store-dir /pnpm/store

# Copy manifest trước để cache layer; --ignore-scripts vì stage này chưa có source
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# Chỉ dependencies runtime cho image ship
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Target chạy Vitest (compose profile `test`, DATABASE_URL trỏ DB `ticket_test`)
FROM builder AS test
CMD ["pnpm", "test"]

# Image ship: không pnpm/npm/corepack (CVE của tooling không vào image), user non-root
FROM node:24-alpine AS runner
# Vá CVE OS đã có bản vá trong repo alpine; bỏ npm + corepack đi kèm image node
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 8080
# 127.0.0.1, không localhost: alpine phân giải localhost → ::1 trước
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/health" || exit 1
CMD ["node", "dist/server.js"]
