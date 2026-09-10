pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("35GMkSwvDYLk1FYjXcMBp2PosgkYCQVFPByAsvEm9147");

#[program]
pub mod cookie_vault {
    use super::*;

    /// Creates a vault and moves `total_amount` of `mint` from the
    /// depositor's token account into the vault's PDA-owned custody.
    ///
    /// `unlock_timestamp` is required (and must be in the future) for
    /// `ConditionType::TimeLock`; `milestone_amounts` is required (must sum
    /// to `total_amount`, at most `MAX_MILESTONES` entries) for
    /// `ConditionType::Milestone`. The other field must be left unset.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_id: u64,
        recipient: Pubkey,
        condition_type: ConditionType,
        total_amount: u64,
        unlock_timestamp: Option<i64>,
        milestone_amounts: Option<Vec<u64>>,
    ) -> Result<()> {
        instructions::initialize_vault::handle_initialize_vault(
            ctx,
            vault_id,
            recipient,
            condition_type,
            total_amount,
            unlock_timestamp,
            milestone_amounts,
        )
    }

    /// Claims released funds. `milestone_index` is required for
    /// `ConditionType::Milestone` vaults and must be left unset for
    /// `ConditionType::TimeLock`, which releases everything at once, once,
    /// after `unlock_timestamp`.
    pub fn claim(ctx: Context<Claim>, milestone_index: Option<u8>) -> Result<()> {
        instructions::claim::handle_claim(ctx, milestone_index)
    }

    /// Records that `approver` (currently always the depositor —
    /// `vault.approvers`/`vault.threshold` are the extension point for
    /// future multi-signature approval) signs off on one milestone. Once a
    /// milestone's approval count reaches `vault.threshold`, the recipient
    /// can claim it.
    pub fn approve_milestone(ctx: Context<ApproveMilestone>, milestone_index: u8) -> Result<()> {
        instructions::approve_milestone::handle_approve_milestone(ctx, milestone_index)
    }
}
