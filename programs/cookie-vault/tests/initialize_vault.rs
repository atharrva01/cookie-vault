mod common;

use anchor_lang::solana_program::clock::Clock;
use cookie_vault::{ConditionType, Vault};
use solana_signer::Signer;

use common::*;

#[test]
fn initialize_vault_time_lock_happy_path() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);
    let unlock_timestamp = f.svm.get_sysvar::<Clock>().unix_timestamp + 3600;

    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_ata,
        vault_id,
        ConditionType::TimeLock,
        ONE_TOKEN,
        Some(unlock_timestamp),
        None,
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    let vault_state: Vault = account_state(&f.svm, &vault);
    assert_eq!(vault_state.depositor, f.depositor.pubkey());
    assert_eq!(vault_state.recipient, f.recipient.pubkey());
    assert_eq!(vault_state.mint, f.mint);
    assert_eq!(vault_state.total_amount, ONE_TOKEN);
    assert_eq!(vault_state.released_amount, 0);
    assert_eq!(vault_state.unlock_timestamp, Some(unlock_timestamp));
    assert!(vault_state.milestones.is_empty());
    assert_eq!(vault_state.approvers, vec![f.depositor.pubkey()]);
    assert_eq!(vault_state.threshold, 1);
    assert!(!vault_state.cancelled);

    assert_eq!(token_balance(&f.svm, &vault_ata), ONE_TOKEN);
    assert_eq!(token_balance(&f.svm, &f.depositor_token_account), 0);
}

#[test]
fn initialize_vault_milestone_happy_path() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);
    let milestones = vec![250_000, 250_000, 500_000];

    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_ata,
        vault_id,
        ConditionType::Milestone,
        ONE_TOKEN,
        None,
        Some(milestones.clone()),
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    let vault_state: Vault = account_state(&f.svm, &vault);
    assert_eq!(vault_state.milestones.len(), 3);
    for (m, expected_amount) in vault_state.milestones.iter().zip(milestones) {
        assert_eq!(m.amount, expected_amount);
        assert!(m.approved_by.is_empty());
        assert!(!m.claimed);
    }
    assert_eq!(token_balance(&f.svm, &vault_ata), ONE_TOKEN);
}

#[test]
fn initialize_vault_rejects_past_unlock_timestamp() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);
    let past = f.svm.get_sysvar::<Clock>().unix_timestamp - 10;

    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_ata,
        vault_id,
        ConditionType::TimeLock,
        ONE_TOKEN,
        Some(past),
        None,
    );
    let result = submit(&mut f.svm, &f.depositor, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::InvalidCondition);
}

#[test]
fn initialize_vault_rejects_milestone_sum_mismatch() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);

    // Sums to 900_000, not the declared total of 1_000_000.
    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_ata,
        vault_id,
        ConditionType::Milestone,
        ONE_TOKEN,
        None,
        Some(vec![400_000, 500_000]),
    );
    let result = submit(&mut f.svm, &f.depositor, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::InvalidCondition);
}

#[test]
fn initialize_vault_rejects_too_many_milestones() {
    let total = (cookie_vault::constants::MAX_MILESTONES as u64 + 1) * ONE_TOKEN;
    let mut f = setup(total);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);

    let amounts = vec![ONE_TOKEN; cookie_vault::constants::MAX_MILESTONES + 1];
    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_ata,
        vault_id,
        ConditionType::Milestone,
        total,
        None,
        Some(amounts),
    );
    let result = submit(&mut f.svm, &f.depositor, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::TooManyMilestones);
}
