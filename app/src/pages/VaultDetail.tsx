import { useEffect, useMemo, useState } from 'react'
import { PublicKey, type Transaction } from '@solana/web3.js'
import { connection, fmtUsd, formatUnits } from '../lib/chain'
import { resolveMint, type ResolvedMint } from '../lib/das'
import { buildProvider, buildReadOnlyProvider, PROGRAM_ID } from '../lib/idl'
import { approveMilestoneTx, cancelVaultTx, claimTx, fetchVault, type VaultAccount } from '../lib/program'
import { fetchVaultActivity, type ActivityEntry } from '../lib/activity'
import { sendWithStatus } from '../lib/transact'
import { txErrorMessage, type TxPhase } from '../lib/txStatus'
import { useWallet } from '../hooks/useWallet'
import { useNow } from '../hooks/useNow'
import { useRoute } from '../lib/router'
import { AddressLink, TxLink } from '../components/ui'
import { TxStatus } from '../components/TxStatus'

function useVault(pda: PublicKey | null, reloadKey: number) {
  const [vault, setVault] = useState<VaultAccount | null | undefined>(undefined)

  useEffect(() => {
    if (!pda) {
      setVault(null)
      return
    }
    let cancelled = false
    setVault(undefined)
    fetchVault(buildReadOnlyProvider(connection), pda).then((v) => !cancelled && setVault(v))
    return () => {
      cancelled = true
    }
  }, [pda, reloadKey])

  return vault
}

function useVaultActivity(pda: PublicKey | null, reloadKey: number) {
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  useEffect(() => {
    if (!pda) {
      setActivity(null)
      return
    }
    let cancelled = false
    fetchVaultActivity(buildReadOnlyProvider(connection), pda)
      .then((entries) => !cancelled && setActivity(entries))
      .catch(() => !cancelled && setActivity([]))
    return () => {
      cancelled = true
    }
  }, [pda, reloadKey])
  return activity
}

export default function VaultDetail() {
  const { params } = useRoute()
  const { publicKey, sign } = useWallet()
  const idParam = params.get('id')
  // Memoized on the stable string, not recreated as a fresh PublicKey object
  // every render — `pda` is a useEffect dependency in `useVault` below, and
  // an object that changes identity on every render but never in value
  // makes that effect re-fire every render: each fetch cancels the previous
  // one before it can ever resolve, and the page hangs on "Loading…"
  // forever. This was a real bug, not a hypothetical one — caught with a
  // headless-browser check, not just by reading the code.
  const pda = useMemo(() => (idParam && isValidPubkey(idParam) ? new PublicKey(idParam) : null), [idParam])

  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const vault = useVault(pda, reloadKey)
  const activity = useVaultActivity(pda, reloadKey)
  const [asset, setAsset] = useState<ResolvedMint | null>(null)
  const [phase, setPhase] = useState<TxPhase>({ kind: 'idle' })
  const [actionError, setActionError] = useState<string | null>(null)
  const now = useNow()

  useEffect(() => {
    if (!vault) return
    void resolveMint(vault.mint.toBase58()).then(setAsset)
  }, [vault])

  if (!pda) {
    return (
      <main>
        <p className="error">No vault specified.</p>
      </main>
    )
  }
  if (vault === undefined) {
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    )
  }
  if (vault === null) {
    return (
      <main>
        <p className="error">Vault not found at this address.</p>
      </main>
    )
  }

  const decimals = asset?.info.decimals
  const fmt = (raw: { toString(): string }) => (decimals !== undefined ? formatUnits(raw.toString(), decimals, 4) : raw.toString())
  // Best-effort market color, not a source of truth — undefined whenever Cookiescan doesn't have a price for this mint.
  const fmtWithUsd = (raw: { toString(): string }) => {
    const formatted = fmt(raw)
    if (decimals === undefined || asset?.info.priceUsd === undefined) return formatted
    const usd = (Number(raw.toString()) / 10 ** decimals) * asset.info.priceUsd
    return `${formatted} (${fmtUsd(usd)})`
  }
  const isDepositor = publicKey?.equals(vault.depositor) ?? false
  const isRecipient = publicKey?.equals(vault.recipient) ?? false
  const isApprover = publicKey ? vault.approvers.some((a) => a.equals(publicKey)) : false
  const isTimeLock = 'timeLock' in vault.conditionType

  async function runAction(build: () => Promise<Transaction>) {
    if (!publicKey) return
    setActionError(null)
    const provider = buildProvider(connection, publicKey, sign)
    try {
      await sendWithStatus(provider, build, setPhase)
      reload()
    } catch (e) {
      setActionError(txErrorMessage(e))
      setPhase({ kind: 'idle' })
    }
  }

  function handleClaim(milestoneIndex: number | null) {
    if (!publicKey || !vault) return
    void runAction(() =>
      claimTx(buildProvider(connection, publicKey, sign), {
        vault: pda!,
        recipient: publicKey,
        mint: vault.mint,
        milestoneIndex,
      }),
    )
  }

  function handleApprove(milestoneIndex: number) {
    if (!publicKey || !vault) return
    void runAction(() => approveMilestoneTx(buildProvider(connection, publicKey, sign), pda!, publicKey, milestoneIndex))
  }

  function handleCancel() {
    if (!publicKey || !vault) return
    if (!window.confirm('Cancel this vault and refund the full remaining balance to you? This cannot be undone.')) return
    void runAction(() =>
      cancelVaultTx(buildProvider(connection, publicKey, sign), { vault: pda!, depositor: publicKey, mint: vault.mint }),
    )
  }

  return (
    <main>
      <h1>Vault detail</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="field">
          <label>Vault address (PDA)</label>
          <AddressLink address={pda.toBase58()} />
        </div>
        <div className="field">
          <label>Program</label>
          <AddressLink address={PROGRAM_ID.toBase58()} />
        </div>
        <div className="field">
          <label>Depositor</label>
          <AddressLink address={vault.depositor.toBase58()} name={isDepositor ? 'you' : undefined} />
        </div>
        <div className="field">
          <label>Recipient</label>
          <AddressLink address={vault.recipient.toBase58()} name={isRecipient ? 'you' : undefined} />
        </div>
        <div className="field">
          <label>Asset</label>
          <span>{asset ? `${asset.info.name} (${asset.info.symbol})` : <span className="mono">{vault.mint.toBase58()}</span>}</span>
        </div>
        <div className="field">
          <label>Total / Released</label>
          <span>
            {fmtWithUsd(vault.totalAmount)} / {fmtWithUsd(vault.releasedAmount)}
          </span>
        </div>
        {vault.cancelled && <p className="error">This vault has been cancelled.</p>}
        {!vault.cancelled && isDepositor && vault.releasedAmount.isZero() && (
          <button
            className="ghost sm"
            onClick={handleCancel}
            disabled={phase.kind !== 'idle' && phase.kind !== 'confirmed' && phase.kind !== 'failed'}
          >
            Cancel vault &amp; refund me
          </button>
        )}
        {!vault.cancelled && isDepositor && !vault.releasedAmount.isZero() && (
          <p className="muted small">Can't cancel — funds have already been released from this vault.</p>
        )}
      </div>

      {isTimeLock ? (
        <div className="card">
          <h2>Time lock</h2>
          <p className="muted small">
            Unlocks {vault.unlockTimestamp ? new Date(vault.unlockTimestamp.toNumber() * 1000).toLocaleString() : '—'}
          </p>
          {isRecipient && !vault.cancelled && (
            <>
              {vault.releasedAmount.gtn(0) ? (
                <p className="ok small">Already claimed.</p>
              ) : now < (vault.unlockTimestamp?.toNumber() ?? 0) * 1000 ? (
                <button className="primary" disabled>
                  Not unlocked yet
                </button>
              ) : (
                <button className="primary" onClick={() => handleClaim(null)} disabled={phase.kind !== 'idle' && phase.kind !== 'confirmed' && phase.kind !== 'failed'}>
                  Claim
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="card">
          <h2>Milestones</h2>
          {vault.milestones.map((m, i) => {
            const approved = m.approvedBy.length >= vault.threshold
            const approvedByMe = publicKey ? m.approvedBy.some((a) => a.equals(publicKey)) : false
            const busy = phase.kind !== 'idle' && phase.kind !== 'confirmed' && phase.kind !== 'failed'
            return (
              <div key={i} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <strong>Milestone {i + 1}</strong> — {fmt(m.amount)}
                    <div className="muted small">
                      {m.claimed ? 'Claimed' : approved ? 'Approved, ready to claim' : `${m.approvedBy.length}/${vault.threshold} approved`}
                    </div>
                  </div>
                  {!vault.cancelled && isApprover && !m.claimed && !approvedByMe && (
                    <button className="ghost sm" onClick={() => handleApprove(i)} disabled={busy}>
                      Approve
                    </button>
                  )}
                  {!vault.cancelled && isRecipient && approved && !m.claimed && (
                    <button className="primary sm" onClick={() => handleClaim(i)} disabled={busy}>
                      Claim
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Activity</h2>
        {activity === null && <p className="muted small">Loading…</p>}
        {activity?.length === 0 && <p className="muted small">No activity yet.</p>}
        {activity && activity.length > 0 && (
          <div>
            {activity.map((entry) => (
              <div
                key={entry.signature}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--line)' }}
              >
                <span>{entry.label}</span>
                <span className="muted small">
                  {entry.blockTime ? new Date(entry.blockTime * 1000).toLocaleString() : `slot ${entry.slot}`} ·{' '}
                  <TxLink signature={entry.signature} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {actionError && <p className="error">{actionError}</p>}
      <TxStatus phase={phase} />

      {!isDepositor && !isRecipient && !isApprover && (
        <p className="muted small">You're viewing this vault's public on-chain state — you're not the depositor, recipient, or an approver.</p>
      )}
    </main>
  )
}

function isValidPubkey(s: string): boolean {
  try {
    new PublicKey(s)
    return true
  } catch {
    return false
  }
}
