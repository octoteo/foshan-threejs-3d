#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node tools/ensure-deps.mjs
exec npm run dev
