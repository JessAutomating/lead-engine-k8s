# Lead engine runner. Zero runtime dependencies, so the image is just Node plus
# the source and fixtures. Runs as a non-root user and defaults to --dry-run so a
# bare `docker run` is safe and needs no secrets.

FROM node:22-alpine

# OCI metadata.
LABEL org.opencontainers.image.title="lead-engine-k8s"
LABEL org.opencontainers.image.description="Weekly lead-generation batch runner, scheduled as a Kubernetes CronJob (sanitized portfolio demo)."
LABEL org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
WORKDIR /app

# Copy only what the runner needs. No npm install: there are no dependencies.
COPY package.json ./
COPY src ./src
COPY fixtures ./fixtures
COPY config.example.json ./

# Drop to the unprivileged user that ships with the node image.
USER node

# Default to a safe, offline dry-run. Kubernetes overrides args per CronJob.
ENTRYPOINT ["node", "src/index.js"]
CMD ["--dry-run"]
