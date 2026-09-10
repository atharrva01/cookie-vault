# Cookie Vault — Implementation Plan

Companion to `design_doc.md` (the *what/why*). This is the *how*, broken into phases you can build one at a time. No dates — each phase lists what gets built, the exact files/commands involved, and what to test before moving on.

**🚩 = something only you can do** (install something locally, fund a wallet, click through a browser extension, create an external account, post publicly). Everything else I can do directly.

Checked against this machine right now: Node 24.13.1, npm 11.8.0, git 2.34.1, gh 2.71.0 are present. **Rust, Cargo, Solana CLI, and Anchor CLI are not installed** — Phase 0 has to install all four before any program code can be written.

---

## Phase 0 — Toolchain & repo scaffold

**Goal:** a git repo with an Anchor workspace that builds and runs its (empty) test suite locally, and a frontend workspace that runs `npm run dev`. Nothing chain-specific yet.

1. **🚩 Rust + Solana CLI + Anchor install.** This is a multi-step, multi-minute install (rustup, then Solana CLI via its install script, then `avm install latest` for Anchor) that changes your shell PATH and pulls binaries from the internet. I'll run it when you say go, but flagging it up front since it's not a quick `apt install` — want me to proceed with the standard install sequence (rustup.rs → Solana's official install script → `cargo install avm` → `avm install latest && avm use latest`), or do you already have a preferred install method (e.g. via a version manager you use for other projects)?
2. Once the toolchain is confirmed (`anchor --version`, `solana --version` both resolve), scaffold the Anchor workspace:
   ```
   anchor init cookie-vault --javascript=false
   ```
   This creates `Anchor.toml`, `Cargo.toml`, `programs/cookie-vault/src/lib.rs`, `tests/cookie-vault.ts`, and a `migrations/` folder.
3. Point Anchor at a **local validator** for all iteration (per design doc §8 — no faucet exists on Cookie Chain, so nothing touches the live RPC until Phase 5):
   - `Anchor.toml` → `[provider] cluster = "localnet"`
   - Confirm `solana-test-validator` runs (`solana-test-validator --version`)
4. Repo hygiene, modeled on the cleanest of the five reviewed competitor repos (CookieLens):
   ```
   cookie-vault/
     programs/cookie-vault/src/...   # Anchor program (Phase 1-4)
     tests/                          # Anchor TS test harness (Phase 1-4)
     app/                            # frontend (Phase 6+)
     docs/
       submission.md                 # bounty submission form answers, kept in sync
       demo.md                       # script for the X thread demo walkthrough
       x-thread.md                   # drafted thread text before posting
       telegram.md                   # drafted Telegram share text before posting
     design_doc.md                   # already exists
     implementation_plan.md          # this file
     README.md                       # written last, in Phase 10
   ```
5. `git init`, first commit. **🚩 GitHub repo**: the bounty requires a public open-source repo — I can create one with `gh repo create` once you tell me the repo name and whether it goes under your personal account or elsewhere, and confirm you want it created (this is a public, externally-visible action, so I'll wait for an explicit go-ahead rather than assume).
6. `.gitignore`: `target/`, `.anchor/`, `node_modules/`, `dist/`, `.env`, test-ledger artifacts.

**Test before moving on:** `anchor build` succeeds on the untouched scaffold; `anchor test` runs the default scaffold test against a local validator and passes.

---

## Phase 1 — Program skeleton: state + `initialize_vault`

**Goal:** `initialize_vault` works end-to-end against `solana-test-validator` — deposit moves from a depositor's ATA into a PDA-owned vault ATA, vault state is readable. Time-lock condition only; milestone condition type exists in the enum but isn't exercised yet.

**Files:**
- `programs/cookie-vault/src/lib.rs` — program entrypoint, `declare_id!`, module wiring
- `programs/cookie-vault/src/state.rs` — `Vault`, `Milestone`, `ConditionType`, `MAX_MILESTONES`/`MAX_APPROVERS` constants (design doc §4.2, copied in verbatim — this is the one place the design doc's Rust is meant to be pasted near-as-is)
- `programs/cookie-vault/src/errors.rs` — the `#[error_code] CookieVaultError` enum, one variant per row in design doc §4.4 (`InvalidCondition`, `TooEarly`, `TooManyMilestones`, etc. — all nine, even though only a few are reachable yet, so the enum doesn't get piecemeal edits across phases)
- `programs/cookie-vault/src/instructions/initialize_vault.rs` — the `InitializeVault` accounts struct (depositor signer, vault PDA via `init` + seeds from §4.2, depositor ATA, vault ATA via `init`, mint, token program, associated token program, system program) and the handler
- `programs/cookie-vault/src/instructions/mod.rs` — re-exports

**Space accounting:** with `MAX_MILESTONES=10` and `MAX_APPROVERS=5` fixed (design doc §4.2), compute `Vault::INIT_SPACE` by hand or via Anchor's `#[derive(InitSpace)]` — using the derive is less error-prone than hand-counting bytes across `Vec<Milestone>` where each `Milestone` itself contains a `Vec<Pubkey>`, so default to the derive unless it doesn't support nested bounded vecs cleanly, in which case fall back to a manual constant with a comment showing the arithmetic.

**Instruction logic** (per design doc §4.3): validate condition-specific fields, CPI `transfer_checked` (not the legacy `transfer` — required for Token-2022 compatibility, which the design doc's "SPL Tokens, Token-2022" support claim in §0 depends on) from depositor ATA → vault ATA, set `approvers = [depositor]`, `threshold = 1`.

**Tests** (`tests/cookie-vault.ts`, Anchor's Mocha/Chai TS harness against the local validator):
1. Happy path: initialize a time-lock vault, assert vault account fields match input, assert vault ATA balance equals deposited amount, assert depositor ATA balance decreased accordingly
2. `TooEarly`-adjacent validation: reject `unlock_timestamp` in the past
3. Milestone-amount-sum validation: reject a milestone vault whose amounts don't sum to `total_amount` (exercises the enum path even though claim/approve aren't built yet)
4. `TooManyMilestones`: reject more than `MAX_MILESTONES` entries

**Test before moving on:** all four tests above pass locally, `anchor build` has zero warnings.

---

## Phase 2 — `claim` (time-lock path)

**Goal:** the full Flow A from design doc §3 works locally: create a time-locked vault, attempt early claim (fails with `TooEarly`), warp the local validator's clock past unlock, claim succeeds, funds land in recipient's wallet.

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
2. Advance the local validator's clock past `unlock_timestamp` (Anchor's local-validator test harness supports warping via `BanksClient` or, for `solana-test-validator`, via a short `sleep` with a near-future timestamp in the fixture — pick whichever the scaffold's test setup gives you) and claim succeeds
3. Double-claim after success → `AlreadyClaimed`
4. Wrong signer attempts claim → `Unauthorized`
5. Recipient with no prior ATA for the mint → claim still succeeds (`init_if_needed` path)

**Test before moving on:** all five pass; manually walk Flow A end-to-end in the test log and confirm it matches design doc §3 step by step.

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

---

## Phase 5 — First live deploy to Cookie Chain

**Goal:** the program (unchanged from Phase 4) is deployed to Cookie Chain mainnet at `rpc.cookiescan.io`, with a known program ID recorded for the submission form.

1. **🚩 Deploy wallet + funding.** Generate a fresh deploy keypair (`solana-keygen new`) — I can do the generation, but you need to fund it with real COOK before `anchor deploy` will work (program deploys cost real, if small, COOK per the bounty listing's "~$0.05" claim). Per design doc §8, that means **bridging COOK from Solana via Cookie Chain's Hyperlane bridge (`hyperlane.cookiescan.io`) ahead of time** — this is a real-money, external-site action only you can do. Tell me the deploy wallet's public key once generated and I'll wait for it to show a balance before deploying.
2. Point `Anchor.toml`'s `[provider]` at `cluster = "https://rpc.cookiescan.io"`.
3. `anchor deploy` — record the resulting program ID in `docs/submission.md` immediately (design doc §8's explicit requirement).
4. Re-run a **minimal** live smoke test (one `initialize_vault` + one `claim`, using small real amounts) directly against the deployed program — not the full Phase 1-4 suite, since every live transaction costs real COOK. This is the only place in the whole plan where tests intentionally run against the live network instead of local.
5. **🚩 Nightly extension.** If not already installed in your browser, install it now (before Phase 6) and configure it for Cookie Chain per `docs.cookiechain.wtf` — you'll need it constantly from here on to actually click through flows.

**Test before moving on:** one successful live `initialize_vault` + `claim` round trip, visible on `cookiescan.io`, program ID recorded.

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
2. `README.md` at repo root: architecture summary (can lean heavily on design_doc.md §1, §4.5, §10), setup instructions (local validator flow from Phase 0-4, frontend `npm run dev`), deployed program ID + live URL, explicit roadmap note on the multi-sig extension path (design doc §2's "explicitly out of scope" framing, stated as intentional honesty per §10).
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
