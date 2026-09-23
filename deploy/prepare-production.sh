#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/hallaym/masofaviy}"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: $APP_DIR/.env topilmadi. .env.example asosida production .env yarating." >&2
  exit 1
fi
if [[ ! -f media-server/.env ]]; then
  echo "ERROR: $APP_DIR/media-server/.env topilmadi. media-server/.env.example asosida yarating." >&2
  exit 1
fi

echo "[1/6] Git holati"
git status --short
git fetch origin main
git checkout main
git pull --ff-only origin main

echo "[2/6] Platform dependencies"
npm ci --no-audit --no-fund

echo "[3/6] Media client build + syntax"
npm run build:media-client
npm run check

echo "[4/6] Unit tests"
npm test

echo "[5/6] Mediasoup dependencies"
cd "$APP_DIR/media-server"
if [[ -f package-lock.json ]]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi
npm run check

echo "[6/6] Tayyor"
echo "Keyingi qadam: sudo APP_DIR=$APP_DIR APP_USER=$(id -un) bash $APP_DIR/deploy/install-systemd.sh"
