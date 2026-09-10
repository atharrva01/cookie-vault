# Demo script

Click-path for the X thread / recorded walkthrough. Each step is one screenshot or one short clip. Do this against the **live deployment**, with a real (small) amount of COOK — not mock mode, not litesvm.

## Before recording

- [ ] Program deployed to Cookie Chain, confirmed with a test transaction already (don't debug on camera)
- [ ] Nightly installed and connected to Cookie Chain, funded with a small amount of COOK for gas + demo amounts
- [ ] A second wallet/address ready to act as the "recipient" (can be a second Nightly account) so the milestone-approval step has someone real to claim as
- [ ] Browser zoomed to a readable size, wallet extension popups will be visible on screen — that's fine, it's proof this is real

## 1. Home page

Show the landing page. Say what it is in one sentence: programmable escrow, PDA-custodied, no admin key. Point at the "Preview" vault card — say explicitly that it's a mockup, the real thing is one click away.

## 2. Connect wallet

Click "Connect wallet" → pick Nightly → approve in the extension popup. Show the header now displaying the real address and COOK balance.

## 3. Create a time-locked vault

Go to Create Vault.
- Asset: COOK (native) — point out it resolved automatically, no raw mint address typed
- Recipient: paste the second wallet's address (or a `.cook` name if one is registered, to show that resolution working)
- Condition: Time lock
- Amount: small, e.g. 5 COOK
- Unlock date: a few minutes in the future (for demo purposes — real usage would pick a real date)
- Watch the Summary panel update live as each field is filled
- Click "Create vault" → sign in Nightly → show the four-state status (building → awaiting signature → submitted → confirmed)
- Click through to the created vault, show the CookieScan link, click it — show the real transaction on-chain

## 4. Create a milestone vault (the differentiator)

Repeat, but:
- Condition: Milestones
- Amounts: e.g. 2 / 3 (two tranches)
- Point out the running "Total to lock" as amounts are typed
- Create it, same sign → confirm flow

## 5. Approve a milestone

From the depositor wallet, open the milestone vault's detail page. Click "Approve" on milestone 1 → sign. Show the milestone's status flip from "pending approval" to "approved, ready to claim."

## 6. Claim

Switch to the recipient wallet (or have it already connected in a second window). Open the same vault. Show the "Claim" button is only now enabled for the approved milestone, not the un-approved one. Claim it → sign → show the balance move and `released_amount` update on the vault's on-chain state shown on the page.

## 7. Cancel (the safety valve)

On a *different*, fresh, nothing-claimed-yet vault: show the depositor's "Cancel vault & refund me" button, click it, confirm the browser prompt, sign. Show the funds return and the vault marked cancelled.

## 8. Wrong-signer / early-claim error (optional but strong)

If time allows: attempt to claim the time-locked vault from step 3 before its unlock time (if it hasn't passed yet), or attempt a claim from a wallet that isn't the recipient. Show the plain-language error, not a raw program error code — reinforces that this is a real program with real guards, not just a happy-path demo.

## 9. Analytics

Show the Analytics page — total vaults, status breakdown, total value locked. Point out this queries every vault the program has ever created, not just the connected wallet's — it's reading real program-wide on-chain state.

## Closing line for the thread

> Built the on-chain program myself — Anchor, PDA-custodied escrow, no admin key. Everything above is a real transaction on Cookie Chain, not a mock.
