# --- deps stage ---
FROM node:24-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# --- builder stage: generate Prisma client ---
FROM node:24-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
ENV POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=nodedrpos POSTGRES_USER=nodedr POSTGRES_PASSWORD=build-only
COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.js ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate

# --- runtime stage: slim image ---
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl
# node:24-alpine ships a global npm/npx/corepack that this stage never uses
# (CMD below calls the local prisma binary directly) — but npm vendors its
# own internal copies of tar/brace-expansion/undici, and those specific
# vendored versions carry real CVEs (Scout: 1 critical, 4 high). They aren't
# reachable from our app code at all (confirmed: absent from /app/node_modules,
# only present under npm's own /usr/local/lib/node_modules/npm/node_modules),
# so deleting the whole unused CLI is the actual fix — not a package.json
# override, which can't reach inside an already-published npm release's own
# bundled deps.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/prisma.config.js ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

EXPOSE 4000

# Was `npx prisma migrate deploy` — identical behavior (npx already resolved
# to this same local binary since prisma is present in node_modules/.bin;
# see the removal note above), just invoked directly so it works with npm
# gone from the image.
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node src/server.js"]
