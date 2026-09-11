#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi
exec npm run dev
