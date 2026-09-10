mod common;

use anchor_lang::prelude::Pubkey;
use cookie_vault::{ConditionType, Vault};
use solana_signer::Signer;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id;
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

use common::*;

const MILESTONES: [u64; 3] = [250_000, 250_000, 500_000];

/// Creates a milestone vault (amounts from `MILESTONES`, summing to
/// `ONE_TOKEN`) and returns its PDA and token account. Shared setup for
/// every approve/milestone-claim test.
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
        Some(MILESTONES.to_vec()),
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    (vault, vault_ata)
}

#[test]
fn milestone_flow_end_to_end() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let mut released_so_far = 0u64;
    for (index, &amount) in MILESTONES.iter().enumerate() {
        let index = index as u8;

        let approve = approve_milestone_ix(&f.depositor.pubkey(), &vault, index);
        submit(&mut f.svm, &f.depositor, &[approve], &[]).unwrap();

        f.svm.expire_blockhash();
        let claim = claim_ix(
            &f.recipient.pubkey(),
            &vault,
            &f.mint,
            &vault_ata,
            &recipient_ata,
            Some(index),
        );
        submit(&mut f.svm, &f.recipient, &[claim], &[]).unwrap();
        f.svm.expire_blockhash();

        released_so_far += amount;
        assert_eq!(token_balance(&f.svm, &recipient_ata), released_so_far);
        assert_eq!(
            token_balance(&f.svm, &vault_ata),
            ONE_TOKEN - released_so_far
        );

        let vault_state: Vault = account_state(&f.svm, &vault);
        assert_eq!(vault_state.released_amount, released_so_far);
        assert!(vault_state.milestones[index as usize].claimed);
        // The other milestones' balances stay locked — only this one moved.
        for (other_index, milestone) in vault_state.milestones.iter().enumerate() {
            if other_index as u8 != index {
                assert_eq!(milestone.claimed, other_index < index as usize);
            }
        }
    }

    assert_eq!(token_balance(&f.svm, &vault_ata), 0);
}

#[test]
fn claim_milestone_before_approval_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        Some(1),
    );
    let result = submit(&mut f.svm, &f.recipient, &[claim], &[]);
    assert_error(result, cookie_vault::CookieVaultError::NotApproved);
}

#[test]
fn approve_milestone_twice_by_same_signer_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, _vault_ata) = setup_milestone_vault(&mut f);

    let first = approve_milestone_ix(&f.depositor.pubkey(), &vault, 0);
    submit(&mut f.svm, &f.depositor, &[first], &[]).unwrap();

    // Same signer, same milestone — byte-identical to the first approval.
    f.svm.expire_blockhash();
    let second = approve_milestone_ix(&f.depositor.pubkey(), &vault, 0);
    let result = submit(&mut f.svm, &f.depositor, &[second], &[]);
    assert_error(result, cookie_vault::CookieVaultError::AlreadyApproved);
}

#[test]
fn double_claim_same_milestone_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let approve = approve_milestone_ix(&f.depositor.pubkey(), &vault, 0);
    submit(&mut f.svm, &f.depositor, &[approve], &[]).unwrap();

    let first_claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        Some(0),
    );
    submit(&mut f.svm, &f.recipient, &[first_claim], &[]).unwrap();

    f.svm.expire_blockhash();
    let second_claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        Some(0),
    );
    let result = submit(&mut f.svm, &f.recipient, &[second_claim], &[]);
    assert_error(result, cookie_vault::CookieVaultError::AlreadyClaimed);
}

#[test]
fn claim_out_of_range_milestone_index_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, vault_ata) = setup_milestone_vault(&mut f);
    let recipient_ata = get_associated_token_address_with_program_id(
        &f.recipient.pubkey(),
        &f.mint,
        &TOKEN_PROGRAM_ID,
    );

    let claim = claim_ix(
        &f.recipient.pubkey(),
        &vault,
        &f.mint,
        &vault_ata,
        &recipient_ata,
        Some(99),
    );
    let result = submit(&mut f.svm, &f.recipient, &[claim], &[]);
    assert_error(result, cookie_vault::CookieVaultError::InvalidCondition);
}

#[test]
fn approve_out_of_range_milestone_index_fails() {
    let mut f = setup(ONE_TOKEN);
    let (vault, _vault_ata) = setup_milestone_vault(&mut f);

    let approve = approve_milestone_ix(&f.depositor.pubkey(), &vault, 99);
    let result = submit(&mut f.svm, &f.depositor, &[approve], &[]);
    assert_error(result, cookie_vault::CookieVaultError::InvalidCondition);
}
