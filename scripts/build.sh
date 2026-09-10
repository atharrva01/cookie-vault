#!/usr/bin/env bash
# Wrapper so the program is always built for an SBF arch litesvm can load.
# `anchor build` defaults to --arch v3; litesvm can't load v3 binaries yet
# (fails with `InvalidAccountData` in `LiteSVM::add_program`). Discovered in Phase 0.
#
# --no-idl: Anchor's IDL-generation pass pulls in solana-syscalls 4.2.2 (via
# litesvm-token's own litesvm dependency), which requires a nightly compiler
# feature and fails to build on stable. The program itself is unaffected —
# this only skips IDL JSON output. KNOWN ISSUE, must be fixed before Phase 6
# (frontend needs target/idl/cookie_vault.json). See implementation_plan.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
anchor build --arch v1 --no-idl "$@"
