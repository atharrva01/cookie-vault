import { useEffect, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { connection, formatUnits } from '../lib/chain'
import { resolveMint } from '../lib/das'
import { buildProvider } from '../lib/idl'
import { fetchVaultsFor, type VaultListEntry } from '../lib/program'
import { navigate } from '../lib/router'
import { useWallet } from '../hooks/useWallet'
import { useNow } from '../hooks/useNow'

function useMyVaults(publicKey: PublicKey | null) {
  const { sign } = useWallet()
  const [vaults, setVaults] = useState<VaultListEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicKey) {
      setVaults(null)
      return
    }
    let cancelled = false
    setVaults(null)
    setError(null)
    const provider = buildProvider(connection, publicKey, sign)
    fetchVaultsFor(provider, publicKey)
      .then((v) => !cancelled && setVaults(v))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey])

  return { vaults, error }
}

function VaultStatus({ entry, viewerIsRecipient, now }: { entry: VaultListEntry; viewerIsRecipient: boolean; now: number }) {
  const { account } = entry
  if (account.cancelled) return <span className="muted small">Cancelled</span>

  if ('timeLock' in account.conditionType) {
    if (account.releasedAmount.gtn(0)) return <span className="ok small">Claimed</span>
    const unlockMs = (account.unlockTimestamp?.toNumber() ?? 0) * 1000
    if (now >= unlockMs) return <span className="ok small">Ready to claim</span>
    return <span className="muted small">Locked until {new Date(unlockMs).toLocaleDateString()}</span>
  }

  const claimedCount = account.milestones.filter((m) => m.claimed).length
  const total = account.milestones.length
  return (
    <span className={claimedCount === total ? 'ok small' : 'muted small'}>
      {claimedCount}/{total} milestones claimed
      {viewerIsRecipient && claimedCount < total ? ' (check for approved ones)' : ''}
    </span>
  )
}

export default function MyVaults() {
  const { publicKey } = useWallet()
  const { vaults, error } = useMyVaults(publicKey)
  const [decimalsByMint, setDecimalsByMint] = useState<Record<string, number>>({})
  const now = useNow()

  useEffect(() => {
    if (!vaults) return
    const mints = [...new Set(vaults.map((v) => v.account.mint.toBase58()))]
    mints.forEach((mint) => {
      if (mint in decimalsByMint) return
      void resolveMint(mint).then((r) => {
        if (r) setDecimalsByMint((prev) => ({ ...prev, [mint]: r.info.decimals }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults])

  if (!publicKey) {
    return (
      <main>
        <h1>My vaults</h1>
        <p className="muted">Connect a wallet to see vaults where you're the depositor or the recipient.</p>
      </main>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>My vaults</h1>
        <button className="primary" onClick={() => navigate('/create')}>
          Create a vault
        </button>
      </div>

      {error && <p className="error">Couldn't load vaults: {error}</p>}
      {!error && vaults === null && <p className="muted">Loading…</p>}

      {vaults?.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="muted">No vaults yet for this wallet.</p>
          <button className="primary" onClick={() => navigate('/create')}>
            Create your first vault
          </button>
        </div>
      )}

      {vaults && vaults.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          {vaults.map((entry) => {
            const decimals = decimalsByMint[entry.account.mint.toBase58()]
            const isDepositor = entry.account.depositor.equals(publicKey)
            const isRecipient = entry.account.recipient.equals(publicKey)
            return (
              <div
                key={entry.pda.toBase58()}
                className="list-row"
                onClick={() => navigate(`/vault?id=${entry.pda.toBase58()}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div className="mono small">{entry.pda.toBase58()}</div>
                    <div className="muted small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      {decimals !== undefined
                        ? formatUnits(entry.account.totalAmount.toString(), decimals, 4)
                        : entry.account.totalAmount.toString()}{' '}
                      total
                      <span className="pill">{isDepositor && isRecipient ? 'depositor & recipient' : isDepositor ? 'depositor' : 'recipient'}</span>
                    </div>
                  </div>
                  <VaultStatus entry={entry} viewerIsRecipient={isRecipient} now={now} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
