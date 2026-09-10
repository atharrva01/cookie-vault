mod common;

use anchor_lang::{prelude::Pubkey, solana_program::clock::Clock};
use cookie_vault::{ConditionType, Vault};
use solana_keypair::Keypair;
use solana_signer::Signer;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id;
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

use common::*;

/// Creates a time-lock vault unlocking `unlock_delay_seconds` from now and
/// returns its PDA and token account. Shared setup for every claim test.
fn setup_time_lock_vault(f: &mut Fixture, unlock_delay_seconds: i64) -> (Pubkey, Pubkey) {
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_ata = vault_token_account(&vault, &f.mint);
    let unlock_timestamp = f.svm.get_sysvar::<Clock>().unix_timestamp + unlock_delay_seconds;

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

#[test]
fn claim_time_lock_before_unlock_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f, 3600);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let ix = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    let result = submit(&mut f.svm, &f.recipient, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::TooEarly);
}

#[test]
fn claim_time_lock_happy_path() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f, 3600);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    // Recipient has never held this mint — the claim must create their ATA
    // itself (init_if_needed), not assume it already exists.
    assert!(f.svm.get_account(&recipient_ata).is_none());

    warp_clock(&mut f.svm, 3601);

    let ix = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    submit(&mut f.svm, &f.recipient, &[ix], &[]).unwrap();

    assert_eq!(token_balance(&f.svm, &recipient_ata), ONE_TOKEN);
    assert_eq!(token_balance(&f.svm, &vault_ata), 0);

    let vault_state: Vault = account_state(&f.svm, &vault);
    assert_eq!(vault_state.released_amount, ONE_TOKEN);
}

#[test]
fn claim_time_lock_double_claim_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f, 3600);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );
    warp_clock(&mut f.svm, 3601);

    let first = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    submit(&mut f.svm, &f.recipient, &[first], &[]).unwrap();

    // Otherwise the second transaction is byte-identical to the first and
    // the SVM rejects it as a duplicate before the program ever runs.
    f.svm.expire_blockhash();

    let second = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        None,
    );
    let result = submit(&mut f.svm, &f.recipient, &[second], &[]);
    assert_error(result, cookie_vault::CookieVaultError::AlreadyClaimed);
}

#[test]
fn claim_time_lock_wrong_signer_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_time_lock_vault(&mut f, 3600);
    warp_clock(&mut f.svm, 3601);

    let impostor = Keypair::new();
    f.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    let impostor_ata = get_associated_token_address_with_program_id(
        &impostor.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let ix = claim_ix(
        &impostor.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &impostor_ata,
        None,
    );
    let result = submit(&mut f.svm, &impostor, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::Unauthorized);
}
