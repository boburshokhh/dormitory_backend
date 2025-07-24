# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.18.0
FROM node:${NODE_VERSION}-alpine AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Install packages needed for running production application
RUN apk add --no-cache \
    dumb-init \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules
RUN apk add --no-cache \
    build-base \
    gyp \
    python3 \
    make \
    g++ \
    libc6-compat

# Install node modules
COPY package*.json ./
RUN npm ci --only=production --frozen-lockfile

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads logs

# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/uploads ./uploads
COPY --from=build /app/logs ./logs

# Copy source code
COPY . .

# Change ownership
RUN chown -R nextjs:nodejs /app
USER nextjs

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD ["dumb-init", "node", "server.js"]
