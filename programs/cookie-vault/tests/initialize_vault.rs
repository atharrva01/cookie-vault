use anchor_lang::{
    prelude::Pubkey,
    solana_program::{instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use cookie_vault::{ConditionType, Vault};
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use spl_associated_token_account_interface::{
    address::get_associated_token_address_with_program_id,
    instruction::create_associated_token_account, program::id as associated_token_program_id,
};
use spl_token_interface::{
    instruction::{initialize_mint2, mint_to},
    state::{Account as SplTokenAccount, Mint as SplMint},
    ID as TOKEN_PROGRAM_ID,
};

const MINT_DECIMALS: u8 = 6;
// One COOK, in base units, at MINT_DECIMALS.
const ONE_TOKEN: u64 = 1_000_000;

/// Boots a `LiteSVM` with the compiled program loaded, funds `depositor` and
/// `recipient` with SOL for fees/rent, creates a fresh mint, and gives
/// `depositor` `total_amount` of it in their ATA. Everything a test needs to
/// call `initialize_vault` is set up by the time this returns.
struct Fixture {
    svm: LiteSVM,
    depositor: Keypair,
    recipient: Keypair,
    mint: Pubkey,
    depositor_token_account: Pubkey,
}

fn setup(total_amount: u64) -> Fixture {
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

fn create_mint(svm: &mut LiteSVM, payer: &Keypair, decimals: u8) -> Pubkey {
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

fn create_ata_with_balance(
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

fn vault_pda(depositor: &Pubkey, recipient: &Pubkey, vault_id: u64) -> (Pubkey, u8) {
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

#[allow(clippy::too_many_arguments)]
fn initialize_vault_ix(
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

// Test-only helper; boxing the error to satisfy `result_large_err` isn't
// worth the noise it'd add at every call site below.
#[allow(clippy::result_large_err)]
fn submit(
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

fn token_balance(svm: &LiteSVM, token_account: &Pubkey) -> u64 {
    let account = svm.get_account(token_account).unwrap();
    SplTokenAccount::unpack(&account.data).unwrap().amount
}

/// Anchor custom program errors are reported on-chain as
/// `InstructionError::Custom(6000 + variant_index)`.
fn assert_error(
    result: Result<(), FailedTransactionMetadata>,
    expected: cookie_vault::CookieVaultError,
) {
    use solana_transaction::{InstructionError, TransactionError};

    let err = result.expect_err("expected the transaction to fail").err;
    let expected_code = 6000 + expected as u32;
    match err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => {
            assert_eq!(code, expected_code, "wrong error code");
        }
        other => panic!("expected a custom program error, got {other:?}"),
    }
}

#[test]
fn initialize_vault_time_lock_happy_path() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_token_account =
        get_associated_token_address_with_program_id(&vault, &f.mint, &TOKEN_PROGRAM_ID);
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
        &vault_token_account,
        vault_id,
        ConditionType::TimeLock,
        ONE_TOKEN,
        Some(unlock_timestamp),
        None,
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    let raw = f.svm.get_account(&vault).unwrap();
    let vault_state = Vault::try_deserialize(&mut raw.data.as_slice()).unwrap();
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

    assert_eq!(token_balance(&f.svm, &vault_token_account), ONE_TOKEN);
    assert_eq!(token_balance(&f.svm, &f.depositor_token_account), 0);
}

#[test]
fn initialize_vault_milestone_happy_path() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_token_account =
        get_associated_token_address_with_program_id(&vault, &f.mint, &TOKEN_PROGRAM_ID);
    let milestones = vec![250_000, 250_000, 500_000];

    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_token_account,
        vault_id,
        ConditionType::Milestone,
        ONE_TOKEN,
        None,
        Some(milestones.clone()),
    );
    submit(&mut f.svm, &f.depositor, &[ix], &[]).unwrap();

    let raw = f.svm.get_account(&vault).unwrap();
    let vault_state = Vault::try_deserialize(&mut raw.data.as_slice()).unwrap();
    assert_eq!(vault_state.milestones.len(), 3);
    for (m, expected_amount) in vault_state.milestones.iter().zip(milestones) {
        assert_eq!(m.amount, expected_amount);
        assert!(m.approved_by.is_empty());
        assert!(!m.claimed);
    }
    assert_eq!(token_balance(&f.svm, &vault_token_account), ONE_TOKEN);
}

#[test]
fn initialize_vault_rejects_past_unlock_timestamp() {
    let mut f = setup(ONE_TOKEN);
    let vault_id = 1;
    let (vault, _bump) = vault_pda(&f.depositor.pubkey(), &f.recipient.pubkey(), vault_id);
    let vault_token_account =
        get_associated_token_address_with_program_id(&vault, &f.mint, &TOKEN_PROGRAM_ID);
    let past = f
        .svm
        .get_sysvar::<anchor_lang::solana_program::clock::Clock>()
        .unix_timestamp
        - 10;

    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_token_account,
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
    let vault_token_account =
        get_associated_token_address_with_program_id(&vault, &f.mint, &TOKEN_PROGRAM_ID);

    // Sums to 900_000, not the declared total of 1_000_000.
    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_token_account,
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
    let vault_token_account =
        get_associated_token_address_with_program_id(&vault, &f.mint, &TOKEN_PROGRAM_ID);

    let amounts = vec![ONE_TOKEN; cookie_vault::constants::MAX_MILESTONES + 1];
    let ix = initialize_vault_ix(
        &f.depositor.pubkey(),
        &vault,
        f.recipient.pubkey(),
        &f.mint,
        &f.depositor_token_account,
        &vault_token_account,
        vault_id,
        ConditionType::Milestone,
        total,
        None,
        Some(amounts),
    );
    let result = submit(&mut f.svm, &f.depositor, &[ix], &[]);
    assert_error(result, cookie_vault::CookieVaultError::TooManyMilestones);
}
