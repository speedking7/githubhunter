#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_BIN="${NODE_BIN:-node}"
LOG_DIR="${LOG_DIR:-./logs}"
mkdir -p "$LOG_DIR"

"$NODE_BIN" scripts/fetch-github-trending.mjs --skip-existing "$@" 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
"$NODE_BIN" scripts/generate-rss.mjs 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
"$NODE_BIN" scripts/build-search-index.mjs 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
