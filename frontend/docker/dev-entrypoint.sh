#!/bin/sh
set -eu

STAMP_FILE="/app/node_modules/.deps-hash"

if [ -f /app/pnpm-lock.yaml ]; then
	CURRENT_HASH="$(cat /app/package.json /app/pnpm-lock.yaml | sha256sum | awk '{print $1}')"
else
	CURRENT_HASH="$(cat /app/package.json | sha256sum | awk '{print $1}')"
fi

SAVED_HASH=""
if [ -f "$STAMP_FILE" ]; then
	SAVED_HASH="$(cat "$STAMP_FILE")"
fi

if [ ! -d /app/node_modules ] || [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
	echo "[frontend] Installing dependencies (changes detected)..."
	pnpm install --no-frozen-lockfile --prefer-offline --force
	mkdir -p /app/node_modules
	printf '%s' "$CURRENT_HASH" > "$STAMP_FILE"
else
	echo "[frontend] Dependencies are up to date, skipping install."
fi

echo "[frontend] Starting Vite dev server..."
exec pnpm run dev -- --host 0.0.0.0 --port 5173
