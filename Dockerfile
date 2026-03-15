FROM node:20-alpine

RUN apk add --no-cache git

WORKDIR /app

# Install dependencies first (layer caching)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Volumes for persistent data
VOLUME ["/data"]

# Environment
ENV PORT=3000 \
    DATA_DIR=/data \
    GIT_DB_URL="" \
    GIT_DB_BRANCH=develop \
    GIT_SSL_VERIFY=true \
    JWT_SECRET=change-me-in-production \
    NODE_OPTIONS="--max-old-space-size=256 --optimize-for-size"

EXPOSE 3000

WORKDIR /app/server
CMD ["node", "--expose-gc", "index.js"]
