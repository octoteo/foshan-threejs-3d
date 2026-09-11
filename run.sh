#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
exec npm run dev
