use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{
    constants::{MAX_MILESTONES, VAULT_SEED},
    error::CookieVaultError,
    state::{ConditionType, Milestone, Vault},
};

#[derive(Accounts)]
#[instruction(vault_id: u64, recipient: Pubkey)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        init,
        payer = depositor,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, depositor.key().as_ref(), recipient.as_ref(), vault_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = depositor,
        associated_token::token_program = token_program,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The vault's own token account — an ATA owned by the `vault` PDA, not
    /// by a person. This is where the deposited tokens actually live; `vault`
    /// above is only the metadata describing the release rules.
    #[account(
        init,
        payer = depositor,
        associated_token::mint = mint,
        associated_token::authority = vault,
        associated_token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(
    ctx: Context<InitializeVault>,
    vault_id: u64,
    recipient: Pubkey,
    condition_type: ConditionType,
    total_amount: u64,
    unlock_timestamp: Option<i64>,
    milestone_amounts: Option<Vec<u64>>,
) -> Result<()> {
    require!(total_amount > 0, CookieVaultError::InvalidCondition);

    let milestones = validate_condition(
        condition_type,
        total_amount,
        unlock_timestamp,
        &milestone_amounts,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.depositor = ctx.accounts.depositor.key();
    vault.recipient = recipient;
    vault.mint = ctx.accounts.mint.key();
    vault.vault_id = vault_id;
    vault.condition_type = condition_type;
    vault.total_amount = total_amount;
    vault.released_amount = 0;
    vault.unlock_timestamp = unlock_timestamp;
    vault.milestones = milestones;
    vault.approvers = vec![ctx.accounts.depositor.key()];
    vault.threshold = 1;
    vault.cancelled = false;
    vault.bump = ctx.bumps.vault;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        total_amount,
        ctx.accounts.mint.decimals,
    )?;

    Ok(())
}

/// Checks the condition-specific fields against `condition_type` and, for a
/// milestone vault, builds the initial `Milestone` list. Kept separate from
/// the handler so the validation rules read as one block instead of being
/// interleaved with account mutation.
fn validate_condition(
    condition_type: ConditionType,
    total_amount: u64,
    unlock_timestamp: Option<i64>,
    milestone_amounts: &Option<Vec<u64>>,
) -> Result<Vec<Milestone>> {
    match condition_type {
        ConditionType::TimeLock => {
            require!(
                milestone_amounts.is_none(),
                CookieVaultError::InvalidCondition
            );
            let unlock_timestamp = unlock_timestamp.ok_or(CookieVaultError::InvalidCondition)?;
            require!(
                unlock_timestamp > Clock::get()?.unix_timestamp,
                CookieVaultError::InvalidCondition
            );
            Ok(Vec::new())
        }
        ConditionType::Milestone => {
            require!(
                unlock_timestamp.is_none(),
                CookieVaultError::InvalidCondition
            );
            let amounts = milestone_amounts
                .as_ref()
                .ok_or(CookieVaultError::InvalidCondition)?;
            require!(!amounts.is_empty(), CookieVaultError::InvalidCondition);
            require!(
                amounts.len() <= MAX_MILESTONES,
                CookieVaultError::TooManyMilestones
            );

            let sum = amounts
                .iter()
                .try_fold(0u64, |acc, amount| acc.checked_add(*amount))
                .ok_or(CookieVaultError::InvalidCondition)?;
            require!(sum == total_amount, CookieVaultError::InvalidCondition);

            Ok(amounts
                .iter()
                .map(|&amount| Milestone {
                    amount,
                    approved_by: Vec::new(),
                    claimed: false,
                })
                .collect())
        }
    }
}
