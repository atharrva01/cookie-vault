/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/cookie_vault.json`.
 */
export type CookieVault = {
  "address": "35GMkSwvDYLk1FYjXcMBp2PosgkYCQVFPByAsvEm9147",
  "metadata": {
    "name": "cookieVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "approveMilestone",
      "docs": [
        "Records that `approver` (currently always the depositor —",
        "`vault.approvers`/`vault.threshold` are the extension point for",
        "future multi-signature approval) signs off on one milestone. Once a",
        "milestone's approval count reaches `vault.threshold`, the recipient",
        "can claim it."
      ],
      "discriminator": [
        145,
        85,
        92,
        60,
        50,
        130,
        219,
        106
      ],
      "accounts": [
        {
          "name": "approver",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.depositor",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.recipient",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "milestoneIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cancelVault",
      "docs": [
        "Refunds the depositor the full remaining vault balance and marks it",
        "cancelled. Only allowed before anything has been claimed — once any",
        "funds are released, the deal is considered in progress and the vault",
        "can no longer be unwound."
      ],
      "discriminator": [
        150,
        95,
        141,
        252,
        158,
        53,
        60,
        102
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.depositor",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.recipient",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "depositorTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "docs": [
        "Claims released funds. `milestone_index` is required for",
        "`ConditionType::Milestone` vaults and must be left unset for",
        "`ConditionType::TimeLock`, which releases everything at once, once,",
        "after `unlock_timestamp`."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "recipient",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.depositor",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.recipient",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.vaultId",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientTokenAccount",
          "docs": [
            "Created on demand — the recipient may never have held this mint before."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "milestoneIndex",
          "type": {
            "option": "u8"
          }
        }
      ]
    },
    {
      "name": "initializeVault",
      "docs": [
        "Creates a vault and moves `total_amount` of `mint` from the",
        "depositor's token account into the vault's PDA-owned custody.",
        "",
        "`unlock_timestamp` is required (and must be in the future) for",
        "`ConditionType::TimeLock`; `milestone_amounts` is required (must sum",
        "to `total_amount`, at most `MAX_MILESTONES` entries) for",
        "`ConditionType::Milestone`. The other field must be left unset."
      ],
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "depositor",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "arg",
                "path": "recipient"
              },
              {
                "kind": "arg",
                "path": "vaultId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "depositorTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "depositor"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vaultTokenAccount",
          "docs": [
            "The vault's own token account — an ATA owned by the `vault` PDA, not",
            "by a person. This is where the deposited tokens actually live; `vault`",
            "above is only the metadata describing the release rules."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "vaultId",
          "type": "u64"
        },
        {
          "name": "recipient",
          "type": "pubkey"
        },
        {
          "name": "conditionType",
          "type": {
            "defined": {
              "name": "conditionType"
            }
          }
        },
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "unlockTimestamp",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "milestoneAmounts",
          "type": {
            "option": {
              "vec": "u64"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidCondition",
      "msg": "Milestone amounts don't sum to the deposited total, or a required field is missing for this condition type"
    },
    {
      "code": 6001,
      "name": "tooEarly",
      "msg": "This vault can't be claimed yet — the unlock time hasn't passed"
    },
    {
      "code": 6002,
      "name": "notApproved",
      "msg": "This milestone hasn't reached its approval threshold yet"
    },
    {
      "code": 6003,
      "name": "alreadyClaimed",
      "msg": "This vault or milestone has already been claimed"
    },
    {
      "code": 6004,
      "name": "alreadyApproved",
      "msg": "This signer has already approved this milestone"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "This signer isn't authorized to perform this action"
    },
    {
      "code": 6006,
      "name": "cancelAfterClaim",
      "msg": "A vault can only be cancelled before any funds have been released"
    },
    {
      "code": 6007,
      "name": "vaultCancelled",
      "msg": "This vault has been cancelled"
    },
    {
      "code": 6008,
      "name": "tooManyMilestones",
      "msg": "Too many milestones for a single vault"
    }
  ],
  "types": [
    {
      "name": "conditionType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "timeLock"
          },
          {
            "name": "milestone"
          }
        ]
      }
    },
    {
      "name": "milestone",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "approvedBy",
            "docs": [
              "Who has signed off so far. Claimable once `len() >= vault.threshold`",
              "— not stored as a separate bool, to avoid two sources of truth."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "claimed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "depositor",
            "docs": [
              "Who funded the vault; the only signer allowed to cancel it."
            ],
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "docs": [
              "Who can claim released funds."
            ],
            "type": "pubkey"
          },
          {
            "name": "mint",
            "docs": [
              "Which SPL / Token-2022 mint this vault holds."
            ],
            "type": "pubkey"
          },
          {
            "name": "vaultId",
            "docs": [
              "Nonce so the same depositor/recipient pair can open multiple vaults."
            ],
            "type": "u64"
          },
          {
            "name": "conditionType",
            "type": {
              "defined": {
                "name": "conditionType"
              }
            }
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          },
          {
            "name": "unlockTimestamp",
            "docs": [
              "Set when `condition_type == TimeLock`, `None` otherwise."
            ],
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "milestones",
            "docs": [
              "Set when `condition_type == Milestone`, empty otherwise."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "milestone"
                }
              }
            }
          },
          {
            "name": "approvers",
            "docs": [
              "Addresses allowed to approve a milestone. `[depositor]` today;",
              "multi-sig later is adding more addresses here and raising `threshold`."
            ],
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "docs": [
              "Approvals required per milestone. `1` today."
            ],
            "type": "u8"
          },
          {
            "name": "cancelled",
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump, stored so the vault can sign its own CPIs without",
              "re-deriving it on every instruction."
            ],
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "maxApprovers",
      "docs": [
        "Fixed upper bound on approvers per vault (and, per milestone, on how many",
        "of them can have signed off). 1 approver is used today; this cap is the",
        "extensibility point for multi-signature approval later. `u8` for the same",
        "reason as `MAX_MILESTONES`."
      ],
      "type": "u8",
      "value": "5"
    },
    {
      "name": "maxMilestones",
      "docs": [
        "Fixed upper bound on tranches in a milestone vault. Anchor accounts have",
        "fixed space allocated at `init` time, so `Vault::milestones` needs a hard",
        "cap for `InitSpace` to compute a size.",
        "",
        "Fixed-width `u8`, not `usize` — Anchor's IDL-build macro has no IDL type",
        "mapping for `usize` (it has no fixed cross-platform width) and fails to",
        "compile with `#[constant]` if it's used here. Cast to `usize` at use",
        "sites that need it (`Vec::len()` comparisons, `vec![x; n]`, etc.)."
      ],
      "type": "u8",
      "value": "10"
    },
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
