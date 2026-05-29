#!/bin/bash

python wait_for_postgres.py

python manage.py migrate
python manage.py collectstatic --noinput

if [[ "${DEBUG}" == "True" ]]; then
    python manage.py runserver 0.0.0.0:80
else
    NEW_RELIC_CONFIG_FILE=newrelic.ini newrelic-admin run-program gunicorn \
        -w 5 \
        --timeout 300 \
        --forwarded-allow-ips="*" \
        -b 0.0.0.0:80 \
        salimouse_site.wsgi:application
fi
