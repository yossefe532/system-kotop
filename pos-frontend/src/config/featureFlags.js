// Dependency-free feature flags for production business modules.
//
// This module intentionally has NO React, NO demo-data, NO API, NO sync and NO
// browser-only imports so it can be pulled into any module (including ones
// executed under plain Node parity harnesses) without dragging in a heavier
// dependency graph.

// Vite injects `import.meta.env`. Under plain Node `import.meta.env` is
// undefined, so guard access to keep module evaluation side-effect free.
export const isWalletLedgerEnabled =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_WALLET_LEDGER_ENABLED === 'true'
