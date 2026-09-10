use anchor_lang::prelude::*;

use crate::constants::{MAX_APPROVERS, MAX_MILESTONES};

#[account]
#[derive(InitSpace)]
pub struct Vault {
    /// Who funded the vault; the only signer allowed to cancel it.
    pub depositor: Pubkey,
    /// Who can claim released funds.
    pub recipient: Pubkey,
    /// Which SPL / Token-2022 mint this vault holds.
    pub mint: Pubkey,
    /// Nonce so the same depositor/recipient pair can open multiple vaults.
    pub vault_id: u64,
    pub condition_type: ConditionType,
    pub total_amount: u64,
    pub released_amount: u64,
    /// Set when `condition_type == TimeLock`, `None` otherwise.
    pub unlock_timestamp: Option<i64>,
    /// Set when `condition_type == Milestone`, empty otherwise.
    #[max_len(MAX_MILESTONES)]
    pub milestones: Vec<Milestone>,
    /// Addresses allowed to approve a milestone. `[depositor]` today;
    /// multi-sig later is adding more addresses here and raising `threshold`.
    #[max_len(MAX_APPROVERS)]
    pub approvers: Vec<Pubkey>,
    /// Approvals required per milestone. `1` today.
    pub threshold: u8,
    pub cancelled: bool,
    /// PDA bump, stored so the vault can sign its own CPIs without
    /// re-deriving it on every instruction.
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Milestone {
    pub amount: u64,
    /// Who has signed off so far. Claimable once `len() >= vault.threshold`
    /// — not stored as a separate bool, to avoid two sources of truth.
    #[max_len(MAX_APPROVERS)]
    pub approved_by: Vec<Pubkey>,
    pub claimed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ConditionType {
    TimeLock,
    Milestone,
}
