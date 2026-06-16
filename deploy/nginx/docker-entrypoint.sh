#!/bin/sh
set -eu

export GATEWAY_STABLE_WEIGHT="${GATEWAY_STABLE_WEIGHT:-19}"
export GATEWAY_CANARY_WEIGHT="${GATEWAY_CANARY_WEIGHT:-1}"
export WEB_STABLE_WEIGHT="${WEB_STABLE_WEIGHT:-19}"
export WEB_CANARY_WEIGHT="${WEB_CANARY_WEIGHT:-1}"

envsubst '${GATEWAY_STABLE_WEIGHT} ${GATEWAY_CANARY_WEIGHT} ${WEB_STABLE_WEIGHT} ${WEB_CANARY_WEIGHT}' \
  < /etc/nginx/templates/nginx.conf \
  > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
