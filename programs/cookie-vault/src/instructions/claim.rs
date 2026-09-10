use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::VAULT_SEED,
    error::CookieVaultError,
    state::{ConditionType, Vault},
};

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub recipient: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.depositor.as_ref(),
            vault.recipient.as_ref(),
            vault.vault_id.to_le_bytes().as_ref(),
        ],
        bump = vault.bump,
        has_one = recipient @ CookieVaultError::Unauthorized,
    )]
    pub vault: Account<'info, Vault>,

    #[account(address = vault.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Created on demand — the recipient may never have held this mint before.
    #[account(
        init_if_needed,
        payer = recipient,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_claim(ctx: Context<Claim>, milestone_index: Option<u8>) -> Result<()> {
    require!(
        !ctx.accounts.vault.cancelled,
        CookieVaultError::VaultCancelled
    );

    let amount = match ctx.accounts.vault.condition_type {
        ConditionType::TimeLock => claim_time_lock(&ctx.accounts.vault, milestone_index)?,
        ConditionType::Milestone => claim_milestone(&ctx.accounts.vault, milestone_index)?,
    };

    let vault = &ctx.accounts.vault;
    let depositor = vault.depositor;
    let recipient = vault.recipient;
    let vault_id_bytes = vault.vault_id.to_le_bytes();
    let bump = vault.bump;
    let signer_seeds: &[&[u8]] = &[
        VAULT_SEED,
        depositor.as_ref(),
        recipient.as_ref(),
        vault_id_bytes.as_ref(),
        &[bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    ctx.accounts.vault.released_amount = ctx
        .accounts
        .vault
        .released_amount
        .checked_add(amount)
        .ok_or(CookieVaultError::InvalidCondition)?;

    // Only the milestone path has a per-tranche `claimed` flag to set — the
    // time-lock path uses `released_amount` itself as its completion marker,
    // and `claim_time_lock` already required `milestone_index.is_none()`.
    if let Some(index) = milestone_index {
        ctx.accounts.vault.milestones[index as usize].claimed = true;
    }

    Ok(())
}

/// Validates the time-lock claim conditions and returns the amount to
/// transfer. Doesn't mutate `vault` — the caller only updates
/// `released_amount` once the CPI has actually succeeded.
fn claim_time_lock(vault: &Vault, milestone_index: Option<u8>) -> Result<u64> {
    require!(
        milestone_index.is_none(),
        CookieVaultError::InvalidCondition
    );
    require!(vault.released_amount == 0, CookieVaultError::AlreadyClaimed);

    let unlock_timestamp = vault
        .unlock_timestamp
        .ok_or(CookieVaultError::InvalidCondition)?;
    require!(
        Clock::get()?.unix_timestamp >= unlock_timestamp,
        CookieVaultError::TooEarly
    );

    Ok(vault.total_amount - vault.released_amount)
}

/// Validates the milestone claim conditions and returns the amount to
/// transfer. Mirrors `claim_time_lock`: read-only, the caller applies state
/// changes (including marking the milestone claimed) once the CPI succeeds.
fn claim_milestone(vault: &Vault, milestone_index: Option<u8>) -> Result<u64> {
    let index = milestone_index.ok_or(CookieVaultError::InvalidCondition)?;
    let milestone = vault
        .milestones
        .get(index as usize)
        .ok_or(CookieVaultError::InvalidCondition)?;

    require!(!milestone.claimed, CookieVaultError::AlreadyClaimed);
    require!(
        milestone.approved_by.len() as u8 >= vault.threshold,
        CookieVaultError::NotApproved
    );

    Ok(milestone.amount)
}

#[cfg(test)]
mod tests {
    // `handle_claim` above adds each release to `vault.released_amount` with
    // `checked_add`, not `+=`. In practice that addition can never actually
    // overflow through the public instructions: `initialize_vault` requires
    // milestone amounts to sum to exactly `total_amount`, each milestone (or
    // the single time-lock release) can only be claimed once, so the running
    // total is structurally bounded by `total_amount <= u64::MAX` — there's
    // no reachable sequence of real transactions that overflows it. This
    // test exists to document that `checked_add` is still the right
    // primitive regardless, as defense in depth against that invariant ever
    // being loosened later, not because an integration test can reach it.
    #[test]
    fn released_amount_addition_is_checked_not_wrapping() {
        assert_eq!(u64::MAX.checked_add(1), None);
        assert_eq!(u64::MAX.checked_add(0), Some(u64::MAX));
    }
}
