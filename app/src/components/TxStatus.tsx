import { txUrl } from '../lib/chain'
import type { TxPhase } from '../lib/txStatus'

function StatusDot({ color, spin }: { color: string; spin?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        marginRight: 8,
        animation: spin ? 'dot-fade 1.2s infinite' : undefined,
      }}
    />
  )
}

export function TxStatus({ phase }: { phase: TxPhase }) {
  switch (phase.kind) {
    case 'idle':
      return null
    case 'building':
      return (
        <p className="muted small">
          <StatusDot color="var(--muted)" spin />
          Building transaction…
        </p>
      )
    case 'awaiting-signature':
      return (
        <p className="muted small">
          <StatusDot color="var(--accent)" spin />
          Waiting for you to sign in your wallet…
        </p>
      )
    case 'submitted':
      return (
        <p className="muted small">
          <StatusDot color="var(--accent)" spin />
          Submitted:{' '}
          <a href={txUrl(phase.signature)} target="_blank" rel="noreferrer">
            view on CookieScan
          </a>
          , waiting for confirmation…
        </p>
      )
    case 'confirmed':
      return (
        <p className="ok small">
          <StatusDot color="var(--ok)" />
          Confirmed:{' '}
          <a href={txUrl(phase.signature)} target="_blank" rel="noreferrer">
            view on CookieScan
          </a>
        </p>
      )
    case 'failed':
      return (
        <p className="error">
          <StatusDot color="var(--err)" />
          {phase.message}
        </p>
      )
  }
}
