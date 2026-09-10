use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Fixed upper bound on tranches in a milestone vault. Anchor accounts have
/// fixed space allocated at `init` time, so `Vault::milestones` needs a hard
/// cap for `InitSpace` to compute a size.
#[constant]
pub const MAX_MILESTONES: usize = 10;

/// Fixed upper bound on approvers per vault (and, per milestone, on how many
/// of them can have signed off). 1 approver is used today; this cap is the
/// extensibility point for multi-signature approval later.
#[constant]
pub const MAX_APPROVERS: usize = 5;
