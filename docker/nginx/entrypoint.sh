#!/bin/sh

while :; do
  if [ -f /var/www/certbot/.reload-nginx ]; then
    if ! cmp -s /var/www/certbot/.reload-nginx /tmp/reload-nginx.last; then
      if nginx -s reload; then
        cp /var/www/certbot/.reload-nginx /tmp/reload-nginx.last
      fi
    fi
  fi

  sleep 300
done &

exec nginx -g "daemon off;"
