#!/usr/bin/env bash
set -euo pipefail

mode="${1:---all}"

run_frontend() {
  pnpm format:check
  pnpm build
}

run_backend() {
  (
    cd src-tauri
    cargo clippy -- -D warnings
    cargo test
  )
}

case "$mode" in
  --all)
    run_frontend
    run_backend
    ;;
  --fe)
    run_frontend
    ;;
  --be)
    run_backend
    ;;
  *)
    echo "Usage: scripts/test.sh [--all|--fe|--be]" >&2
    exit 2
    ;;
esac
