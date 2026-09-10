#!/usr/bin/env bash
# Rebuild (arch-pinned, see build.sh) then run the litesvm-based Rust test suite.
# No solana-test-validator involved — litesvm runs the program in-process.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
./scripts/build.sh
cargo test "$@"
