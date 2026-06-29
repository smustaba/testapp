# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# ---- Production stage ----
FROM node:20-alpine AS production

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PROVIDER=memory
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=itemsdb
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package*.json ./

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
