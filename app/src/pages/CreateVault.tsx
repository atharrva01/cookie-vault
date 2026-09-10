import { useEffect, useMemo, useState } from 'react'
import { addressUrl, connection, isPubkey, NATIVE_MINT, parseUnits, shortAddr } from '../lib/chain'
import { resolveMint, type ResolvedMint } from '../lib/das'
import { looksLikeCookName, resolveRecipientInput, type ResolvedRecipient } from '../lib/cookNames'
import { buildProvider } from '../lib/idl'
import { ConditionType, initializeVaultTx, MAX_MILESTONES, vaultPda } from '../lib/program'
import { sendWithStatus } from '../lib/transact'
import { TxStatus } from '../components/TxStatus'
import { txErrorMessage, type TxPhase } from '../lib/txStatus'
import { useWallet } from '../hooks/useWallet'
import { PublicKey } from '@solana/web3.js'

type AssetState = { status: 'idle' } | { status: 'loading' } | { status: 'resolved'; resolved: ResolvedMint } | { status: 'invalid' }
type RecipientState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'resolved'; resolved: ResolvedRecipient }
  | { status: 'invalid'; message: string }
type Condition = 'timeLock' | 'milestone'

function newVaultId(): bigint {
  return BigInt(Date.now())
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="summary-row">
      <span className="muted small">{label}</span>
      <span>{children}</span>
    </div>
  )
}

/** Debounces mint resolution as the user types instead of firing on every keystroke. */
function useAssetResolution(mintInput: string): AssetState {
  const [state, setState] = useState<AssetState>({ status: 'idle' })

  useEffect(() => {
    const trimmed = mintInput.trim()
    if (!trimmed) {
      setState({ status: 'idle' })
      return
    }
    if (!isPubkey(trimmed)) {
      setState({ status: 'invalid' })
      return
    }
    setState({ status: 'loading' })
    let cancelled = false
    const id = setTimeout(() => {
      resolveMint(trimmed).then((resolved) => {
        if (cancelled) return
        setState(resolved ? { status: 'resolved', resolved } : { status: 'invalid' })
      })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [mintInput])

  return state
}

/** Debounces `.cook` name / address resolution as the user types. A plain valid address resolves instantly, no debounce needed. */
function useRecipientResolution(input: string): RecipientState {
  const [state, setState] = useState<RecipientState>({ status: 'idle' })

  useEffect(() => {
    const trimmed = input.trim()
    if (!trimmed) {
      setState({ status: 'idle' })
      return
    }
    if (isPubkey(trimmed)) {
      setState({ status: 'resolved', resolved: { address: new PublicKey(trimmed), name: null } })
      return
    }
    if (!looksLikeCookName(trimmed)) {
      setState({ status: 'invalid', message: 'Enter a wallet address or a .cook name' })
      return
    }
    setState({ status: 'loading' })
    let cancelled = false
    const id = setTimeout(() => {
      resolveRecipientInput(trimmed)
        .then((resolved) => !cancelled && setState({ status: 'resolved', resolved }))
        .catch((e: unknown) => {
          if (cancelled) return
          setState({ status: 'invalid', message: e instanceof Error ? e.message : String(e) })
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [input])

  return state
}

export default function CreateVault() {
  const { publicKey, sign } = useWallet()

  const [mintInput, setMintInput] = useState(NATIVE_MINT)
  const asset = useAssetResolution(mintInput)

  const [recipientInput, setRecipientInput] = useState('')
  const recipientState = useRecipientResolution(recipientInput)
  const [condition, setCondition] = useState<Condition>('timeLock')
  const [amountInput, setAmountInput] = useState('')
  const [unlockDate, setUnlockDate] = useState('')
  const [milestoneInputs, setMilestoneInputs] = useState<string[]>(['', ''])

  const [phase, setPhase] = useState<TxPhase>({ kind: 'idle' })
  const [formError, setFormError] = useState<string | null>(null)
  const [createdVault, setCreatedVault] = useState<string | null>(null)

  const decimals = asset.status === 'resolved' ? asset.resolved.info.decimals : null

  const milestoneTotal = useMemo(() => {
    if (decimals === null) return null
    try {
      return milestoneInputs.reduce((sum, raw) => (raw.trim() ? sum + parseUnits(raw, decimals) : sum), 0n)
    } catch {
      return null
    }
  }, [milestoneInputs, decimals])

  function updateMilestone(index: number, value: string) {
    setMilestoneInputs((rows) => rows.map((r, i) => (i === index ? value : r)))
  }
  function addMilestone() {
    setMilestoneInputs((rows) => (rows.length >= MAX_MILESTONES ? rows : [...rows, '']))
  }
  function removeMilestone(index: number) {
    setMilestoneInputs((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setCreatedVault(null)

    if (!publicKey) {
      setFormError('Connect a wallet first.')
      return
    }
    if (asset.status !== 'resolved') {
      setFormError('Enter a valid token mint address.')
      return
    }
    if (recipientState.status !== 'resolved') {
      setFormError("Enter the recipient's wallet address or .cook name.")
      return
    }
    const recipient = recipientState.resolved.address
    const { decimals } = asset.resolved.info

    let totalAmount: bigint
    let unlockTimestamp: bigint | null = null
    let milestoneAmounts: bigint[] | null = null

    if (condition === 'timeLock') {
      if (!amountInput.trim()) {
        setFormError('Enter an amount.')
        return
      }
      if (!unlockDate) {
        setFormError('Pick an unlock date.')
        return
      }
      try {
        totalAmount = parseUnits(amountInput, decimals)
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Invalid amount')
        return
      }
      const unlockMs = new Date(`${unlockDate}T00:00:00Z`).getTime()
      if (!Number.isFinite(unlockMs) || unlockMs <= Date.now()) {
        setFormError('The unlock date must be in the future.')
        return
      }
      unlockTimestamp = BigInt(Math.floor(unlockMs / 1000))
    } else {
      const nonEmpty = milestoneInputs.filter((r) => r.trim() !== '')
      if (nonEmpty.length === 0) {
        setFormError('Add at least one milestone amount.')
        return
      }
      try {
        milestoneAmounts = nonEmpty.map((r) => parseUnits(r, decimals))
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Invalid milestone amount')
        return
      }
      totalAmount = milestoneAmounts.reduce((sum, a) => sum + a, 0n)
    }

    const vaultId = newVaultId()
    const provider = buildProvider(connection, publicKey, sign)

    try {
      const signature = await sendWithStatus(
        provider,
        () =>
          initializeVaultTx(provider, {
            vaultId,
            depositor: publicKey,
            recipient,
            mint: new PublicKey(mintInput.trim()),
            conditionType: condition === 'timeLock' ? ConditionType.TimeLock : ConditionType.Milestone,
            totalAmount,
            unlockTimestamp,
            milestoneAmounts,
          }),
        setPhase,
      )
      const [vault] = vaultPda(publicKey, recipient, vaultId)
      setCreatedVault(vault.toBase58())
      void signature
    } catch (err) {
      setPhase({ kind: 'failed', message: txErrorMessage(err) })
    }
  }

  const submitting = phase.kind !== 'idle' && phase.kind !== 'confirmed' && phase.kind !== 'failed'

  const assetSymbol = asset.status === 'resolved' ? asset.resolved.info.symbol : ''
  const assetLabel =
    asset.status === 'resolved'
      ? assetSymbol
      : asset.status === 'loading'
        ? 'Resolving…'
        : asset.status === 'invalid'
          ? 'Invalid mint'
          : 'Not set'
  const recipientLabel =
    recipientState.status === 'resolved'
      ? (recipientState.resolved.name ?? shortAddr(recipientState.resolved.address.toBase58()))
      : recipientState.status === 'loading'
        ? 'Resolving…'
        : recipientState.status === 'invalid'
          ? 'Invalid'
          : 'Not set'
  const amountLabel =
    condition === 'timeLock'
      ? amountInput.trim()
        ? `${amountInput} ${assetSymbol}`.trim()
        : 'Not set'
      : milestoneTotal !== null && decimals !== null
        ? `${(Number(milestoneTotal) / 10 ** decimals).toLocaleString()} ${assetSymbol}`.trim()
        : 'Not set'
  const milestoneCount = milestoneInputs.filter((r) => r.trim() !== '').length

  return (
    <main className="create-page">
      <div>
        <h1>Create a vault</h1>
        <p className="lead">
          Lock tokens now, release them to the recipient on a date, or milestone-by-milestone as you approve each
          one.
        </p>

        <form className="card" onSubmit={(e) => void handleSubmit(e)}>
          <div className="field">
            <label htmlFor="mint">Asset (mint address)</label>
            <input
              id="mint"
              type="text"
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="Token mint address"
            />
            {asset.status === 'loading' && <span className="muted small">Resolving…</span>}
            {asset.status === 'invalid' && <span className="error">Not a recognized token mint on Cookie Chain.</span>}
            {asset.status === 'resolved' && (
              <div className="asset-preview">
                {asset.resolved.info.logoUri && <img src={asset.resolved.info.logoUri} alt="" />}
                <span>
                  {asset.resolved.info.name} ({asset.resolved.info.symbol})
                </span>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="recipient">Recipient</label>
            <input
              id="recipient"
              type="text"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              placeholder="Wallet address or a .cook name"
            />
            {recipientState.status === 'loading' && <span className="muted small">Resolving…</span>}
            {recipientState.status === 'invalid' && <span className="error">{recipientState.message}</span>}
            {recipientState.status === 'resolved' && recipientState.resolved.name && (
              <span className="muted small mono">
                {recipientState.resolved.name} → {recipientState.resolved.address.toBase58()}
              </span>
            )}
          </div>

          <div className="field">
            <label>Release condition</label>
            <div className="segmented" role="radiogroup" aria-label="Release condition">
              <button
                type="button"
                className={`segmented-btn${condition === 'timeLock' ? ' active' : ''}`}
                aria-pressed={condition === 'timeLock'}
                onClick={() => setCondition('timeLock')}
              >
                Time lock
              </button>
              <button
                type="button"
                className={`segmented-btn${condition === 'milestone' ? ' active' : ''}`}
                aria-pressed={condition === 'milestone'}
                onClick={() => setCondition('milestone')}
              >
                Milestones
              </button>
            </div>
          </div>

          {condition === 'timeLock' ? (
            <>
              <div className="field">
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div className="field">
                <label htmlFor="unlock-date">Unlock date</label>
                <input id="unlock-date" type="date" value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="field">
              <label>Milestone amounts</label>
              {milestoneInputs.map((value, i) => (
                <div className="milestone-row" key={i}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => updateMilestone(i, e.target.value)}
                    placeholder={`Milestone ${i + 1}`}
                  />
                  {milestoneInputs.length > 1 && (
                    <button type="button" className="ghost sm" onClick={() => removeMilestone(i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="ghost sm" onClick={addMilestone} disabled={milestoneInputs.length >= MAX_MILESTONES}>
                + Add milestone
              </button>
              {milestoneTotal !== null && decimals !== null && (
                <p className="muted small">
                  Total to lock: {(Number(milestoneTotal) / 10 ** decimals).toLocaleString()}{' '}
                  {asset.status === 'resolved' ? asset.resolved.info.symbol : ''}
                </p>
              )}
            </div>
          )}

          {formError && <p className="error">{formError}</p>}
          <TxStatus phase={phase} />

          {createdVault && phase.kind === 'confirmed' && (
            <p className="ok small">
              Vault created:{' '}
              <a href={addressUrl(createdVault)} target="_blank" rel="noreferrer" className="mono">
                {createdVault}
              </a>
            </p>
          )}

          <button type="submit" className="primary" disabled={submitting || !publicKey}>
            {submitting ? 'Working…' : 'Create vault'}
          </button>
          {!publicKey && <p className="muted small">Connect a wallet to create a vault.</p>}
        </form>
      </div>

      <aside className="summary-panel card">
        <h2 className="summary-heading">Summary</h2>
        <SummaryRow label="Asset">{assetLabel}</SummaryRow>
        <SummaryRow label="Recipient">{recipientLabel}</SummaryRow>
        <SummaryRow label="Condition">{condition === 'timeLock' ? 'Time lock' : 'Milestones'}</SummaryRow>
        <SummaryRow label="Amount">{amountLabel}</SummaryRow>
        {condition === 'timeLock' ? (
          <SummaryRow label="Unlocks">
            {unlockDate ? new Date(`${unlockDate}T00:00:00Z`).toLocaleDateString() : 'Not set'}
          </SummaryRow>
        ) : (
          <SummaryRow label="Milestones">{milestoneCount > 0 ? milestoneCount : 'Not set'}</SummaryRow>
        )}
      </aside>
    </main>
  )
}
