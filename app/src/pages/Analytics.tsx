import { useEffect, useState } from 'react'
import { connection, formatUnits, fmtUsd, shortAddr } from '../lib/chain'
import { fetchVaultStats, type VaultStats } from '../lib/analytics'
import { resolveMint, type TokenInfo } from '../lib/das'
import { buildReadOnlyProvider } from '../lib/idl'

interface BarDatum {
  label: string
  value: number
  color: string
}

/** Dependency-free inline SVG bar chart — design_doc.md §6's choice over pulling in a charting library. */
function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const labelWidth = 90
  const barMaxWidth = 200
  const barHeight = 20
  const rowHeight = 30
  const height = data.length * rowHeight

  return (
    <svg
      viewBox={`0 0 ${labelWidth + barMaxWidth + 50} ${height}`}
      style={{ width: '100%', maxWidth: 380, height: 'auto' }}
      role="img"
      aria-label="Vault status breakdown"
    >
      {data.map((d, i) => {
        const barWidth = (d.value / max) * barMaxWidth
        const y = i * rowHeight
        return (
          <g key={d.label}>
            <text x={0} y={y + barHeight / 2} dy="0.35em" fontSize="12" fill="var(--muted)">
              {d.label}
            </text>
            <rect x={labelWidth} y={y} width={Math.max(barWidth, d.value > 0 ? 3 : 0)} height={barHeight} rx={4} fill={d.color} />
            <text x={labelWidth + barWidth + 8} y={y + barHeight / 2} dy="0.35em" fontSize="12" fill="var(--text)">
              {d.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function useVaultStats() {
  const [stats, setStats] = useState<VaultStats | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    fetchVaultStats(buildReadOnlyProvider(connection))
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null))
    return () => {
      cancelled = true
    }
  }, [])
  return stats
}

export default function Analytics() {
  const stats = useVaultStats()
  const [mintInfo, setMintInfo] = useState<Record<string, TokenInfo>>({})

  useEffect(() => {
    if (!stats) return
    stats.lockedByMint.forEach(({ mint }) => {
      const key = mint.toBase58()
      if (key in mintInfo) return
      void resolveMint(key).then((r) => {
        if (r) setMintInfo((prev) => ({ ...prev, [key]: r.info }))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats])

  if (stats === undefined) {
    return (
      <main>
        <h1>Analytics</h1>
        <p className="muted">Loading…</p>
      </main>
    )
  }
  if (stats === null) {
    return (
      <main>
        <h1>Analytics</h1>
        <p className="error">Couldn't load program-wide vault data.</p>
      </main>
    )
  }

  const chartData: BarDatum[] = [
    { label: 'Active', value: stats.active, color: 'var(--accent)' },
    { label: 'Released', value: stats.fullyReleased, color: 'var(--ok)' },
    { label: 'Cancelled', value: stats.cancelled, color: 'var(--muted)' },
  ]

  let knownUsd = 0
  let hasUnknownPrice = false

  return (
    <main>
      <h1>Analytics</h1>
      <p className="lead">Every vault Cookie Vault has ever created on Cookie Chain, not just yours.</p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div className="muted small">Total vaults</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{stats.totalVaults}</div>
          </div>
          <div>
            <div className="muted small">Claim rate</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
              {stats.totalVaults > 0 ? `${Math.round((stats.fullyReleased / stats.totalVaults) * 100)}%` : 'N/A'}
            </div>
          </div>
        </div>
        <BarChart data={chartData} />
      </div>

      <div className="card">
        <h2>Total value locked</h2>
        {stats.lockedByMint.length === 0 && <p className="muted small">Nothing currently locked.</p>}
        {stats.lockedByMint.map(({ mint, locked }) => {
          const info = mintInfo[mint.toBase58()]
          const amount = info ? formatUnits(locked.toString(), info.decimals, 4) : locked.toString()
          const usd = info?.priceUsd !== undefined ? (Number(locked) / 10 ** info.decimals) * info.priceUsd : undefined
          if (usd !== undefined) knownUsd += usd
          else hasUnknownPrice = true
          return (
            <div key={mint.toBase58()} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
              <span>{info ? `${info.name} (${info.symbol})` : shortAddr(mint.toBase58())}</span>
              <span>
                {amount} {info?.symbol ?? ''}
                {usd !== undefined && <span className="muted small"> ({fmtUsd(usd)})</span>}
              </span>
            </div>
          )
        })}
        {stats.lockedByMint.length > 0 && (
          <p className="muted small" style={{ marginTop: 10 }}>
            ≈ {fmtUsd(knownUsd)} total{hasUnknownPrice ? ' (price unavailable for one or more tokens above)' : ''}
          </p>
        )}
      </div>
    </main>
  )
}
