FROM nginx:1.27-alpine

RUN apk add --no-cache gettext \
    && sed -i 's/\r$//' /docker-entrypoint.sh 2>/dev/null || true

COPY nginx.conf /etc/nginx/templates/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && sed -i 's/\r$//' /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
