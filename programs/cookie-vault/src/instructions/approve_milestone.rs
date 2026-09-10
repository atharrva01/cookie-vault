use anchor_lang::prelude::*;

use crate::{constants::VAULT_SEED, error::CookieVaultError, state::Vault};

#[derive(Accounts)]
pub struct ApproveMilestone<'info> {
    pub approver: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.depositor.as_ref(),
            vault.recipient.as_ref(),
            vault.vault_id.to_le_bytes().as_ref(),
        ],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_approve_milestone(ctx: Context<ApproveMilestone>, milestone_index: u8) -> Result<()> {
    let approver = ctx.accounts.approver.key();
    let vault = &mut ctx.accounts.vault;

    require!(!vault.cancelled, CookieVaultError::VaultCancelled);
    require!(
        vault.approvers.contains(&approver),
        CookieVaultError::Unauthorized
    );

    let milestone = vault
        .milestones
        .get_mut(milestone_index as usize)
        .ok_or(CookieVaultError::InvalidCondition)?;

    require!(!milestone.claimed, CookieVaultError::AlreadyClaimed);
    // Without this, one approver could push their own address twice and
    // (once multi-sig raises `threshold` above 1) inflate the approval count
    // on their own — a bypass that's invisible today at `threshold == 1` but
    // must not be left for the extension to trip over later.
    require!(
        !milestone.approved_by.contains(&approver),
        CookieVaultError::AlreadyApproved
    );

    milestone.approved_by.push(approver);

    Ok(())
}
