# Cookie Vault — Implementation Plan

Companion to `design_doc.md` (the *what/why*). This is the *how*, broken into phases you can build one at a time. No dates — each phase lists what gets built, the exact files/commands involved, and what to test before moving on.

**🚩 = something only you can do** (install something locally, fund a wallet, click through a browser extension, create an external account, post publicly). Everything else I can do directly.

Checked against this machine right now: Node 24.13.1, npm 11.8.0, git 2.34.1, gh 2.71.0 are present. **Rust, Cargo, Solana CLI, and Anchor CLI are not installed** — Phase 0 has to install all four before any program code can be written.

**Two things this plan got wrong before Phase 0 actually ran, corrected here once rather than in every phase below:**

1. **Local testing is Rust-native (`litesvm`), not TypeScript/Mocha against `solana-test-validator`.** The installed Anchor version (1.2.0) scaffolds tests as Rust integration tests under `programs/cookie-vault/tests/*.rs`, using the `litesvm` crate to run the compiled program in-process — no validator to spin up, no JS test harness, no `tests/cookie-vault.ts`. `Anchor.toml` even ships with `skip_local_validator = true`. This is strictly better for iteration speed (tests run in well under a second), but every phase below that mentions "Anchor's TS test harness" or a `.ts` test file means "a Rust `#[test]` in `programs/cookie-vault/tests/`" instead. The Anchor-generated TS *client* for the frontend (Phase 6+) is unaffected — IDL generation doesn't depend on which test framework is used.
2. **Every build must go through `./scripts/build.sh`, not bare `anchor build`.** `anchor build` defaults to `--arch v3` (the newest SBF instruction set); the `litesvm` version this scaffold pulls in can't load v3 binaries yet and fails with `InvalidAccountData` the moment a test tries to load the program. `./scripts/build.sh` pins `--arch v1`, which works. `./scripts/test.sh` rebuilds through that wrapper and then runs `cargo test`. **Always use the wrapper scripts, never call `anchor build`/`cargo test` directly** — a bare `anchor build` will silently produce a binary that breaks every test again.

---

## Phase 0 — Toolchain & repo scaffold

**Goal:** a git repo with an Anchor workspace that builds and runs its (empty) test suite locally, and a frontend workspace that runs `npm run dev`. Nothing chain-specific yet.

**Status: done.** What actually happened, since two things above didn't go as planned:

1. Rust (rustup, stable), the Solana CLI (Agave 3.1.10, via `release.anza.xyz`'s installer), `avm`, and Anchor CLI (1.2.0) are installed. The prebuilt Anchor binary `avm` first grabbed didn't run at all — `GLIBC_2.39' not found` (this machine is Ubuntu 22.04 / glibc 2.35, the prebuilt binary was compiled for a newer distro) — fixed with `avm install latest --from-source --force`, a ~5 minute rebuild. Also had to separately run `cargo build-sbf --tools-version v1.57 --install-only` for the SBF compiler backend, which `anchor build` doesn't install on its own.
2. `anchor init cookie-vault` (this Anchor version has no `--javascript` flag) scaffolded a workspace with a real difference from what this plan assumed: **tests are Rust, not TypeScript.** It generated `programs/cookie-vault/tests/test_initialize.rs` using the `litesvm` crate (an in-process SVM, not `solana-test-validator`), and `Anchor.toml` ships with `skip_local_validator = true`. See the corrected note above this phase — every later phase's testing description means "a Rust `#[test]`," not a `.ts` file.
3. **Discovered by the default scaffold test failing**: `anchor build` defaults to `--arch v3`, and the `litesvm` version pulled in can't load v3 binaries (`InvalidAccountData` on `svm.add_program(...)`). Fixed with `./scripts/build.sh` / `./scripts/test.sh`, which pin `--arch v1`. **Always use these wrapper scripts**, not bare `anchor build`/`cargo test`.
4. `Anchor.toml`'s `[toolchain]` table only supports `anchor_version`/`solana_version`/`package_manager` — there's no config-file way to pin the SBF arch, which is why the fix had to be a wrapper script rather than an Anchor.toml setting.
5. Repo hygiene — actual layout (differs slightly from what was sketched pre-Phase-0: tests live inside `programs/cookie-vault/`, not at repo root, and `error.rs` is singular per the scaffold's own convention):
   ```
   cookie-vault/
     Anchor.toml, Cargo.toml, rust-toolchain.toml
     scripts/build.sh, scripts/test.sh   # always use these, see above
     programs/cookie-vault/
       Cargo.toml
       src/                # lib.rs, state.rs, error.rs, constants.rs, instructions/  (Phase 1-4)
       tests/               # litesvm Rust tests (Phase 1-4)
     app/                   # frontend (Phase 6+, currently empty from anchor init)
     docs/
       submission.md, demo.md, x-thread.md, telegram.md   # written in Phase 10
     design_doc.md, implementation_plan.md
     README.md              # written last, in Phase 10
   ```
6. **GitHub repo created**: [github.com/atharrva01/cookie-vault](https://github.com/atharrva01/cookie-vault), public.
7. `.gitignore` at repo root: `/target`, `.anchor`, `test-ledger`, `node_modules`, `dist`, `.env`.

**Verified:** `./scripts/build.sh` succeeds; `./scripts/test.sh` runs the default scaffold test (litesvm-based) and passes; `anchor build` also generates `target/idl/cookie_vault.json`, confirming IDL generation works regardless of the test-framework surprise (this is what Phase 6+'s frontend TS client depends on).

---

## Phase 1 — Program skeleton: state + `initialize_vault`

**Goal:** `initialize_vault` works end-to-end in the `litesvm` test harness — deposit moves from a depositor's ATA into a PDA-owned vault ATA, vault state is readable. Time-lock condition only; milestone condition type exists in the enum but isn't exercised yet.

**Files:**
- `programs/cookie-vault/src/lib.rs` — program entrypoint, `declare_id!`, module wiring (replaces the scaffold's `counter`/`increment` demo)
- `programs/cookie-vault/src/state.rs` — `Vault`, `Milestone`, `ConditionType`, `MAX_MILESTONES`/`MAX_APPROVERS` constants (design doc §4.2, copied in verbatim — this is the one place the design doc's Rust is meant to be pasted near-as-is); replaces the scaffold's placeholder `Counter` struct
- `programs/cookie-vault/src/error.rs` — the `#[error_code] CookieVaultError` enum, one variant per row in design doc §4.4 (`InvalidCondition`, `TooEarly`, `TooManyMilestones`, etc. — all nine, even though only a few are reachable yet, so the enum doesn't get piecemeal edits across phases); replaces the scaffold's placeholder `ErrorCode` enum
- `programs/cookie-vault/src/instructions/initialize_vault.rs` — the `InitializeVault` accounts struct (depositor signer, vault PDA via `init` + seeds from §4.2, depositor ATA, vault ATA via `init`, mint, token program, associated token program, system program) and the handler
- `programs/cookie-vault/src/instructions/mod.rs` — re-exports

**Space accounting:** with `MAX_MILESTONES=10` and `MAX_APPROVERS=5` fixed (design doc §4.2), compute `Vault::INIT_SPACE` by hand or via Anchor's `#[derive(InitSpace)]` — using the derive is less error-prone than hand-counting bytes across `Vec<Milestone>` where each `Milestone` itself contains a `Vec<Pubkey>`, so default to the derive unless it doesn't support nested bounded vecs cleanly, in which case fall back to a manual constant with a comment showing the arithmetic.

**Instruction logic** (per design doc §4.3): validate condition-specific fields, CPI `transfer_checked` (not the legacy `transfer` — required for Token-2022 compatibility, which the design doc's "SPL Tokens, Token-2022" support claim in §0 depends on) from depositor ATA → vault ATA, set `approvers = [depositor]`, `threshold = 1`.

**Tests** (`programs/cookie-vault/tests/*.rs`, `litesvm`, run via `./scripts/test.sh`):
1. Happy path: initialize a time-lock vault, assert vault account fields match input, assert vault ATA balance equals deposited amount, assert depositor ATA balance decreased accordingly
2. `TooEarly`-adjacent validation: reject `unlock_timestamp` in the past
3. Milestone-amount-sum validation: reject a milestone vault whose amounts don't sum to `total_amount` (exercises the enum path even though claim/approve aren't built yet)
4. `TooManyMilestones`: reject more than `MAX_MILESTONES` entries

**Test before moving on:** all four tests above pass locally, `anchor build` has zero warnings.

**Status: done.** `state.rs`, `error.rs` (all nine variants from §4.4, not just the ones reachable yet), `constants.rs`, and `instructions/initialize_vault.rs` are written and replace the scaffold's counter/increment demo. `tests/initialize_vault.rs` has 5 passing tests — the 4 planned above, plus a milestone-vault happy path (added because the milestone branch of `initialize_vault` otherwise had no acceptance-path coverage, only its rejection paths). `cargo fmt --check` and `cargo clippy --tests` are both clean.

Three toolchain findings worth keeping in view for later phases:
- **This Anchor fork's `CpiContext::new` takes a `Pubkey` (the target program's ID), not an `AccountInfo`** — a real signature change from mainline Anchor. Every future CPI (`claim`, `approve_milestone`, `cancel_vault`) needs `ctx.accounts.token_program.key()`, not `.to_account_info()`.
- **`litesvm-token` is unusable here**: it forces `litesvm` from 0.10.0 to 0.16.0, whose `solana-bpf-loader-program` pin requires a nightly-only compiler feature and fails to build on stable. Test SPL setup (mint creation, ATAs, minting) is done by hand instead, using `spl-token-interface`/`spl-associated-token-account-interface` instruction-builders directly against `litesvm 0.10` — the shared helpers live in `tests/common/mod.rs` (`create_mint`, `create_ata_with_balance`, `submit`, `assert_error`, `warp_clock`, etc.) and every test file does `mod common; use common::*;` rather than reintroducing `litesvm-token` or copy-pasting setup per file.
- **IDL generation was broken, now fixed (resolved while starting Phase 6).** The root cause was exactly what it looked like in Phase 1: the IDL-build pass compiles dev-dependencies too, and `litesvm-token` (dropped in Phase 1) had been the thing pulling in the nightly-only `solana-syscalls`. Once that was gone, a *second*, unrelated issue surfaced: Anchor's `#[constant]` IDL-export macro has no IDL type mapping for `usize` (no fixed cross-platform width) and fails to compile against it. `MAX_MILESTONES`/`MAX_APPROVERS` in `constants.rs` were `usize`; changed to `u8` (both values fit trivially), with `as usize` casts added at the few use sites that need it (`#[max_len(...)]` itself took the `u8` const fine, no cast needed there). `scripts/build.sh` no longer needs `--no-idl` — `target/idl/cookie_vault.json` now generates on every build and lists all four instructions, `Vault`, and all nine errors correctly.

---

## Phase 2 — `claim` (time-lock path)

**Goal:** the full Flow A from design doc §3 works locally: create a time-locked vault, attempt early claim (fails with `TooEarly`), warp past unlock, claim succeeds, funds land in recipient's wallet.

**Files:**
- `programs/cookie-vault/src/instructions/claim.rs` — `Claim` accounts struct + handler for the `TimeLock` branch only (the `Milestone` branch is added in Phase 3, guarded by `condition_type` match — write the match arm now so Phase 3 is additive, not a rewrite)

**Instruction logic** (§4.3 + the §4.6 hardening already folded into the design doc):
- Signer must equal `vault.recipient` → `Unauthorized` otherwise
- `require!(!vault.cancelled, CookieVaultError::VaultCancelled)`
- `require!(Clock::get()?.unix_timestamp >= vault.unlock_timestamp.unwrap(), CookieVaultError::TooEarly)`
- Recipient ATA: `init_if_needed` (Bob may never have held this mint)
- CPI transfer signed by the vault PDA using its stored `bump` (`&[&[b"vault", depositor.key().as_ref(), recipient.key().as_ref(), &vault_id.to_le_bytes(), &[bump]]]`)
- `released_amount = total_amount` (time-lock claims everything at once), checked-add, not raw `+=`

**Tests:**
1. Claim before unlock → asserts the transaction fails with `TooEarly`
2. Advance the clock past `unlock_timestamp` — `litesvm`'s `LiteSVM` exposes `set_sysvar::<Clock>(...)` to set the `Clock` sysvar directly to any timestamp, no real waiting or slot-warping needed — and confirm claim succeeds
3. Double-claim after success → `AlreadyClaimed`
4. Wrong signer attempts claim → `Unauthorized`
5. Recipient with no prior ATA for the mint → claim still succeeds (`init_if_needed` path)

**Test before moving on:** all five pass; manually walk Flow A end-to-end in the test log and confirm it matches design doc §3 step by step.

**Status: done.** `instructions/claim.rs` handles the `TimeLock` branch; the `Milestone` match arm is stubbed to return `InvalidCondition` so Phase 3 only adds code, per the plan. Tests 1-5 above are all there (`tests/claim.rs`), plus 4 initialize-vault tests carried over — 9 passing total. Also used Anchor's `has_one = recipient` account constraint for the `Unauthorized` check instead of a manual `require!`, and an `address = vault.mint` constraint on the `mint` account so a client can't pass a mismatched mint — both cheaper and more idiomatic than hand-rolled checks, and consistent with how Anchor expects this to be written.

One more toolchain gotcha, same family as Phase 0-1's: **two transactions with byte-identical instructions submitted on the same blockhash collide** — `litesvm` (matching real Solana behavior) rejects the second as `AlreadyProcessed` before it ever reaches the program, which looks like a false pass/fail depending on what you're testing. The double-claim test needs `svm.expire_blockhash()` between the two submissions so the second transaction actually gets signature-distinct and reaches `claim`'s own `AlreadyClaimed` check. Same thing will matter in Phase 3/4 for `approve_milestone`'s duplicate-approval test and any other "do the same thing twice" test.

---

## Phase 3 — `approve_milestone` + milestone claim path

**Goal:** Flow B from design doc §3 (the differentiator) works locally end-to-end: three-milestone vault, approve-then-claim per milestone, partial balances stay locked correctly.

**Files:**
- `programs/cookie-vault/src/instructions/approve_milestone.rs` — new instruction
- `programs/cookie-vault/src/instructions/claim.rs` — fill in the `Milestone` match arm left stubbed in Phase 2

**`approve_milestone` logic** (§4.3, with the duplicate-approval guard from the design doc's §4.6-driven update):
- Signer must be in `vault.approvers` → `Unauthorized`
- `require!(!vault.cancelled, VaultCancelled)`
- `require!(!milestones[i].claimed, AlreadyClaimed)`
- `require!(!milestones[i].approved_by.contains(&signer), AlreadyApproved)`
- push signer to `approved_by`

**`claim`'s milestone branch:**
- `require!(milestone_index.is_some(), InvalidCondition)`, bounds-check the index
- `require!(milestones[i].approved_by.len() as u8 >= vault.threshold, NotApproved)`
- `require!(!milestones[i].claimed, AlreadyClaimed)`
- transfer `milestones[i].amount`, `released_amount = checked_add(milestones[i].amount)`, `milestones[i].claimed = true`

**Tests:**
1. Full Flow B: 1000/[250,250,500], approve+claim milestone 1, assert vault ATA balance dropped by exactly 250 and recipient got 250; repeat for 2 and 3; assert `released_amount` tracks correctly at each step
2. Claim milestone 2 before it's approved → `NotApproved`
3. Approve the same milestone twice with the same signer → `AlreadyApproved`
4. Double-claim milestone 1 → `AlreadyClaimed`
5. Claim milestone index out of range → error (bounds check)

**Test before moving on:** all pass; this is the point where the pitch ("programmable escrow, not a timelock") is actually demonstrable — worth manually narrating a full Flow B run in the terminal output as a sanity check before moving on, since this is the scene you'll later re-shoot for the X thread demo.

**Status: done.** Both pieces built exactly as scoped — `approve_milestone.rs` is new, `claim.rs`'s milestone branch filled in the stub left by Phase 2, no restructuring needed. `vault.approvers.contains(&approver)` stands in for `has_one` here since `approvers` is a `Vec`, not a single field — `has_one` only applies to single-`Pubkey` fields, so this is the correct manual check, not a shortcut. 15 tests passing total: the 5 planned above (`milestone_flow_end_to_end` covers #1 by looping all three tranches, not just milestone 1, and cross-checks that unclaimed milestones stay untouched at every step) plus a 6th added the same way Phase 1 added a milestone happy-path test — `approve_milestone` has its own bounds check on `milestone_index`, so it gets its own out-of-range test rather than relying on `claim`'s to stand in for it. The `expire_blockhash()` gotcha from Phase 2 showed up again exactly where expected (`approve_milestone_twice_by_same_signer_fails`, the second `claim` in the double-claim test) — no new toolchain surprises this phase.

---

## Phase 4 — `cancel_vault` + full §4.6 hardening pass

**Goal:** Flow C works; every box in design doc §4.6's pre-deploy checklist is a passing automated test, not a manual claim.

**Files:**
- `programs/cookie-vault/src/instructions/cancel_vault.rs` — new instruction

**Logic** (§4.3): signer must be `vault.depositor`; `require!(released_amount == 0, CancelAfterClaim)`; CPI remaining vault ATA balance back to depositor's ATA; `cancelled = true`.

**Tests — this phase is really "go through §4.6 and write the test that was missing":**
1. Cancel with zero claims → succeeds, depositor gets full balance back
2. Cancel after any claim (time-lock or one milestone) → `CancelAfterClaim`
3. Claim attempted on an already-cancelled vault → `VaultCancelled` (not a token-balance error — this is the exact bug the design doc's §4.3 update called out)
4. Approve attempted on a cancelled vault → `VaultCancelled`
5. Arithmetic overflow guard: construct a case that would overflow `u64` addition in `released_amount` and confirm it errors rather than wrapping (this mostly validates that `checked_add` was actually used everywhere, not `+=`)
6. `has_one` / signer-identity check: confirm someone who is neither depositor nor recipient nor an approver can't call any of the four instructions successfully against someone else's vault

**Test before moving on:** every checkbox in design doc §4.6 has a corresponding passing test. This is the last local-only phase — Phase 5 starts touching the real network.

**Status: done.** `cancel_vault.rs` matches the spec, plus one addition: it also guards `!vault.cancelled` at the top (not just `released_amount == 0`), so a second cancel on an already-cancelled vault fails clean with `VaultCancelled` instead of attempting a pointless zero-balance transfer — added a `double_cancel_fails` test for it. 24 tests passing across the whole suite now.

Two things worth recording about how items 5 and 6 actually turned out:
- **Item 5 (overflow guard) couldn't be built as an integration test, and that's a good sign, not a gap.** `initialize_vault` requires milestone amounts to sum to exactly `total_amount`, and each milestone/time-lock release can only be claimed once — so `released_amount`'s running total is structurally bounded by `total_amount <= u64::MAX` through every real instruction path. There's no sequence of legitimate transactions that overflows it. Rather than fake an integration scenario, this became a small `#[cfg(test)]` unit test next to the arithmetic in `claim.rs`, documenting *why* `checked_add` is still correct as defense-in-depth even though the invariant already makes overflow unreachable.
- **Item 6 surfaced a real Anchor ordering fact**: account *existence* is validated for every field before any relational constraint (`has_one`, `address = ...`) runs, regardless of struct declaration order. `cancel_vault_wrong_signer_fails` originally failed with `AccountNotInitialized` instead of `Unauthorized` because the impostor's token account didn't exist yet — not a bug, but it meant the test wasn't actually isolating the `has_one` check it was supposed to prove. Fixed by pre-creating the impostor's (empty) ATA first. Worth remembering for any future "wrong signer" test: every account referenced in the struct needs to actually exist, or you'll test account-existence instead of authorization by accident. Added a `create_ata` helper (creates, doesn't mint) to `tests/common/mod.rs` for this — `create_ata_with_balance` assumes the payer is also the mint authority, which isn't true for an impostor keypair.
- Also closed a real gap from Phase 3 while doing this pass: `approve_milestone` never had a wrong-signer test. Added `approve_milestone_wrong_signer_fails` to `tests/approve_milestone.rs`.

This is the last phase that only touches `litesvm` — Phase 5 is the first real-network step.

---

## Phase 5 — First live deploy to Cookie Chain

**Goal:** the program (unchanged from Phase 4) is deployed to Cookie Chain mainnet at `rpc.cookiescan.io`, with a known program ID recorded for the submission form.

1. **🚩 Deploy wallet + funding.** Generate a fresh deploy keypair (`solana-keygen new`) — I can do the generation, but you need to fund it with real COOK before `anchor deploy` will work (program deploys cost real, if small, COOK per the bounty listing's "~$0.05" claim). Per design doc §8, that means **bridging COOK from Solana via Cookie Chain's Hyperlane bridge (`hyperlane.cookiescan.io`) ahead of time** — this is a real-money, external-site action only you can do. Tell me the deploy wallet's public key once generated and I'll wait for it to show a balance before deploying.
2. Point `Anchor.toml`'s `[provider]` at `cluster = "https://rpc.cookiescan.io"`.
3. `anchor deploy` — record the resulting program ID in `docs/submission.md` immediately (design doc §8's explicit requirement).
4. Re-run a **minimal** live smoke test (one `initialize_vault` + one `claim`, using small real amounts) directly against the deployed program — not the full Phase 1-4 suite, since every live transaction costs real COOK. This is the only place in the whole plan where tests intentionally run against the live network instead of local.
5. **🚩 Nightly extension.** If not already installed in your browser, install it now (before Phase 6) and configure it for Cookie Chain per `docs.cookiechain.wtf` — you'll need it constantly from here on to actually click through flows.

**Test before moving on:** one successful live `initialize_vault` + `claim` round trip, visible on `cookiescan.io`, program ID recorded.

**Status: paused, blocked on step 1.** Deploy wallet generated (`9WNZiPLk8z6QGhBSMKRhtetWtEgAycivDsjBFmZJxhqk`, at `~/.config/solana/cookie-vault-deploy.json`), still at 0 balance — bridging COOK to it is a real-money action only doable by hand at `hyperlane.cookiescan.io`, and turns out to require first acquiring sCOOK on Solana (a separate SPL token, not SOL itself) before bridging it 1:1 to cCOOK. Rather than block on that, **Phases 6+ proceed now, out of order** — the program's on-chain address (`declare_id!`, currently `35GMkSwvDYLk1FYjXcMBp2PosgkYCQVFPByAsvEm9147`) is fixed by the program's own keypair, not by whichever wallet eventually pays for and signs the deploy, so the frontend can be fully wired against the real program ID and the real IDL (now generating correctly, see Phase 1's amended note above) without waiting for that ID to actually be live. What genuinely can't happen until Phase 5 actually completes: submitting a real transaction from a browser and seeing it land on `cookiescan.io`. Come back and finish Phase 5's remaining steps (2-5) once the wallet is funded.

---

## Phase 6 — Frontend foundation

**Goal:** `npm run dev` serves a page that connects Nightly (and any other Wallet Standard wallet), shows the connected address + COOK balance, and has the Anchor IDL client wired up — no vault-specific UI yet.

**Scaffold** (`app/`, Vite + React + TS, matching design doc §5's now-specific stack choice):
```
npm create vite@latest app -- --template react-ts
cd app
npm install @solana/web3.js @wallet-standard/app @wallet-standard/base bs58 buffer
npm install -D vite-plugin-node-polyfills
```
(deliberately *not* installing `@solana/wallet-adapter-react` / `-react-ui` — see design doc §5's updated rationale)

**Files:**
- `app/src/lib/chain.ts` — RPC URL constant, Cookie Chain genesis hash, `addressUrl`/`txUrl` helpers for CookieScan links (same shape as PayJar's `chain.ts`, reviewed in Phase-0 research)
- `app/src/lib/wallet.ts` — thin wrapper over `@wallet-standard/app`: `listSolanaWallets`, `connectWallet`, `disconnectWallet`, `signWithWallet`, wallet-error-to-plain-English mapping
- `app/src/components/WalletContext.tsx` — React context/provider modeled on the reviewed PayJar pattern: wallet list, connected wallet/account, silent-reconnect-to-last-wallet via `localStorage`, account-change subscription
- `app/src/components/WalletButton.tsx` — custom-styled connect button + wallet picker (this is the component that replaces the generic wallet-adapter modal — worth spending real design attention here since it's the first thing a judge sees)
- `app/src/index.css` — the `:root` design-token system from design doc §5 (bg/card/accent/text/muted/radius/shadow + dark-mode override), plus a chosen webfont pairing
- `app/src/lib/idl.ts` — imports the Anchor-generated IDL JSON (copied from `target/idl/cookie_vault.json` after `anchor build`) and constructs the typed `Program` client
- `app/src/lib/program.ts` — thin wrapper functions (`initializeVault(...)`, `claim(...)`, `approveMilestone(...)`, `cancelVault(...)`, `fetchVault(pda)`) around the generated client, so pages never touch raw Anchor calls directly

**🚩 One decision needed from you:** pick the webfont pairing and accent color direction for the design tokens (e.g. warm/bakery-toned like PayJar, or a distinct identity — cool/technical tone fits an "escrow primitive" positioning arguably better than a bakery palette, but it's a taste call). I'll default to a cool slate/blue-accent palette with Inter + JetBrains Mono if you don't have a preference, but flagging it since it's the one purely aesthetic choice in this phase.

**Test before moving on:** connect Nightly in the browser, see real address + live COOK balance pulled from `rpc.cookiescan.io`; disconnect/reconnect persists across a page reload.

---

## Phase 7 — Create Vault flow

**Goal:** Screen 2 from design doc §5 — a working form that calls `initialize_vault` on the deployed program, with the DAS-powered asset resolution from design doc §5.1.

**Files:**
- `app/src/lib/das.ts` — `resolveMint(mintAddress): Promise<{name, symbol, decimals, logoUri} | null>` against Cookie's DAS API
- `app/src/pages/CreateVault.tsx` — the form: asset (DAS-resolved), amount (human units, converted via resolved `decimals` before calling the program), recipient address, condition type radio, condition-specific fields (date picker for time-lock; repeatable amount-row UI for milestones, capped client-side at `MAX_MILESTONES` to match the program constant)
- `app/src/components/TxStatus.tsx` — the four-state status component (building → awaiting signature → submitted → confirmed/failed) from design doc §5's "Transaction status handling", with the §4.4 error table mapped to plain-language strings here

**Test before moving on:** create a real time-lock vault and a real milestone vault against the live Phase-5 deployment from the browser, both succeed, both show up correctly in `cookiescan.io`, and deliberately trigger at least one on-chain error (e.g. milestone amounts not summing to total) to confirm the plain-language error surfaces correctly instead of a raw code.

---

## Phase 8 — My Vaults + Vault Detail

**Goal:** Screens 3 and 4 from design doc §5 — anyone can inspect a vault's on-chain state, and the connected wallet can claim/approve when it's their turn.

**Files:**
- `app/src/pages/MyVaults.tsx` — fetches all `Vault` accounts via `program.account.vault.all()` filtered by `depositor == pubkey OR recipient == pubkey` (Anchor `memcmp` filters on those two fixed-offset fields), renders as a list
- `app/src/pages/VaultDetail.tsx` — full state render: per-milestone table (amount/approved-by/claimed), the single claim-or-approve button relevant to the connected wallet's role relative to `vault.depositor`/`vault.recipient`/`vault.approvers`, raw PDA + program ID shown via the `AddressLink`-style primitive (design doc §5 UI primitives, borrowed pattern from the reviewed PayJar `ui.tsx`)
- `app/src/components/ui.tsx` — small reusable primitives: `CopyButton`, `CopyField`, `AddressLink`, `TxLink` (same shapes as the reviewed pattern)

**Test before moving on:** open a vault detail page as depositor (see "Approve Milestone" only), reload as recipient (see "Claim" only, disabled/explained until approved), confirm the raw on-chain data shown matches what `anchor test`/CookieScan report independently.

---

## Phase 9 — Should-have features (build only if Phases 1-8 are solid)

Each of these is independent — build whichever fit, skip the rest without blocking submission:

- **Cancel UI** (Flow C) — button on Vault Detail for the depositor, only enabled per the `released_amount == 0` rule already enforced on-chain
- **Activity feed** — `getSignaturesForAddress` on the vault PDA + CookieScan API, chronological create/approve/claim/cancel log
- **Analytics panel** — TVL across all vaults, vault count, claim rate; dependency-free inline SVG bar chart (per design doc §6's updated choice, matching the Cookie Tab pattern rather than pulling in a charting library)
- **USD-value context** — CookieScan price feed on Vault Detail
- **`.cook` name resolution for the recipient field** — the one competitor feature (PayJar's CookOven integration) worth optionally matching: let the recipient field accept `bob.cook` and resolve it via CookOven's PDA read, falling back to a raw address. Purely a UX nicety, not required — cut first if time is short.
- **Mock/demo mode** — a `?mock=1` URL flag that fakes wallet + RPC responses for UI iteration without a funded wallet (the one dev-experience trick from Cookie Tab worth borrowing even though it doesn't touch the bounty checklist — useful for demoing without spending COOK on every click)

---

## Phase 10 — Deployment, README, and submission

1. **🚩 Hosting.** Deploy `app/` (static Vite build) to Vercel or Netlify — needs you to connect a GitHub account/repo to whichever host you prefer (or hand me a project/API token scoped for it, if you'd rather I drive it via CLI).
2. `README.md` at repo root: architecture summary (can lean heavily on design_doc.md §1, §4.5, §10), setup instructions (`./scripts/test.sh` for the litesvm test flow from Phase 0-4, frontend `npm run dev`), deployed program ID + live URL, explicit roadmap note on the multi-sig extension path (design doc §2's "explicitly out of scope" framing, stated as intentional honesty per §10).
3. Fill in `docs/submission.md` with every field the Superteam Earn submission form asks for (live URL, GitHub repo, program address) — draft it as the single source of truth before pasting into the form.
4. `docs/demo.md` → script the exact click-path for the demo (create a time-lock vault, create a milestone vault, approve, claim, show the on-chain state at each step) — this becomes both a personal rehearsal script and the shot list for the X thread.
5. **🚩 X (Twitter) thread.** I can draft the full thread text in `docs/x-thread.md` (walkthrough + Cookie Chain Bridge guide link, per the bounty's explicit demo requirement) — posting it is on your account, so that step is yours.
6. **🚩 Telegram share.** Same — I can draft `docs/telegram.md`, but posting into the Cookie Chain Telegram community is the final submission step and has to come from you.
7. Final pass: `git status` clean, no stray files (worth double-checking — one of the five reviewed competitor repos shipped a junk file named `)` at its root from a botched command, harmless but sloppy), confirm `.env`/keypairs are gitignored and never committed.

---

## Summary of 🚩 items, in the order you'll hit them

1. Confirm the Rust/Solana/Anchor install approach (Phase 0)
2. Confirm the GitHub repo name/account before I create it (Phase 0)
3. Generate + fund the deploy wallet with real bridged COOK (Phase 5)
4. Install/configure the Nightly browser extension for Cookie Chain (Phase 5)
5. Pick (or delegate to me) the visual identity direction — palette/fonts (Phase 6)
6. Pick a hosting provider and connect it, or hand me a deploy token (Phase 10)
7. Post the X thread from your account (Phase 10)
8. Post the Telegram share from your account (Phase 10)
