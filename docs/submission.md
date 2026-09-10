# Submission — Superteam Earn "Create an App on Cookie Chain"

Single source of truth for the submission form fields. Fill the form from this, not the other way around — keeps one place to update if anything changes.

## Form fields

| Field | Value |
|---|---|
| Project name | Cookie Vault |
| One-liner | Programmable token escrow and vesting on Cookie Chain — lock funds once, release on a date or milestone-by-milestone as work is approved. |
| Live application URL | https://atharrva01.github.io/cookie-vault/ |
| GitHub repo | https://github.com/atharrva01/cookie-vault |
| Program address (Cookie Chain) | `35GMkSwvDYLk1FYjXcMBp2PosgkYCQVFPByAsvEm9147` — ⚠️ **not yet live-deployed**, see status note below |
| X (Twitter) demo thread | *TBD — not yet posted* |
| Telegram share | *TBD — not yet posted* |

## ⚠️ Pre-submission blocker

The program is written, tested (full `litesvm` suite passing), and its address above is fixed by the program's own keypair — but it has **not been deployed to Cookie Chain mainnet yet**. That requires bridging real COOK to the deploy wallet (`9WNZiPLk8z6QGhBSMKRhtetWtEgAycivDsjBFmZJxhqk`) via `hyperlane.cookiescan.io`, then running `anchor deploy` and a live smoke test. **Do not submit until this is done** — the live application URL above is real and browsable, but no transaction will succeed against it until the program is actually on-chain.

Once deployed:
1. Confirm the deployed program ID still matches the one above (it should — it's fixed by the program keypair, not the deploying wallet).
2. Update this table if anything changed.
3. Record a real `initialize_vault` + `claim` transaction signature here for reference: *(pending)*

## Longer description (for the form's description field, if it has one)

Cookie Vault is an on-chain program, not a frontend wrapped around one someone else wrote. It implements programmable escrow: a depositor locks tokens into a program-derived account up front, and the recipient claims them once a release condition is satisfied — either a time lock (full unlock on a date) or milestones (up to 10 independent tranches, each released as an approver signs off). No admin key can ever move a vault's funds; only the PDA can, and only through the program's own instruction logic.

The motivating use case is contributor payouts: a payer locks the full amount for a job up front (so the contributor has certainty the funds exist), and releases each milestone tranche as work is approved (so the payer isn't paying for undelivered work). The approval model ships as single-approver today but is designed — `approvers`/`threshold` fields, not a placeholder — to extend to multi-signature approval without a redesign; that extension itself is explicitly out of scope for this submission, stated here rather than shipped half-built.

Cookie ecosystem integrations: the Create Vault form resolves any token mint through Cookie's DAS API (name/symbol/decimals/logo, not a raw address), and the recipient field accepts a `.cook` name resolved through CookOven's on-chain registry.

## Submission checklist

Copied from `design_doc.md` §9, checked honestly as of the state at time of writing:

- [x] Wallet connection functionality — Wallet Standard, Nightly recommended
- [x] Display connected wallet address — header/nav
- [x] Transaction execution — create/approve/claim/cancel all build and submit real transactions
- [x] Transaction confirmation handling — four-state status UI (building → awaiting signature → submitted → confirmed/failed)
- [x] Error handling and user feedback — every on-chain error mapped to a plain-language message
- [x] Cookie ecosystem integration — DAS asset resolution + CookOven `.cook` name resolution
- [ ] **Deployed and publicly accessible** — frontend is (GitHub Pages); on-chain program is **not yet** (blocked on funding, see above)
- [x] Open source with README — architecture explanation + setup instructions
- [ ] Live application URL, GitHub repo, program address — URL and repo ready now; program address needs the live-deploy step to actually be true
- [ ] X (Twitter) demo thread
- [ ] Share thread in Cookie Chain Telegram
