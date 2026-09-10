use anchor_lang::prelude::*;

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

/// Fixed upper bound on tranches in a milestone vault. Anchor accounts have
/// fixed space allocated at `init` time, so `Vault::milestones` needs a hard
/// cap for `InitSpace` to compute a size.
///
/// Fixed-width `u8`, not `usize` — Anchor's IDL-build macro has no IDL type
/// mapping for `usize` (it has no fixed cross-platform width) and fails to
/// compile with `#[constant]` if it's used here. Cast to `usize` at use
/// sites that need it (`Vec::len()` comparisons, `vec![x; n]`, etc.).
#[constant]
pub const MAX_MILESTONES: u8 = 10;

/// Fixed upper bound on approvers per vault (and, per milestone, on how many
/// of them can have signed off). 1 approver is used today; this cap is the
/// extensibility point for multi-signature approval later. `u8` for the same
/// reason as `MAX_MILESTONES`.
#[constant]
pub const MAX_APPROVERS: u8 = 5;
