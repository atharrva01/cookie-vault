#!/usr/bin/env bash
# Wrapper so the program is always built for an SBF arch litesvm can load.
# `anchor build` defaults to --arch v3; litesvm 0.10.x can't load v3 binaries yet
# (fails with `InvalidAccountData` in `LiteSVM::add_program`). Discovered in Phase 0.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
anchor build --arch v1 "$@"
