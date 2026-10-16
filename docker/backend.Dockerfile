FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY docker/certs/russian_trusted_root_ca.crt /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
COPY docker/certs/russian_trusted_sub_ca.crt /usr/local/share/ca-certificates/russian_trusted_sub_ca.crt
COPY docker/certs/russian_trusted_root_ca.crt /app/certs/russian_trusted_root_ca.crt
COPY docker/certs/russian_trusted_sub_ca.crt /app/certs/russian_trusted_sub_ca.crt

RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# copy the built server files and the package manifest(s) from the build stage
COPY --from=build /app/apps/backend/.medusa/server ./
COPY --from=build /app/apps/backend/package.json ./
COPY --from=build /app/apps/backend/package-lock.json ./

COPY docker/backend-start.sh ./start.sh

RUN chmod +x ./start.sh \
  && npm pkg set "overrides.@aws-sdk/client-s3=3.1128.0" \
  && npm pkg set "overrides.@aws-sdk/lib-storage=3.1128.0" \
  && npm pkg set "overrides.@aws-sdk/s3-request-presigner=3.1128.0" \
  && npm pkg set "overrides.@aws-sdk/client-dynamodb=3.1128.0" \
  && npm install --omit=dev

EXPOSE 9000
CMD ["./start.sh"]