#!/bin/bash
set -euo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
REPO_ROOT=$( cd -- "$SCRIPT_DIR/../.." &> /dev/null && pwd )
COMPOSE_FILE="$REPO_ROOT/docker-compose.production.yml"
DATA_PATH="$REPO_ROOT/app_data/certbot"
cd "$REPO_ROOT"

###################################################################
############### Function declarations #############################
###################################################################

function check_if_docker_compose_installed {
  if ! command -v docker >/dev/null 2>&1; then
    echo 'Error: docker is not installed.' >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo 'Error: docker compose plugin is not installed.' >&2
    exit 1
  fi
}

function setup_tls_parameters {
  local data_path=$1
  if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
    echo "### Downloading recommended TLS parameters ..."
    mkdir -p "$data_path/conf"
    curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf -o "$data_path/conf/options-ssl-nginx.conf"
    curl -fsSL https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem -o "$data_path/conf/ssl-dhparams.pem"
    echo
  fi
}

function should_renew_certificate {
  local data_path=$1
  local domains_string=$2
  local domains=()
  read -r -a domains <<< "$domains_string"
  local primary_domain="${domains[0]}"

  if [ -d "$data_path/conf/live/$primary_domain" ]; then
    read -p "Existing data found for ${domains[*]}. Continue and replace existing certificate? (y/N) " decision
    if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
      echo "0"
      return
    fi
  fi
  echo "1"
}

function assert_certificate_exists {
  local data_path=$1
  local primary_domain=$2
  local cert_dir="$data_path/conf/live/$primary_domain"
  local missing_files=()

  if [ ! -f "$cert_dir/fullchain.pem" ]; then
    missing_files+=( "$cert_dir/fullchain.pem" )
  fi

  if [ ! -f "$cert_dir/privkey.pem" ]; then
    missing_files+=( "$cert_dir/privkey.pem" )
  fi

  if [ "${#missing_files[@]}" -ne 0 ]; then
    echo "Error: expected certificate files for $primary_domain were not created:" >&2
    printf '  - %s\n' "${missing_files[@]}" >&2
    echo >&2
    echo "Check actual Certbot lineages on the server with:" >&2
    echo "  docker compose -f $COMPOSE_FILE run --rm --no-deps --entrypoint certbot certbot certificates" >&2
    exit 1
  fi
}

function make_dummy_certificate {
  local data_path=$1
  local domains_string=$2
  local domains=()
  read -r -a domains <<< "$domains_string"
  local primary_domain="${domains[0]}"

  echo "### Creating dummy certificate for domains ${domains[*]} ..."
  local path="/etc/letsencrypt/live/$primary_domain"
  mkdir -p "$data_path/conf/live/$primary_domain"
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint openssl certbot \
    req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "$path/privkey.pem" \
      -out "$path/fullchain.pem" \
      -subj "/CN=localhost"
  assert_certificate_exists "$data_path" "$primary_domain"
  echo
}

function start_nginx {
  echo "### Starting nginx ..."
  docker compose -f "$COMPOSE_FILE" up --force-recreate -d nginx
  echo
}


function delete_dummy_certificate {
  local dummy_certificate_domain=$1
  echo "### Deleting dummy certificate for $dummy_certificate_domain ..."
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint rm certbot \
    -Rf \
      "/etc/letsencrypt/live/$dummy_certificate_domain" \
      "/etc/letsencrypt/archive/$dummy_certificate_domain" \
      "/etc/letsencrypt/renewal/$dummy_certificate_domain.conf"
  echo
}

function request_new_certificate {
  local domains_string=$1
  local email="$2"
  local rsa_key_size="$3"
  local staging="$4"
  local data_path="$5"
  local domains=()
  read -r -a domains <<< "$domains_string"
  local primary_domain="${domains[0]}"

  echo "### Requesting Let's Encrypt certificate for ${domains[*]} ..."
  local domain_args=()
  for domain in "${domains[@]}"; do
    domain_args+=( -d "$domain" )
  done

  local email_arg=()
  case "$email" in
    "") email_arg=( --register-unsafely-without-email ) ;;
    *) email_arg=( --email "$email" ) ;;
  esac

  local staging_arg=()
  if [ "$staging" != "0" ]; then
    staging_arg=( --staging )
  fi

  docker compose -f "$COMPOSE_FILE" run --rm --no-deps --entrypoint certbot certbot \
    certonly --webroot -w /var/www/certbot \
      "${staging_arg[@]}" \
      "${email_arg[@]}" \
      "${domain_args[@]}" \
      --cert-name "$primary_domain" \
      --no-eff-email \
      --rsa-key-size $rsa_key_size \
      --agree-tos \
      --force-renewal
  assert_certificate_exists "$data_path" "$primary_domain"
  echo
}

function reload_nginx {
  echo "### Reloading nginx ..."
  docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload
}


###################################################################
##################### Script start ################################
###################################################################


domains_list=(example.com)
rsa_key_size=4096
data_path="$DATA_PATH"
email="your@email.com" # Adding a valid address is strongly recommended
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

check_if_docker_compose_installed

setup_tls_parameters "$data_path"

# Create dummy certificates if needed.
n_renewals=0
dummy_certificate_domains=()
for domains in "${domains_list[@]}"; do
    renew_certificate=$(should_renew_certificate "$data_path" "$domains")
    if [ "$renew_certificate" -eq "1" ]; then
      n_renewals=$(( n_renewals+1 ))
      make_dummy_certificate "$data_path" "$domains"
      domain_parts=()
      read -r -a domain_parts <<< "$domains"
      dummy_certificate_domains+=( "${domain_parts[0]}" )
    else
      dummy_certificate_domains+=( "" )
    fi
done

if [ "$n_renewals" -eq  "0" ]; then
  echo "No new renewals, quitting."
  exit
fi

start_nginx

# For each domain renew certificate (if needed).
n_domains="${#domains_list[@]}"
for (( i=0; i<"$n_domains"; i++ )); do
  dummy_certificate_domain="${dummy_certificate_domains[$i]}"
  if [ -z "$dummy_certificate_domain" ]; then
    # if we did not create dummy certificate continue to the next domain.
    continue
  fi

  delete_dummy_certificate "$dummy_certificate_domain"

  domains="${domains_list[$i]}"

  request_new_certificate "$domains" "$email" "$rsa_key_size" "$staging" "$data_path"
done

# Reload nginx with new certificates.
reload_nginx
