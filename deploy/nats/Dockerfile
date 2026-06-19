FROM nats:2.10-alpine

RUN apk add --no-cache openssl gettext wget

COPY nats-server.conf.template /etc/nats/nats-server.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY generate-certs.sh /usr/local/bin/generate-certs.sh

RUN chmod +x /docker-entrypoint.sh /usr/local/bin/generate-certs.sh

VOLUME ["/etc/nats/certs", "/data"]

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["-c", "/etc/nats/nats-server.conf"]
