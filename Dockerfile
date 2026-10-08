# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund --fetch-timeout=30000 --fetch-retries=1
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/start.mjs ./scripts/start.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000
USER node
EXPOSE 10000
CMD ["node", "scripts/start.mjs"]
