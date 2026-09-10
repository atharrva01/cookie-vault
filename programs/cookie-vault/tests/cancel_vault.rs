mod common;

use anchor_lang::prelude::Pubkey;
use cookie_vault::{ConditionType, Vault};
use solana_keypair::Keypair;
use solana_signer::Signer;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id;
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

use common::*;

fn setup_time_lock_vault(f: &mut Fixture) -> (Pubkey, Pubkey) {
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);
    let unlock_timestamp = f
        .svm
        .get_sysvar::<anchor_lang::solana_program::clock::Clock>()
        .unix_timestamp
        + 3600;

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

    (vault, vault_ata)
}

fn setup_milestone_vault(f: &mut Fixture) -> (Pubkey, Pubkey) {
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);

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
        Some(vec![250_000, 250_000, 500_000]),
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    (vault, vault_ata)
}

#[test]
fn cancel_with_zero_claims_refunds_depositor() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f);

    let cancel = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    submit(&mut f.svm, &f.depositor, &[cancel], &[]).unwrap();

    assert_eq!(token_balance(&f.svm, &vault_ata), 0);
    assert_eq!(token_balance(&f.svm, &f.depositor_token_account), ONE_TOKEN);

    let vault_state: Vault = account_state(&f.svm, &vault);
    assert!(vault_state.cancelled);
}

#[test]
fn cancel_after_time_lock_claim_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );
    warp_clock(&mut f.svm, 3601);

    let claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    submit(&mut f.svm, &f.recipient, &[claim], &[]).unwrap();

    let cancel = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    let result = submit(&mut f.svm, &f.depositor, &[cancel], &[]);
    assert_error(result, cookie_vault::CookieVaultError::CancelAfterClaim);
}

#[test]
fn cancel_after_milestone_claim_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let approve = approve_milestone_ix(&f.depositor.pubkey(), &vault, 0);
    submit(&mut f.svm, &f.depositor, &[approve], &[]).unwrap();
    let claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        Some(0),
    );
    submit(&mut f.svm, &f.recipient, &[claim], &[]).unwrap();

    let cancel = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    let result = submit(&mut f.svm, &f.depositor, &[cancel], &[]);
    assert_error(result, cookie_vault::CookieVaultError::CancelAfterClaim);
}

#[test]
fn claim_on_cancelled_vault_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let cancel = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    submit(&mut f.svm, &f.depositor, &[cancel], &[]).unwrap();

    warp_clock(&mut f.svm, 3601);
    let claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    // Without the explicit `!vault.cancelled` guard this would instead fail
    // as a token-balance error (the vault ATA is empty) — a correct outcome
    // for the wrong reason, and a confusing error for the frontend to show.
    let result = submit(&mut f.svm, &f.recipient, &[claim], &[]);
    assert_error(result, cookie_vault::CookieVaultError::VaultCancelled);
}

#[test]
fn approve_on_cancelled_vault_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);

    let cancel = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    submit(&mut f.svm, &f.depositor, &[cancel], &[]).unwrap();

    let approve = approve_milestone_ix(&f.depositor.pubkey(), &vault, 0);
    let result = submit(&mut f.svm, &f.depositor, &[approve], &[]);
    assert_error(result, cookie_vault::CookieVaultError::VaultCancelled);
}

#[test]
fn double_cancel_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f);

    let first = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    submit(&mut f.svm, &f.depositor, &[first], &[]).unwrap();

    f.svm.expire_blockhash();
    let second = cancel_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &f.depositor_token_account,
    );
    let result = submit(&mut f.svm, &f.depositor, &[second], &[]);
    assert_error(result, cookie_vault::CookieVaultError::VaultCancelled);
}

#[test]
fn cancel_vault_wrong_signer_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f);

    let impostor = Keypair::new();
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    // `CancelVault::depositor_token_account` isn't `init`/`init_if_needed`
    // (unlike claim's recipient ATA) — it must already exist. Create it so
    // this test isolates the `has_one = depositor` check specifically,
    // rather than failing earlier on an unrelated "account not initialized".
    let impostor_ata = create_ata(&mut f.svm, &impostor, &f.mint);

    let cancel = cancel_vault_ix(
        &impostor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &impostor_ata,
    );
    let result = submit(&mut f.svm, &impostor, &[cancel], &[]);
    assert_error(result, cookie_vault::CookieVaultError::Unauthorized);
}
