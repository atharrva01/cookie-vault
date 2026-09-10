# Cookie Vault

**Programmable token escrow and vesting for Cookie Chain.**

Submission for the Superteam Earn bounty *"Create an App on Cookie Chain."*

> Lock funds once, release them under conditions you define — a full unlock on a date, or milestone-by-milestone as work is delivered and approved. Built with Anchor, using program-derived accounts for trustless on-chain custody: no admin key ever holds user funds. Assets are resolved through Cookie's DAS API rather than raw addresses, so the app reads as native to the Cookie ecosystem, not bolted onto it. The approval model supports single-approver release today and is designed to extend to multi-signature approval without a redesign.

**Live frontend:** https://atharrva01.github.io/cookie-vault/
**Repo:** https://github.com/atharrva01/cookie-vault

> **On-chain deployment status:** the program is written, tested, and its address is fixed (below), but it is **not yet deployed to Cookie Chain mainnet** — that step is blocked on bridging COOK to the deploy wallet (there is no faucet; see [Operational notes](#operational-notes)). The frontend above is live and fully browsable, but any real transaction (create/claim/approve/cancel) will fail until deployment completes. This section will be updated with the live program ID once that happens.

---

## What it is

Most "meaningful on-chain interaction" submissions in this bounty are frontends wrapped around programs someone else already wrote — routing value through Solana's stock Memo Program plus SPL transfers, reconstructing state client-side from transaction history. Cookie Vault **is** the on-chain program: a financial primitive, not a viewer.

The motivating use case is contributor payouts — the exact thing bounty platforms like Superteam need:

```
1,000 COOK total, paid to a contributor as they hit milestones
  250 COOK → milestone 1 (design approved)
  250 COOK → milestone 2 (implementation done)
  500 COOK → final milestone (shipped)
```

The payer locks the full amount up front (the recipient has certainty the funds exist and can't be pulled back), and the recipient claims each tranche as it's approved (the payer keeps control over releasing money for incomplete work). Neither party has to trust the other's promises — the program enforces it.

### Two release conditions

- **Time lock** — funds unlock in full once a chosen date passes.
- **Milestones** — a vault holds up to 10 independent tranches, each released as an approver signs off. This is the differentiator: it turns "a token timelock" (seen everywhere) into "programmable escrow" (a primitive).

Either way, the depositor can cancel and reclaim in full — but only before anything has been claimed.

---

## Architecture

### On-chain program (Rust / Anchor)

A single `Vault` PDA per escrow, seeded by `["vault", depositor, recipient, vault_id]`. The vault's token custody account is an Associated Token Account owned by that PDA — not by a person — so only the program's own instruction logic can ever move the funds.

```rust
pub struct Vault {
    pub depositor: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub vault_id: u64,
    pub condition_type: ConditionType,      // TimeLock | Milestone
    pub total_amount: u64,
    pub released_amount: u64,
    pub unlock_timestamp: Option<i64>,
    pub milestones: Vec<Milestone>,         // capped at 10
    pub approvers: Vec<Pubkey>,             // [depositor] today, capped at 5
    pub threshold: u8,                      // 1 today — the multi-sig extension point
    pub cancelled: bool,
    pub bump: u8,
}
```

**Instructions:** `initialize_vault`, `approve_milestone`, `claim`, `cancel_vault` — see [`programs/cookie-vault/src/instructions/`](programs/cookie-vault/src/instructions/).

**Why it's safe by construction:**
- Funds are never held by a person's keypair, only by the PDA. No admin backdoor, no "trust me" step.
- `released_amount` and per-milestone `claimed` flags make double-spending a vault's balance impossible regardless of transaction ordering or retries.
- `approvers`/`threshold` are designed for extension — shipping `threshold = 1` now is a real, working system, not a stub. Multi-sig later means allowing more addresses into `approvers` and raising `threshold`; the claim/approve instruction logic itself doesn't change. **This is intentionally out of scope for this submission** — real M-of-N multi-sig needs a signer registry and replay protection, a sub-project on its own, and the honest path was to design the extension point rather than ship a shaky half-built version of it.

**Errors**, each mapped to a plain-language frontend message:

| Error | Trigger |
|---|---|
| `InvalidCondition` | Milestone amounts don't sum to total, or a required field is missing for the chosen condition type |
| `TooEarly` | Claim attempted before `unlock_timestamp` |
| `NotApproved` | Claim attempted on a milestone below its approval threshold |
| `AlreadyClaimed` | Double-claim on the same milestone/timelock |
| `AlreadyApproved` | Signer already approved this milestone |
| `Unauthorized` | Wrong signer for the action attempted |
| `CancelAfterClaim` | Cancel attempted after any funds already released |
| `VaultCancelled` | Claim or approve attempted on a cancelled vault |
| `TooManyMilestones` | `milestone_amounts` exceeds the 10-milestone cap |

**Tests:** Rust integration tests via [`litesvm`](https://github.com/LiteSVM/litesvm) (in-process SVM, no validator needed) — every happy path and every error above, including double-claim, double-approve, and cancel-after-claim. Run with `./scripts/test.sh`.

### Frontend (React + TypeScript)

- Raw [Wallet Standard](https://github.com/wallet-standard/wallet-standard) (`@wallet-standard/app`), not `@solana/wallet-adapter-react-ui` — a deliberate choice to avoid the generic wallet-adapter modal look.
- A hand-rolled hash router (`lib/router.ts`), not `react-router-dom` — this deploys as a static site with no server-side rewrite rules, and four screens doesn't justify the dependency.
- Assets resolved through **Cookie's DAS API** in the Create Vault form (name/symbol/decimals/logo instead of a raw mint address) and `.cook` name resolution for the recipient field via CookOven's on-chain registry — both direct integrations with Cookie Chain's own ecosystem, not just polish.
- A `?mock=1` URL flag connects a synthetic, freshly-generated wallet for UI testing without spending real COOK — reads still hit the live network; a real write correctly fails with "insufficient funds."

---

## Repo structure

```
programs/cookie-vault/     Anchor program (Rust)
  src/instructions/        initialize_vault, approve_milestone, claim, cancel_vault
  src/state.rs             Vault, Milestone, ConditionType
  src/error.rs             CookieVaultError variants
  tests/                   litesvm integration tests
scripts/
  build.sh                 arch-v1 build (litesvm can't load Anchor's default v3 target)
  test.sh                  rebuild + run the full test suite
app/                       Vite + React + TypeScript frontend
  src/pages/                Home, CreateVault, MyVaults, VaultDetail, Analytics
  src/lib/                  chain/wallet/program/DAS/CookOven-name clients
design_doc.md               full design rationale and competitive analysis
implementation_plan.md      phase-by-phase build log with real findings and deviations
```

---

## Running locally

**On-chain program:**
```bash
./scripts/test.sh        # rebuilds (arch-v1) and runs the full litesvm test suite
```

**Frontend:**
```bash
cd app
npm install
npm run dev               # http://localhost:5173
```

Add `?mock=1` to the dev URL to try the app with a synthetic wallet, no browser extension or funds required.

---

## Operational notes

- **No faucet exists for Cookie Chain.** COOK is obtained only by bridging from Solana through Cookie Chain's Hyperlane-based bridge (`hyperlane.cookiescan.io`) — there is no devnet/testnet token tap. All development and testing here ran against `litesvm` locally; the live network is only touched for the deploy itself and demo transactions.
- **Wallet:** [Nightly](https://nightly.app) is the recommended wallet — it exposes a `changeNetwork` API this app uses to switch a connected wallet onto Cookie Chain automatically, rather than asking the user to add a custom RPC by hand. Any Wallet Standard–compatible wallet works, just without that convenience.
- **Program ID** (fixed by the program's own keypair, independent of deploy status): `35GMkSwvDYLk1FYjXcMBp2PosgkYCQVFPByAsvEm9147`

---

## License

MIT — see [LICENSE](LICENSE).
