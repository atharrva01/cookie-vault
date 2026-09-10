import { txUrl } from '../lib/chain'
import type { TxPhase } from '../lib/txStatus'

export function TxStatus({ phase }: { phase: TxPhase }) {
  switch (phase.kind) {
    case 'idle':
      return null
    case 'building':
      return <p className="muted small">Building transaction…</p>
    case 'awaiting-signature':
      return <p className="muted small">Waiting for you to sign in your wallet…</p>
    case 'submitted':
      return (
        <p className="muted small">
          Submitted —{' '}
          <a href={txUrl(phase.signature)} target="_blank" rel="noreferrer">
            view on CookieScan
          </a>
          , waiting for confirmation…
        </p>
      )
    case 'confirmed':
      return (
        <p className="ok small">
          Confirmed —{' '}
          <a href={txUrl(phase.signature)} target="_blank" rel="noreferrer">
            view on CookieScan
          </a>
        </p>
      )
    case 'failed':
      return <p className="error">{phase.message}</p>
  }
}
