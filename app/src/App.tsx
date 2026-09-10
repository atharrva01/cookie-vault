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

function NavLink({ to, children, onClick }: { to: string; children: ReactNode; onClick?: () => void }) {
  const { path } = useRoute()
  const active = path === to
  return (
    <a
      href={`#${to}`}
      className={`nav-link${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
        onClick?.()
      }}
    >
      {children}
    </a>
  )
}

function Topbar() {
  const up = useChainUp()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="topbar">
      <a
        href="#/"
        className="brand"
        onClick={(e) => {
          e.preventDefault()
          navigate('/')
          closeMenu()
        }}
      >
        {/* Letter mark, not an emoji: emoji glyphs depend on the OS having a color-emoji font
            installed and render as a blank box when it doesn't (confirmed on this machine). */}
        <span className="brand-mark" aria-hidden>
          C
        </span>
        Cookie Vault
      </a>

      <nav className={`main-nav${menuOpen ? ' open' : ''}`} aria-label="Primary">
        <NavLink to="/vaults" onClick={closeMenu}>
          My Vaults
        </NavLink>
        <NavLink to="/create" onClick={closeMenu}>
          Create Vault
        </NavLink>
        <NavLink to="/analytics" onClick={closeMenu}>
          Analytics
        </NavLink>
      </nav>

      <div className="topbar-right">
        <span className={`chain-badge${up ? '' : ' down'}`}>
          <span className="pulse" /> <span className="chain-badge-label">{up ? 'Cookie Chain' : 'RPC unreachable'}</span>
        </span>
        <WalletButton />
        <button
          type="button"
          className="ghost sm nav-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>
    </header>
  )
}

function Home() {
  return (
    <main>
      <section className="hero">
        <div>
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
          <div className="hero-actions">
            <button className="primary" onClick={() => navigate('/create')}>
              Create a vault
            </button>
            <button className="ghost" onClick={() => navigate('/vaults')}>
              Browse vaults
            </button>
          </div>
          <p className="hero-footnote">No admin key · PDA-custodied · Open source</p>
        </div>

        <div className="vault-preview" aria-hidden="true">
          <span className="vault-preview-tag">Preview</span>
          <div className="vault-preview-head">
            <span className="mono">Vault · 4f2a…9c1b</span>
            <span className="pill ok">Active</span>
          </div>
          <div className="vault-preview-amount">
            <span className="vault-preview-num">2,500</span>
            <span className="muted"> / 10,000 USDC released</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: '25%' }} />
          </div>
          <div className="vault-preview-milestone">
            <span>Milestone 2 of 4</span>
            <span className="muted small">pending approval</span>
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <h2 className="section-heading">How it works</h2>

        <div className="step-row">
          <span className="step-num">01</span>
          <div>
            <h3>Deposit</h3>
            <p className="muted small">
              The depositor locks the full amount into a program-derived vault up front. No admin key exists
              that could move it later.
            </p>
          </div>
        </div>

        <div className="step-row">
          <span className="step-num">02</span>
          <div>
            <h3>Choose a release condition</h3>
            <p className="muted small">
              Time lock unlocks the full balance once a date passes. Milestones split it into tranches, released
              as approvers sign off.
            </p>
          </div>
        </div>

        <div className="step-row">
          <span className="step-num">03</span>
          <div>
            <h3>Claim</h3>
            <p className="muted small">
              The recipient claims directly from the program. Before anything's claimed, the depositor can cancel
              and reclaim in full.
            </p>
          </div>
        </div>
      </section>
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
