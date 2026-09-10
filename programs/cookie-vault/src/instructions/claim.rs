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
        // Milestone claims land in Phase 3; this match arm exists now so
        // adding them there is additive rather than a rewrite of `claim`.
        ConditionType::Milestone => return err!(CookieVaultError::InvalidCondition),
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
