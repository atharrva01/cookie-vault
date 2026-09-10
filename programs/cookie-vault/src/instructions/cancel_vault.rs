use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::{constants::VAULT_SEED, error::CookieVaultError, state::Vault};

#[derive(Accounts)]
pub struct CancelVault<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [
            VAULT_SEED,
            vault.depositor.as_ref(),
            vault.recipient.as_ref(),
            vault.vault_id.to_le_bytes().as_ref(),
        ],
        bump = vault.bump,
        has_one = depositor @ CookieVaultError::Unauthorized,
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

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = depositor,
        associated_token::token_program = token_program,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_cancel_vault(ctx: Context<CancelVault>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    require!(!vault.cancelled, CookieVaultError::VaultCancelled);
    require!(
        vault.released_amount == 0,
        CookieVaultError::CancelAfterClaim
    );

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

    let remaining_balance = ctx.accounts.vault_token_account.amount;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.depositor_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[signer_seeds],
        ),
        remaining_balance,
        ctx.accounts.mint.decimals,
    )?;

    ctx.accounts.vault.cancelled = true;

    Ok(())
}
