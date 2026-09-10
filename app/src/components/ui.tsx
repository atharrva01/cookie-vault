import { useState } from 'react'
import { addressUrl, shortAddr, txUrl } from '../lib/chain'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="ghost sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  )
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={value} />
      </div>
    </div>
  )
}

export function AddressLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <a className="mono" href={addressUrl(address)} target="_blank" rel="noreferrer" title={address}>
      {name ? `${name} (${shortAddr(address)})` : shortAddr(address, 8)}
    </a>
  )
}

export function TxLink({ signature }: { signature: string }) {
  return (
    <a className="mono" href={txUrl(signature)} target="_blank" rel="noreferrer" title={signature}>
      {shortAddr(signature, 8)} ↗
    </a>
  )
}
