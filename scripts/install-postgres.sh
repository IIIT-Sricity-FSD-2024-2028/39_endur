#!/usr/bin/env bash
# One-time local Postgres for development on WSL/Ubuntu.
#
# 03 §5 specifies Postgres 16 via Docker Compose; docker-compose.yml is committed and
# still the path for anyone who has Docker. This script is the equivalent for a machine
# without it. Same version, same credentials, same DATABASE_URL — so nothing downstream
# can tell the difference.
#
#   sudo bash scripts/install-postgres.sh
set -euo pipefail

echo "==> installing postgresql-16"
apt-get install -y postgresql-16 postgresql-client-16

echo "==> starting the server"
service postgresql start
until pg_isready -q; do sleep 1; done

echo "==> creating the endur role and database (idempotent)"
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='endur'\"" | grep -q 1 \
  || su - postgres -c "psql -c \"CREATE ROLE endur LOGIN PASSWORD 'endur' CREATEDB\""
su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='endur'\"" | grep -q 1 \
  || su - postgres -c "createdb -O endur endur"

echo
echo "done. verify with:  psql postgresql://endur:endur@localhost:5432/endur -c 'select version()'"
echo "WSL does not run services at boot — after a restart:  sudo service postgresql start"
