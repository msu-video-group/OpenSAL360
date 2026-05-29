#!/bin/sh

trap 'exit 0' TERM INT

while :; do
  certbot renew --webroot -w /var/www/certbot --quiet \
    --deploy-hook "date +%s > /var/www/certbot/.reload-nginx"

  sleep 48h & wait "$!"
done
