FROM node:24-alpine

RUN apk add --no-cache git

# Create a non-root user (UID 1001).
# OpenShift runs containers with an arbitrary UID but always GID=0 (root group).
# We create a home dir and pre-populate a .gitconfig that marks every directory
# as safe so git works regardless of the runtime UID assigned by OpenShift.
RUN adduser -u 1001 -G root -H -D mcm \
 && mkdir -p /home/mcm \
 && printf '[safe]\n    directory = *\n' > /home/mcm/.gitconfig

WORKDIR /app

# Install dependencies first (layer caching)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Copy source
COPY server/ ./server/
COPY client/ ./client/

# Download vendor libs only when not already bundled (internet-available builds).
# In airgapped environments, vendor files are committed to the repo and copied above.
COPY download-vendor.js ./
RUN ([ -f client/vendor/tailwindcss-browser.js ] && [ -f client/vendor/vue.global.prod.js ]) \
    || node download-vendor.js
RUN rm download-vendor.js

# Ensure a default branding.custom.js exists (override via volume mount)
RUN test -f client/branding.custom.js \
 || printf '// branding.custom.js — Override via volume mount\n// Object.assign(window.APP_BRANDING, { logoText: "XYZ", orgName: "Mein Verein" });\n' > client/branding.custom.js

# Apply OpenShift group-write pattern:
# chown to 1001:0 then chmod g=u so any UID with GID=0 (OpenShift's default)
# has the same filesystem access as the declared owner.
RUN mkdir -p /data \
 && chown -R 1001:0 /app /home/mcm /data \
 && chmod -R g=u /app /home/mcm /data

# /data must be pre-owned before VOLUME freezes the directory.
# On OpenShift set securityContext.fsGroup=0 on the Pod so a mounted PVC
# inherits GID 0 and remains writable by any arbitrary UID.
VOLUME ["/data"]

# Environment
# JWT_SECRET is intentionally absent – the server refuses to start without it.
# Set it via a Kubernetes Secret or docker run -e JWT_SECRET=<strong-random-value>
ENV PORT=3000 \
    DATA_DIR=/data \
    GIT_DB_URL="" \
    GIT_DB_BRANCH=develop \
    GIT_SSL_VERIFY=true \
    CORS_ORIGIN="" \
    LOG_LEVEL=info \
    HOME=/home/mcm \
    NODE_OPTIONS="--max-old-space-size=256"

EXPOSE 3000

USER 1001

WORKDIR /app/server
CMD ["node", "--expose-gc", "index.js"]
