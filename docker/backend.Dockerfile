FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json turbo.json eslint.config.ts ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN npm ci

COPY apps/backend apps/backend

WORKDIR /app/apps/backend
RUN npx medusa build

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

WORKDIR /app/apps/backend
EXPOSE 9000

CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
