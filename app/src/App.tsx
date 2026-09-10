import { useEffect, useState, type ReactNode } from 'react'
import { WalletProvider } from './components/WalletContext'
import { WalletButton } from './components/WalletButton'
import { connection } from './lib/chain'
import { isMockMode } from './lib/mock'
import { navigate, useRoute } from './lib/router'
import CreateVault from './pages/CreateVault'
import MyVaults from './pages/MyVaults'
import VaultDetail from './pages/VaultDetail'
import Analytics from './pages/Analytics'

function useChainUp(): boolean {
  const [up, setUp] = useState(true)
  useEffect(() => {
    let cancelled = false
    const check = () =>
      connection
        .getSlot()
        .then(() => !cancelled && setUp(true))
        .catch(() => !cancelled && setUp(false))
    check()
    const id = setInterval(check, 10_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])
  return up
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const { path } = useRoute()
  const active = path === to
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
      style={active ? { color: 'var(--text)', fontWeight: 700 } : undefined}
    >
      {children}
    </a>
  )
}

function Topbar() {
  const up = useChainUp()
  return (
    <header className="topbar">
      <NavLink to="/">
        <span className="brand">
          <span aria-hidden>🍪</span> Cookie Vault
        </span>
      </NavLink>
      <nav style={{ display: 'flex', gap: 14 }}>
        <NavLink to="/vaults">My Vaults</NavLink>
        <NavLink to="/create">Create Vault</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
      </nav>
      <div className="topbar-right">
        <span className={`chain-badge${up ? '' : ' down'}`}>
          <span className="pulse" /> {up ? 'Cookie Chain' : 'RPC unreachable'}
        </span>
        <WalletButton />
      </div>
    </header>
  )
}

function Home() {
  return (
    <main>
      <section className="hero">
        <span className="eyebrow">Programmable escrow, on-chain</span>
        <h1>
          Lock funds. Release them
          <br />
          on your terms.
        </h1>
        <p className="lead">
          A full unlock on a date, or milestone-by-milestone as work is delivered and approved. Custody lives in
          a program-derived account, not a person's keypair.
        </p>
        <div className="pill-row">
          <span className="pill">No admin key</span>
          <span className="pill">PDA-custodied</span>
          <span className="pill">Open source</span>
        </div>
        <button className="primary" onClick={() => navigate('/create')}>
          Create a vault
        </button>
      </section>

      <div className="callout-highlight">
        <h2>Trustless by construction</h2>
        <p className="muted" style={{ maxWidth: 560, margin: '0 auto' }}>
          Funds are held by a Program Derived Address that only Cookie Vault's own instruction logic can move.
          There's no backdoor and no "trust me" step: the depositor locks the full amount up front, and the
          program enforces the release conditions on-chain.
        </p>
      </div>

      <div className="feature-grid">
        <div className="card">
          <h3>Time lock</h3>
          <p className="muted small">Funds unlock in full once a date you choose has passed.</p>
        </div>
        <div className="card">
          <h3>Milestones</h3>
          <p className="muted small">Split a vault into tranches, and release each one as it's approved.</p>
        </div>
        <div className="card">
          <h3>Cancel anytime</h3>
          <p className="muted small">Before anything's claimed, the depositor can cancel and reclaim in full.</p>
        </div>
      </div>
    </main>
  )
}

function MockBanner() {
  if (!isMockMode()) return null
  return (
    <div className="callout warn" style={{ margin: '0 20px', marginTop: 12 }}>
      <strong>Mock mode.</strong> "{`Mock Wallet (dev)`}" in the wallet picker is a freshly generated, unfunded
      keypair. Reads hit the real Cookie Chain network, but any write will correctly fail with "insufficient
      funds" once it reaches the chain. For UI testing only; drop <span className="mono">?mock=1</span> from the
      URL for the real thing.
    </div>
  )
}

function NotFound() {
  return (
    <main>
      <p>Nothing here.</p>
      <button className="ghost" onClick={() => navigate('/')}>
        Back home
      </button>
    </main>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      Cookie Vault is open source.{' '}
      <a href="https://github.com/atharrva01/cookie-vault" target="_blank" rel="noreferrer">
        View on GitHub
      </a>
      {' · '}
      <a href="https://docs.cookiechain.wtf" target="_blank" rel="noreferrer">
        Cookie Chain docs
      </a>
    </footer>
  )
}

function Routes() {
  const { path } = useRoute()
  switch (path) {
    case '/':
      return <Home />
    case '/create':
      return <CreateVault />
    case '/vaults':
      return <MyVaults />
    case '/vault':
      return <VaultDetail />
    case '/analytics':
      return <Analytics />
    default:
      return <NotFound />
  }
}

export default function App() {
  return (
    <WalletProvider>
      <Topbar />
      <MockBanner />
      <Routes />
      <Footer />
    </WalletProvider>
  )
}
