# =========================
# Builder Stage
# =========================
FROM node:22-slim AS builder
WORKDIR /app

# Setup
RUN mkdir config
COPY . .

ARG CI
ARG BUILDTIME
ARG VERSION=1.0.0
ARG REVISION=unknown
ENV CI=$CI

# Install and build only outside CI
RUN if [ "$CI" != "true" ]; then \
      corepack enable && corepack prepare pnpm@11.19.0 --activate && \
      pnpm install --frozen-lockfile --prefer-offline && \
      NEXT_TELEMETRY_DISABLED=1 \
      NEXT_PUBLIC_BUILDTIME=$BUILDTIME \
      NEXT_PUBLIC_VERSION=$VERSION \
      NEXT_PUBLIC_REVISION=$REVISION \
      pnpm run build; \
    else \
      echo "✅ Using prebuilt app from CI context"; \
    fi

# =========================
# Runtime Stage
# =========================
FROM node:22-alpine AS runner
ARG VERSION=1.0.0
ARG REVISION=unknown
ARG BUILDTIME
LABEL org.opencontainers.image.title="Gather"
LABEL org.opencontainers.image.description="A self-hosted services landing page, with docker and service integrations."
LABEL org.opencontainers.image.url="https://github.com/daredevilbear/gather"
LABEL org.opencontainers.image.documentation='https://gather.daredevilbear.dev/'
LABEL org.opencontainers.image.source='https://github.com/daredevilbear/gather'
LABEL org.opencontainers.image.licenses='GPL-3.0'
LABEL org.opencontainers.image.version=$VERSION
LABEL org.opencontainers.image.revision=$REVISION
LABEL org.opencontainers.image.created=$BUILDTIME

# Setup
WORKDIR /app

# Copy some files from context
COPY --link --chown=1000:1000 /public ./public/
COPY --link --chmod=755 docker-entrypoint.sh /usr/local/bin/
COPY --link LICENSE NOTICE VERSION /usr/share/gather/

# Copy only necessary files from the build stage
COPY --link --from=builder --chown=1000:1000 /app/.next/standalone/ ./
COPY --link --from=builder --chown=1000:1000 /app/.next/static/ ./.next/static

RUN apk add --no-cache su-exec iputils-ping shadow

COPY system/bootstrap.cjs system/database.cjs system/vault.cjs ./system/

USER root

ENV NODE_ENV=production
ENV HOSTNAME=::
ENV PORT=3000
EXPOSE $PORT

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider -Y off http://127.0.0.1:$PORT/api/healthcheck || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "system/bootstrap.cjs"]
