import { useContext } from 'react'
import { WalletStateContext, type WalletState } from '../components/WalletContext'

export function useWallet(): WalletState {
  const ctx = useContext(WalletStateContext)
  if (!ctx) throw new Error('useWallet must be used inside a WalletProvider')
  return ctx
}
