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
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Standalone: server.js nằm ngay root output, image nhỏ nhất
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Vá package OS + xoá npm/corepack đi kèm image (CVE trong bundle npm) — runtime chỉ chạy `node server.js`
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack && \
    addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
ENV PORT=3000
# server.js bind theo HOSTNAME; Docker đặt HOSTNAME = container id → không nghe loopback, HEALTHCHECK fail
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# /health ở root, matcher proxy loại ra; 127.0.0.1 vì alpine phân giải localhost → ::1 trước
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "server.js"]
