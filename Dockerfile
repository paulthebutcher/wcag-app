FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTED_MODE=1
COPY --from=build --chown=node:node /app /app
RUN install -d -o node -g node /app/.data/workspace
USER node
RUN test -w /app/.data/workspace
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
