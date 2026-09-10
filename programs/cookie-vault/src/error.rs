use anchor_lang::prelude::*;

#[error_code]
pub enum CookieVaultError {
    #[msg("Milestone amounts don't sum to the deposited total, or a required field is missing for this condition type")]
    InvalidCondition,
    #[msg("This vault can't be claimed yet — the unlock time hasn't passed")]
    TooEarly,
    #[msg("This milestone hasn't reached its approval threshold yet")]
    NotApproved,
    #[msg("This vault or milestone has already been claimed")]
    AlreadyClaimed,
    #[msg("This signer has already approved this milestone")]
    AlreadyApproved,
    #[msg("This signer isn't authorized to perform this action")]
    Unauthorized,
    #[msg("A vault can only be cancelled before any funds have been released")]
    CancelAfterClaim,
    #[msg("This vault has been cancelled")]
    VaultCancelled,
    #[msg("Too many milestones for a single vault")]
    TooManyMilestones,
}
