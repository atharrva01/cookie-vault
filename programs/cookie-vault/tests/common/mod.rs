//! Shared test scaffolding for the program's integration tests. Each file
//! under `tests/` is its own crate, so anything used by more than one of
//! them lives here instead of being copy-pasted per file.
//!
//! Each test binary gets its own copy of this module and only uses a subset
//! of it, so `dead_code` warnings here are expected, not a signal of an
//! actually-unused helper.
#![allow(dead_code)]

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{clock::Clock, instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use cookie_vault::ConditionType;
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::{versioned::VersionedTransaction, InstructionError, TransactionError};
use spl_associated_token_account_interface::{
    address::get_associated_token_address_with_program_id,
    instruction::create_associated_token_account, program::id as associated_token_program_id,
};
use spl_token_interface::{
    instruction::{initialize_mint2, mint_to},
    state::{Account as SplTokenAccount, Mint as SplMint},
    ID as TOKEN_PROGRAM_ID,
};

pub const MINT_DECIMALS: u8 = 6;
/// One COOK, in base units, at `MINT_DECIMALS`.
pub const ONE_TOKEN: u64 = 1_000_000;

/// Boots a `LiteSVM` with the compiled program loaded, funds `depositor` and
/// `recipient` with SOL for fees/rent, creates a fresh mint, and gives
/// `depositor` `total_amount` of it in their ATA. Everything a test needs to
/// call `initialize_vault` is set up by the time this returns.
pub struct Fixture {
    pub svm: LiteSVM,
    pub depositor: Keypair,
    pub recipient: Keypair,
    pub mint: Pubkey,
    pub depositor_token_account: Pubkey,
}

pub fn setup(total_amount: u64) -> Fixture {
    let mut svm = LiteSVM::new();
    let program_id = cookie_vault::id();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/cookie_vault.so"
    ));
    svm.add_program(program_id, bytes).unwrap();

    let depositor = Keypair::new();
    let recipient = Keypair::new();
    svm.airdrop(&depositor.pubkey(), 10_000_000_000).unwrap();
    svm.airdrop(&recipient.pubkey(), 10_000_000_000).unwrap();

    let mint = create_mint(&mut svm, &depositor, MINT_DECIMALS);
    let depositor_token_account =
        create_ata_with_balance(&mut svm, &depositor, &mint, total_amount);

    Fixture {
        svm,
        depositor,
        recipient,
        mint,
        depositor_token_account,
    }
}

pub fn create_mint(svm: &mut LiteSVM, payer: &Keypair, decimals: u8) -> Pubkey {
    let mint_kp = Keypair::new();
    let rent = svm.minimum_balance_for_rent_exemption(SplMint::LEN);
    let ixs = [
        system_instruction::create_account(
            &payer.pubkey(),
            &mint_kp.pubkey(),
            rent,
            SplMint::LEN as u64,
            &TOKEN_PROGRAM_ID,
        ),
        initialize_mint2(
            &TOKEN_PROGRAM_ID,
            &mint_kp.pubkey(),
            &payer.pubkey(),
            None,
            decimals,
        )
        .unwrap(),
    ];
    submit(svm, payer, &ixs, &[&mint_kp]).unwrap();
    mint_kp.pubkey()
}

/// Creates `payer`'s own ATA for `mint` with no balance — unlike
/// `create_ata_with_balance`, this doesn't mint, so it works for a keypair
/// that isn't the mint's authority.
pub fn create_ata(svm: &mut LiteSVM, payer: &Keypair, mint: &Pubkey) -> Pubkey {
    let ata =
        get_associated_token_address_with_program_id(&payer.pubkey(), mint, &TOKEN_PROGRAM_ID);
    let ix =
        create_associated_token_account(&payer.pubkey(), &payer.pubkey(), mint, &TOKEN_PROGRAM_ID);
    submit(svm, payer, &[ix], &[]).unwrap();
    ata
}

pub fn create_ata_with_balance(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: &Pubkey,
    amount: u64,
) -> Pubkey {
    let ata =
        get_associated_token_address_with_program_id(&payer.pubkey(), mint, &TOKEN_PROGRAM_ID);
    let ixs = [
        create_associated_token_account(&payer.pubkey(), &payer.pubkey(), mint, &TOKEN_PROGRAM_ID),
        mint_to(&TOKEN_PROGRAM_ID, mint, &ata, &payer.pubkey(), &[], amount).unwrap(),
    ];
    submit(svm, payer, &ixs, &[]).unwrap();
    ata
}

pub fn vault_pda(depositor: &Pubkey, recipient: &Pubkey, vault_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            cookie_vault::constants::VAULT_SEED,
            depositor.as_ref(),
            recipient.as_ref(),
            &vault_id.to_le_bytes(),
        ],
        &cookie_vault::id(),
    )
}

pub fn vault_token_account(vault: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(vault, mint, &TOKEN_PROGRAM_ID)
}

#[allow(clippy::too_many_arguments)]
pub fn initialize_vault_ix(
    depositor: &Pubkey,
    vault: &Pubkey,
    recipient: Pubkey,
    mint: &Pubkey,
    depositor_token_account: &Pubkey,
    vault_token_account: &Pubkey,
    vault_id: u64,
    condition_type: ConditionType,
    total_amount: u64,
    unlock_timestamp: Option<i64>,
    milestone_amounts: Option<Vec<u64>>,
) -> Instruction {
    Instruction::new_with_bytes(
        cookie_vault::id(),
        &cookie_vault::instruction::InitializeVault {
            vault_id,
            recipient,
            condition_type,
            total_amount,
            unlock_timestamp,
            milestone_amounts,
        }
        .data(),
        cookie_vault::accounts::InitializeVault {
            depositor: *depositor,
            vault: *vault,
            mint: *mint,
            depositor_token_account: *depositor_token_account,
            vault_token_account: *vault_token_account,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: associated_token_program_id(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

pub fn claim_ix(
    recipient: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    vault_token_account: &Pubkey,
    recipient_token_account: &Pubkey,
    milestone_index: Option<u8>,
) -> Instruction {
    Instruction::new_with_bytes(
        cookie_vault::id(),
        &cookie_vault::instruction::Claim { milestone_index }.data(),
        cookie_vault::accounts::Claim {
            recipient: *recipient,
            vault: *vault,
            mint: *mint,
            vault_token_account: *vault_token_account,
            recipient_token_account: *recipient_token_account,
            token_program: TOKEN_PROGRAM_ID,
            associated_token_program: associated_token_program_id(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

pub fn approve_milestone_ix(approver: &Pubkey, vault: &Pubkey, milestone_index: u8) -> Instruction {
    Instruction::new_with_bytes(
        cookie_vault::id(),
        &cookie_vault::instruction::ApproveMilestone { milestone_index }.data(),
        cookie_vault::accounts::ApproveMilestone {
            approver: *approver,
            vault: *vault,
        }
        .to_account_metas(None),
    )
}

pub fn cancel_vault_ix(
    depositor: &Pubkey,
    vault: &Pubkey,
    mint: &Pubkey,
    vault_token_account: &Pubkey,
    depositor_token_account: &Pubkey,
) -> Instruction {
    Instruction::new_with_bytes(
        cookie_vault::id(),
        &cookie_vault::instruction::CancelVault {}.data(),
        cookie_vault::accounts::CancelVault {
            depositor: *depositor,
            vault: *vault,
            mint: *mint,
            vault_token_account: *vault_token_account,
            depositor_token_account: *depositor_token_account,
            token_program: TOKEN_PROGRAM_ID,
        }
        .to_account_metas(None),
    )
}

// Test-only helper; boxing the error to satisfy `result_large_err` isn't
// worth the noise it'd add at every call site.
#[allow(clippy::result_large_err)]
pub fn submit(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ixs: &[Instruction],
    extra_signers: &[&Keypair],
) -> Result<(), FailedTransactionMetadata> {
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &blockhash);
    let mut signers = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
    svm.send_transaction(tx).map(|_| ())
}

pub fn token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    SplTokenAccount::unpack(&account.data).unwrap().amount
}

pub fn account_state<T: AccountDeserialize>(svm: &LiteSVM, address: &Pubkey) -> T {
    let raw = svm.get_account(address).unwrap();
    T::try_deserialize(&mut raw.data.as_slice()).unwrap()
}

/// Advances the simulated clock's `unix_timestamp` by `delta_seconds`
/// (negative moves it backward) and returns the new timestamp.
pub fn warp_clock(svm: &mut LiteSVM, delta_seconds: i64) -> i64 {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp += delta_seconds;
    svm.set_sysvar(&clock);
    clock.unix_timestamp
}

/// Anchor custom program errors are reported on-chain as
/// `InstructionError::Custom(6000 + variant_index)`.
pub fn assert_error(
    result: Result<(), FailedTransactionMetadata>,
    expected: cookie_vault::CookieVaultError,
) {
    let err = result.expect_err("expected the transaction to fail").err;
    let expected_code = 6000 + expected as u32;
    match err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => {
            assert_eq!(code, expected_code, "wrong error code");
        }
        other => panic!("expected a custom program error, got {other:?}"),
    }
}
