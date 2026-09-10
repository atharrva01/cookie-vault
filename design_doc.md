# Cookie Vault — Design Doc

**Programmable token escrow and vesting for Cookie Chain**
Submission for: "Create an App on Cookie Chain" (Superteam Earn bounty)

---

## 1. Problem & Positioning

Cookie Chain's bounty asks for a web app that demonstrates "meaningful on-chain interaction." Looking at the public submission comments, the field is dominated by five shapes of project:

- Trading/analytics terminals (Cookie Pulse, Cookie Radar)
- AI-agent-plus-analytics tools (CookieAI Hub)
- Payment link / receipt apps (PayJar, CookiePay Receipts)
- Token launchers (Cookie Bakery)
- Games (Cookie Clicker–style idle games)

All of these are, structurally, **frontends wrapped around programs and APIs someone else already wrote** (Cookiebox, Cookieswap, CookieScan, DAS). That's a reasonable strategy, but it means the differentiator is UI polish, not engineering depth.

**Confirmed by reading five actual submissions' source** (PayJar, CookieLens, CookieLogix, Cookie Receipts, Cookie Tab — all public repos): every one of them is backend-less and program-less. They route real value through the stock Solana **Memo Program** (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`) plus native/SPL transfers, and reconstruct app state client-side by re-reading transaction history and parsing memo strings — no custom on-chain program, no PDA-owned custody, no on-chain condition logic. Their frontends are genuinely well-crafted (see §5 for what specifically makes them not look like generic templates), but the *program layer* differentiation this doc is built around is real and, as of this sample, unclaimed.

Cookie Vault is different in kind: it **is** the on-chain program. It's a financial primitive — programmable escrow that releases funds under a condition — not a viewer or a wrapper. The pitch to a judge:

> "I built an on-chain payments primitive on Cookie Chain, not another dashboard."

### Real-world framing

The motivating use case is contributor/contractor payouts — the exact thing bounty platforms like Superteam themselves need:

```
1,000 COOK total, paid to a contributor as they hit milestones
  250 COOK → milestone 1 (design approved)
  250 COOK → milestone 2 (implementation done)
  500 COOK → final milestone (shipped)
```

The payer locks the full amount up front (recipient has certainty the funds exist and can't be pulled), and the recipient claims each tranche as it's approved (payer keeps control over releasing money for incomplete work). Neither party has to trust the other's promises — the program enforces it.

---

## 2. Scope

### Must-have (MVP — this is what "done" means)

1. Create a vault: depositor specifies asset, amount, recipient, and a release condition
2. Deposit — tokens move from depositor's wallet into on-chain custody at creation time
3. Time-lock condition — funds unlock at/after a given timestamp
4. Recipient claim — recipient withdraws once the condition is satisfied
5. On-chain state is inspectable — anyone can view a vault's status (locked/claimed/amount/condition)
6. Transaction status UI — pending → confirmed/failed, with real error messages
7. **Cookie DAS integration** — the Create Vault form resolves the chosen mint through Cookie's DAS API (name, symbol, decimals, logo) instead of asking the user to trust a raw base58 address. This is the direct, cheap way to satisfy the bounty's explicit "utilize existing Cookie Chain programs... for tokenized assets" requirement without diluting the core pitch — see §5.1.
8. Clean, minimal frontend for all of the above

### Should-have (build if MVP lands with time to spare)

9. Multiple vaults per user, listed in one view
10. Vault activity/history feed (created, approved, claimed events) — pulled from CookieScan's API
11. Cancel/refund — depositor reclaims unreleased funds under safe conditions
12. Basic analytics (total value locked, vaults created, claim rate)
13. USD-value context on Vault Detail via CookieScan price data (market color, not required)

### The one differentiator (this is what makes the pitch work)

14. **Milestone-based release** — a vault can hold N tranches, each independently unlockable, instead of only "unlock everything on date X." This is what turns "a token timelock" (seen before, boring) into "programmable escrow" (a primitive).

### Explicitly out of scope for this bounty (and why)

- **True M-of-N multi-signature approval.** Real multi-sig needs a signer registry, per-signer approval tracking, and replay protection — a sub-project on its own, and the riskiest thing to attempt with zero prior Rust experience under a few-day budget. Instead: the approval mechanism is generalized from day one (see §4) so it's a config change, not a rewrite, to go from 1-of-1 to M-of-N later. The README states this explicitly as a roadmap item — honest framing beats a shaky half-built feature.
- **Oracle-driven milestone verification** (e.g., auto-detecting "the code shipped"). Milestone completion is attested by a human approver signing a transaction, not inferred from external data. Simpler, and it's the correct trust model for the payments use case anyway — someone reviews the work and approves it.
- **Cross-chain functionality.** Cookie Vault operates purely on Cookie Chain; bridging is out of scope.

---

## 3. User Flows

### Flow A — Time-locked vault
1. Alice connects her wallet (Nightly), goes to "Create Vault"
2. She selects asset = COOK (resolved via Cookie DAS — name/symbol/logo auto-fill instead of a raw mint address), amount = 1,000, recipient = Bob's address, condition = Time Lock, unlock date = Sept 30, 2026
3. She signs the transaction → 1,000 COOK moves from her wallet into the vault's custody account
4. Bob can see the vault (via his wallet's "Vaults" view, or a shared link) showing "Locked until Sept 30, 2026"
5. After Sept 30, Bob clicks "Claim" → signs → 1,000 COOK moves to his wallet
6. Attempting to claim before Sept 30 fails client-side and would fail on-chain too, with a clear error

### Flow B — Milestone vault (the killer feature)
1. Alice creates a vault: 1,000 COOK, recipient = Bob, condition = Milestones: [250, 250, 500]
2. All 1,000 COOK moves into custody immediately
3. When milestone 1 is done, Alice calls "Approve Milestone 1" (signs a transaction)
4. Bob can now claim 250 COOK (and only 250 — the other 750 stay locked)
5. Repeat for milestones 2 and 3
6. The vault's on-chain state always shows: total, released-so-far, and per-milestone approved/claimed status

### Flow C — Cancel (should-have)
1. If a vault has zero milestones claimed (or is past a cancellation window), the depositor can cancel and reclaim the full unclaimed balance
2. Prevents funds being permanently stuck if a deal falls through before any work is delivered

---

## 4. On-Chain Program Design (Anchor / Rust)

### 4.1 Why Anchor, why these constructs

Anchor is the standard framework for Solana-family (SVM) programs — it handles serialization, account validation, and PDA derivation with far less boilerplate than raw native Solana programs. Since Cookie Chain advertises itself as SVM-compatible with "familiar SVM tooling," standard Anchor + Solana CLI workflows should work by simply pointing the config at Cookie Chain's RPC (`rpc.cookiescan.io`) instead of Solana's.

**PDA (Program Derived Address):** an account address that isn't controlled by a private key — it's deterministically derived from seeds and only your program can "sign" for it. This is exactly what you need for a vault: the vault's token account must be controlled by *the program's logic*, not by Alice or Bob individually, otherwise either party could unilaterally move the funds. This is the mechanism that makes escrow trustless rather than just a UI convention.

### 4.2 Account structure

**Vault account (PDA)**
Seeds: `["vault", depositor_pubkey, recipient_pubkey, vault_id]`
(`vault_id` is a small integer/nonce so the same two parties can open multiple vaults.)

Anchor accounts have fixed space, allocated at `init` time — `Vec` fields need a hard cap so `space` can be computed up front, otherwise the account can't be sized. Fixed caps here: `MAX_MILESTONES = 10`, `MAX_APPROVERS = 5` (already generous for the future multi-sig extension in §4.5).

```rust
pub const MAX_MILESTONES: usize = 10;
pub const MAX_APPROVERS: usize = 5;

#[account]
pub struct Vault {
    pub depositor: Pubkey,          // who funded it
    pub recipient: Pubkey,          // who can claim
    pub mint: Pubkey,                // which token (COOK or any SPL token)
    pub vault_id: u64,               // nonce, lets one pair open multiple vaults
    pub condition_type: ConditionType,
    pub total_amount: u64,
    pub released_amount: u64,
    pub unlock_timestamp: Option<i64>,     // used when condition_type = TimeLock
    pub milestones: Vec<Milestone>,        // used when condition_type = Milestone, capped at MAX_MILESTONES
    pub approvers: Vec<Pubkey>,            // who can approve a milestone — [depositor] for MVP, capped at MAX_APPROVERS
    pub threshold: u8,                     // approvals needed — 1 for MVP, >1 = future multi-sig
    pub cancelled: bool,
    pub bump: u8,                          // PDA bump seed, needed to re-derive/sign
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone {
    pub amount: u64,
    pub approved_by: Vec<Pubkey>,   // who has signed off so far, capped at MAX_APPROVERS
    pub claimed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ConditionType {
    TimeLock,
    Milestone,
}
```

**Vault token account** — an Associated Token Account (ATA) owned by the Vault PDA (not by a person). This is where the actual tokens live in custody — the `Vault` struct above is just the metadata/state describing the rules; the ATA is the money.

### 4.3 Instructions

**`initialize_vault(vault_id, mint, recipient, condition_type, unlock_timestamp: Option<i64>, milestone_amounts: Option<Vec<u64>>)`**
- Creates the Vault PDA and its associated token account
- Validates: if `TimeLock`, `unlock_timestamp` must be provided and in the future; if `Milestone`, `milestone_amounts` must sum to the deposited `total_amount`, have at least 1 entry, and at most `MAX_MILESTONES` entries
- CPI (cross-program invocation) transfers `total_amount` of `mint` from the depositor's ATA into the vault's ATA
- Sets `approvers = [depositor]`, `threshold = 1` (extensibility point for future multi-sig)

**`approve_milestone(milestone_index: u8)`**
- Signer must be in `vault.approvers`
- Guard: `!vault.cancelled`, milestone not already claimed
- Guard: signer must not already be in `milestones[milestone_index].approved_by` — without this check, a single approver could push their own address in twice and (once `threshold > 1` exists under future multi-sig) inflate the count on their own; cheap to add now, and it's the kind of gap that's invisible at `threshold = 1` but becomes a real bypass the moment multi-sig ships, so it belongs in the MVP code even though it can't be exploited yet
- Appends signer to `milestones[milestone_index].approved_by`
- If `approved_by.len() >= threshold`, the milestone becomes claimable (checked at claim time, not stored as a separate boolean, to avoid two sources of truth)

**`claim(milestone_index: Option<u8>)`**
- Signer must be `vault.recipient`
- Guard: `!vault.cancelled` — without this, a cancelled vault whose refund CPI already emptied the vault ATA would still let `claim` be called; it would fail at the token-transfer level (insufficient balance) rather than with a clear `VaultCancelled` error, so check it explicitly for a correct error message
- If `condition_type == TimeLock`: require `Clock::get()?.unix_timestamp >= vault.unlock_timestamp`; transfer full `total_amount - released_amount`
- If `condition_type == Milestone`: require `milestone_index` provided, that milestone's `approved_by.len() >= threshold`, and not already claimed; transfer that milestone's `amount`
- Recipient's ATA is created on demand (`init_if_needed`) rather than assumed to exist — Bob may never have held this mint before
- CPI transfers from vault ATA → recipient's ATA (signed by the PDA using its stored `bump`, since the PDA itself "signs" — this is the core trustless mechanic)
- Updates `released_amount` and marks the milestone claimed

**`cancel_vault()`**
- Signer must be `vault.depositor`
- Guard: only allowed if `released_amount == 0` (nothing claimed yet) — keeps the safety logic simple for the MVP rather than reasoning about partial-claim edge cases
- CPI transfers remaining vault balance back to depositor's ATA
- Marks `cancelled = true`

### 4.4 Error handling (on-chain)

Custom Anchor errors, each mapped to a clear frontend message:

| Error | Trigger |
|---|---|
| `InvalidCondition` | Milestone amounts don't sum to total, or missing required field for the chosen condition type |
| `TooEarly` | Claim attempted before `unlock_timestamp` |
| `NotApproved` | Claim attempted on a milestone below its approval threshold |
| `AlreadyClaimed` | Double-claim attempt on the same milestone/timelock |
| `AlreadyApproved` | Signer attempts to approve a milestone they've already approved |
| `Unauthorized` | Wrong signer (not the recipient trying to claim, not an approver trying to approve, not the depositor trying to cancel) |
| `CancelAfterClaim` | Cancel attempted after any funds already released |
| `VaultCancelled` | Claim or approve attempted on a cancelled vault |
| `TooManyMilestones` | `milestone_amounts` exceeds `MAX_MILESTONES` at creation |

### 4.5 Why this design is safe by construction

- Funds are never held by a person's keypair — only by the PDA, which only the program's own instruction logic can move. No admin backdoor, no "trust me" step.
- `released_amount` and per-milestone `claimed` flags prevent double-spending a vault's balance regardless of transaction ordering or retries.
- The `approvers`/`threshold` fields are designed for extension: shipping `threshold = 1` now is a real, working system, not a stub — multi-sig later is a matter of allowing more addresses into `approvers` and raising `threshold`, with no change to the claim/approve instruction logic.

### 4.6 Pre-deploy checklist (mainnet — no testnet exists, see §8)

Every live deploy touches real bridged COOK, and there's no devnet to catch mistakes first. Before pointing at `rpc.cookiescan.io`, confirm against the local-validator test suite:

- [ ] All amount arithmetic uses checked ops (`checked_add`/`checked_sub`), not raw `+`/`-` — an overflow/underflow panics safely in debug but must not silently wrap in release
- [ ] `has_one = depositor` / `has_one = recipient` constraints (or equivalent manual checks) are on every instruction that reads those fields, not just a runtime `require!`
- [ ] Double-claim and double-approve are tested explicitly (call twice, assert the second fails with the right error) — not just "happy path once"
- [ ] `cancel_vault` after a partial claim is tested and correctly rejected (`CancelAfterClaim`)
- [ ] `claim` on a cancelled vault is tested and correctly rejected (`VaultCancelled`)
- [ ] Milestone amounts summing to something other than `total_amount` are rejected at `initialize_vault`, not discovered later at claim time
- [ ] No instruction lets an account other than the Vault PDA sign for moving funds out of the vault ATA

---

## 5. Frontend Architecture

### Stack
- **React + TypeScript, Vite** — matches existing skillset directly; static output, no server, matches every competitor reviewed and the intended Vercel/Netlify hosting
- **Wallet connection**: raw **Wallet Standard** (`@wallet-standard/app` + `@wallet-standard/base`), *not* `@solana/wallet-adapter-react-ui`. This is a deliberate choice, not an oversight: `wallet-adapter-react-ui`'s stock `<WalletMultiButton>`/modal is instantly recognizable as "generic Solana dApp template" — every reviewed competitor that looked distinctive (PayJar, CookieLens) built their own connect button/modal on the raw Wallet Standard API instead, and it shows. Cookie Receipts, the one repo that did pull in `wallet-adapter-react-ui`, reads the most templated of the five. Nightly is auto-discovered like any Wallet Standard wallet; no adapter package needed for it specifically.
- **Visual design system**: a hand-written `:root` CSS custom-property palette (`--bg`, `--card`, `--accent`, `--text`, `--muted`, `--radius`, `--shadow`) with a `@media (prefers-color-scheme: dark)` override block — this is what every well-regarded competitor frontend actually does (plain CSS, no component library; the one repo using Tailwind had the least distinctive UI of the set). Pick one real webfont pairing (display/sans for headings, a mono face for addresses/tx hashes/PDAs) rather than bare `system-ui` — cheap, and it's most of what reads as "designed" rather than "default."
- **On-chain calls**: Anchor auto-generates a TypeScript client from the program's IDL (Interface Description Language) — the frontend imports this rather than hand-building transaction instructions
- **Charts/activity view**: a small dependency-free inline SVG bar chart (as used by Cookie Tab) rather than pulling in a full charting library, for the "should-have" analytics panel

### 5.1 Cookie DAS integration (MVP)

The Create Vault form's asset field is not a bare text input for a mint address. Instead:

1. User pastes/selects a mint (or picks from a short list of known tokens, COOK first)
2. Frontend queries Cookie's DAS API for that mint's metadata (name, symbol, decimals, logo URI)
3. Form renders the resolved token (logo + symbol) instead of a raw address, and uses the returned `decimals` to convert the human-entered amount into the base-unit integer the program actually expects — this also removes a whole class of "entered 1000 but meant 1000 * 10^decimals" bugs
4. If DAS returns nothing for a pasted address (unknown/invalid mint), show that as a form validation error before the user ever gets to signing

This is the direct "utilize existing Cookie Chain programs... for tokenized assets" integration the bounty asks for, done in a way that improves the core product rather than bolting on an unrelated feature.

### Screens
1. **Connect wallet** — shows connected address, COOK balance
2. **Create Vault** — form: asset (via DAS lookup, §5.1), amount, recipient address, condition type (radio: Time Lock / Milestones), and the condition-specific fields (date picker, or a repeatable milestone-amount input)
3. **My Vaults** — list of vaults where the connected wallet is depositor or recipient, each showing: total, released so far, condition, status
4. **Vault Detail** — full state of one vault: per-milestone breakdown (amount / approved? / claimed?), the claim/approve button relevant to the connected wallet's role, raw on-chain data (PDA address, program ID) for transparency, and (should-have) a USD-value estimate via CookieScan price data
5. **Activity feed** (should-have) — chronological log of create/approve/claim/cancel events across vaults, pulled from transaction history via CookieScan's API

### Transaction status handling
Every write action (create/approve/claim/cancel) follows: **building → awaiting signature → submitted (show tx hash + link to CookieScan) → confirmed/failed**. On failure, surface the *specific* on-chain error from §4.4 in plain language ("This vault unlocks on Sept 30, 2026 — you can't claim yet") rather than a raw error code.

---

## 6. Tech Stack Summary

| Layer | Technology |
|---|---|
| On-chain program | Rust + Anchor framework |
| Program tests | Anchor's TypeScript test harness against a local validator |
| Frontend | React + TypeScript |
| Wallet | Nightly (via Solana wallet-adapter) |
| Chain interaction | Anchor-generated TS client (from program IDL) |
| Read-side data | Cookie DAS API (asset metadata — **MVP**, §5.1), CookieScan API (transaction/activity history, price data — should-have) |
| Hosting | Vercel or Netlify (static frontend) |
| Network | Cookie Chain mainnet via `rpc.cookiescan.io` (no faucet/testnet exists — see §8) |

---

## 7. Build Plan

**Schedule risk check**: the plan below assumes enough Rust/Anchor familiarity that Day 1 is "apply a known pattern," not "learn Rust." If Anchor is genuinely new, spend a few hours *before* Day 1 working through the Anchor book's escrow example — Cookie Vault's PDA-custody/CPI-transfer structure mirrors it closely, and having that pattern fresh turns Day 1 from a research day into an implementation day. If that prep still feels shaky afterward, it's a real signal to trim scope (drop milestones to should-have, ship time-lock-only) rather than let the whole build slip past the deadline.

| Day | Focus |
|---|---|
| 0 (if needed) | Anchor environment setup + work through a reference escrow example, if not already comfortable with Anchor's account/CPI/PDA patterns. |
| 1 | Write `initialize_vault` and `claim` (time-lock path only), including the `!vault.cancelled` and checked-arithmetic details from §4.3/§4.6. Test entirely against a local validator — zero cost, unlimited iteration. |
| 2 | Add `approve_milestone` (with the duplicate-approval guard) and the milestone claim path; extend local tests to cover both condition types and every error case in §4.4, including the double-claim/double-approve/cancel-after-claim cases from §4.6. Point Anchor config at Cookie Chain's RPC and do a first live deploy once local tests are solid. |
| 3 | Frontend: wallet connect, Create Vault form with DAS asset resolution (§5.1), My Vaults list, Vault Detail with claim/approve actions and transaction status UI. |
| Buffer | `cancel_vault`, activity feed, CookieScan price context, polish, README, public deployment, record the demo. |

---

## 8. Operational Notes (Cookie Chain specifics)

- **No faucet exists.** Per Cookie Chain's own docs, COOK is obtained only by bridging from Solana through their Hyperlane-based multi-sig bridge (`hyperlane.cookiescan.io`) — there is no devnet/testnet token tap. This means: do *all* iteration against a local validator (free, unlimited), and only touch the live Cookie Chain RPC for a small number of deliberate, already-tested deploys and demo transactions.
- **Fees are described as minimal and program deploys as "dirt-cheap"** relative to Solana mainnet, so the real-money cost of this plan should be small — but plan to acquire a small amount of COOK ahead of time rather than the day of deployment, since bridging isn't instant to set up the first time.
- **Program address and deployment are part of the submission** — record the deployed program ID for the Superteam Earn submission form.

---

## 9. Submission Checklist (mapped to bounty requirements)

- [ ] Wallet connection functionality — Nightly
- [ ] Display connected wallet address — done in header/nav
- [ ] Transaction execution — create/approve/claim/cancel all submit real transactions
- [ ] Transaction confirmation handling — status UI in §5
- [ ] Error handling and user feedback — mapped error table in §4.4
- [ ] Cookie ecosystem integration — DAS asset resolution in Create Vault (§5.1); this is a direct bounty requirement ("utilize existing Cookie Chain programs... for tokenized assets"), not just polish
- [ ] Deployed and publicly accessible — Vercel/Netlify + live program on Cookie Chain
- [ ] Open source with README — architecture explanation + setup instructions
- [ ] Live application URL, GitHub repo, program address — for the submission form
- [ ] X (Twitter) demo thread — walk through creating a vault, approving a milestone, and claiming, end to end
- [ ] Share thread in Cookie Chain Telegram — final submission step

---

## 10. Positioning for the pitch (README / X thread framing)

> **Cookie Vault — programmable token escrow and vesting for Cookie Chain.**
> Lock funds once, release them under conditions you define — a full unlock on a date, or milestone-by-milestone as work is delivered and approved. Built with Anchor, using program-derived accounts for trustless on-chain custody — no admin key ever holds user funds. Assets are resolved through Cookie's DAS API rather than raw addresses, so the app reads as native to the Cookie ecosystem, not bolted onto it. The approval model supports single-approver release today and is designed to extend to multi-signature approval without a redesign.

This framing does three things for a judge: names the primitive clearly, states the technical mechanism that makes it trustworthy (PDA custody, not "trust me"), and is honest about what's built now versus designed-for-later — which reads as engineering maturity rather than overclaiming.