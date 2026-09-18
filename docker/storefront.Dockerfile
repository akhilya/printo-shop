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

ARG VITE_MEDUSA_BACKEND_URL=https://api.printo.studio
ENV BACKEND_URL=${VITE_MEDUSA_BACKEND_URL}

COPY docker/storefront.nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/storefront-start.sh /storefront-start.sh
COPY --from=build /app/apps/storefront/dist /usr/share/nginx/html

RUN apk add --no-cache gettext \
  && chmod +x /storefront-start.sh

EXPOSE 80
CMD ["/storefront-start.sh"]
