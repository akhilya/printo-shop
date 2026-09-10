FROM node:20-alpine AS build

WORKDIR /app

ARG VITE_MEDUSA_BACKEND_URL
ENV VITE_MEDUSA_BACKEND_URL=$VITE_MEDUSA_BACKEND_URL

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN npm ci

COPY apps/storefront apps/storefront

WORKDIR /app/apps/storefront
RUN npm run build

FROM nginx:1.27-alpine

COPY docker/storefront.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/storefront/dist /usr/share/nginx/html

EXPOSE 80
