#!/usr/bin/env bash
# Builds the committed code and deploys it to the Azure Web App.
#
#   bash scripts/deploy-azure.sh             build + upload
#   bash scripts/deploy-azure.sh --migrate   also apply new database migrations first
#
# Needs: az (signed in: `az login`), node 20+, npm, zip, curl.
# Reads AZ_DATABASE_URL from .env.azure (git-ignored) when --migrate is passed.
#
# Why not let Azure build it: the repo is an npm workspace, and Azure's own build step
# (Oryx) does not handle that. So we build here, keep only runtime packages, and upload
# a ready-to-run folder. Only committed code (HEAD) is deployed, never local edits.
set -euo pipefail

RESOURCE_GROUP="${AZ_RESOURCE_GROUP:-endur-rg}"
APP_NAME="${AZ_APP_NAME:-endur}"
PG_SERVER="${AZ_PG_SERVER:-endur-db-harsh}"
MIGRATE=false
[[ "${1:-}" == "--migrate" ]] && MIGRATE=true

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

step() { printf '\n==> %s\n' "$*"; }

step "Checking Azure sign-in"
az account show --query "name" -o tsv >/dev/null || { echo "Run: az login"; exit 1; }

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Note: you have uncommitted changes. They will NOT be deployed (only HEAD is)."
fi
VERSION="$(git describe --tags --exact-match HEAD 2>/dev/null || echo "untagged")"
echo "Deploying commit $(git rev-parse --short HEAD) ($VERSION) to $APP_NAME"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SRC="$WORK/src"
mkdir -p "$SRC"

step "Building a clean copy"
git archive HEAD | tar -x -C "$SRC"
(
  cd "$SRC"
  # postinstall runs `prisma generate`, which only needs DATABASE_URL to be set, not reachable.
  DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci --include=dev --no-audit --no-fund
  npm run build
)

if $MIGRATE; then
  step "Applying database migrations"
  [[ -f .env.azure ]] || { echo ".env.azure not found"; exit 1; }
  # shellcheck disable=SC1091
  source .env.azure
  # The database only accepts listed IPs, and home/mobile IPs change often.
  MY_IP="$(curl -s https://api.ipify.org)"
  az postgres flexible-server firewall-rule create -g "$RESOURCE_GROUP" -s "$PG_SERVER" \
    -n "laptop-${MY_IP//./-}" --start-ip-address "$MY_IP" -o none
  (cd "$SRC" && DATABASE_URL="$AZ_DATABASE_URL" npm run db:migrate)
fi

(cd "$SRC" && npm prune --omit=dev --no-audit --no-fund)

step "Assembling the upload"
bash "$ROOT/scripts/package-app.sh" "$SRC" "$WORK/endur.zip"

step "Uploading to Azure (takes a few minutes)"
az webapp deploy -g "$RESOURCE_GROUP" -n "$APP_NAME" --src-path "$WORK/endur.zip" \
  --type zip --clean true --restart true -o none

step "Checking the live site"
URL="https://$(az webapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" --query defaultHostName -o tsv)"
STATUS="$(curl -s -o /dev/null -m 180 -w '%{http_code}' "$URL/")"
echo "$URL -> HTTP $STATUS"
[[ "$STATUS" == "200" ]] || { echo "Site did not return 200. Logs: az webapp log tail -g $RESOURCE_GROUP -n $APP_NAME"; exit 1; }
echo "Deployed."
