# Token Radar | Institutional Pre-Token Valuation Engine & Airdrop Terminal

[![make.fun competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/Rukyu91/token-radar-01/rank.svg)](https://make.fun/c/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/Rukyu91/token-radar-01/reward.svg)](https://make.fun/c/token-radar-01)

A high-performance, deterministic valuation engine and institutional terminal tracking pre-token crypto protocols. Built for the [make.fun](https://make.fun/c/token-radar-01) **token-radar-01** competition ($1,325 USDC prize pool).

---

## Highlights

- **100% Watchlist Coverage**: Covers all 40 protocols on the snapshot's mandatory watchlist floor ($50M+ TVL, pre-token).
- **220 Total Scored Protocols**: Adds 180 high-potential early pre-token opportunities below the floor.
- **Quantitative Valuation Model (`radar-v2-alpha`)**:
  - Derived deterministically from verified snapshot metrics: TVL, 7-day momentum velocity, seasoning / age with no token, sector fee-capture multipliers (Perps, L2s, Restaking, DEX, Lending), and multi-chain ecosystem reach.
  - Zero hardcoded protocol names; identical arithmetic shared between backend model and frontend live recomputation.
- **Institutional Farm Plans**:
  - Every protocol features a concrete 6-step actionable plan covering Wallet Isolation, Primary Deployment, On-Chain Velocity Cadence, Multi-Snapshot Seasoning Window, Sybil Resistance & Governance, and TGE Verification & Safe Unwind.
  - Complete with specific gas estimates by chain and capital allocations.
- **DeFi Analytics Terminal**:
  - Obsidian dark-mode UI with live KPI banner, real-time keyboard search (`/`), category & chain filtering, bidirectional table sorting, and interactive farm step checklist.
  - 100% offline, zero-network, zero third-party dependencies. Total dashboard source is under 44 KB (well under the 64 KB dossier cap).

---

## Quantitative Valuation Model

Implied Fully Diluted Valuation (FDV) is calculated as:

$$\text{Implied FDV} = \max\left(1, \text{round}\left( \text{TVL} \times M_{\text{base}} \times M_{\text{growth}} \times M_{\text{maturity}} \times M_{\text{sector}} \times M_{\text{ecosystem}} \right)\right)$$

Where:
- $M_{\text{base}} = 0.28$: Calibrated against historical DeFi median market cap to TVL ratios.
- $M_{\text{growth}} = 1 + \left(\frac{\text{clamp}(\Delta_{7d}, -60, 120)}{100}\right) \times 0.45$: Captures capital velocity.
- $M_{\text{maturity}} = 0.65 + \left(\frac{\min(\text{Age}, 1095)}{1095}\right) \times 0.35$: Rewards protocol survival time without a token.
- $M_{\text{sector}}$: Category multiplier based on protocol fee capture (Perpetuals: 1.30x, L2s: 1.25x, Restaking: 1.18x, DEXes: 1.12x, Lending: 1.00x, Curators: 0.95x, Bridges: 0.90x, RWAs: 0.85x).
- $M_{\text{ecosystem}}$: Multi-chain distribution multiplier (1.05x to 1.15x).

---

## Project Structure

```
├── main.ts                   # Entrypoint (Node 22 / TypeScript standard library)
├── lib/
│   └── model.ts              # Valuation model and farm plan generator
├── dashboard/
│   ├── index.html            # Static terminal UI
│   ├── app.css               # Obsidian terminal theme
│   └── app.js                # Client controller & model recomputation
├── screenshots/
│   ├── 1-board.png           # Radar board overview table & stat banner
│   ├── 2-detail.png          # Protocol detail modal with farm plan
│   └── 3-filtered.png        # Category & chain filtered view
├── .makefun/
│   └── owner.json            # Entrant Solana wallet verification
├── vendor/
│   └── makefun-board.ts      # make.fun dossier generator
└── LICENSE                   # MIT License
```

---

## Running Locally

Run with Node 22 (standard library only):

```bash
node --experimental-strip-types main.ts --input input/snapshot.json --output out
```

Outputs generated in `out/`:
- `board.json`: Ranked protocol board with model parameters and farm plans.
- `data.js`: Dashboard dataset.
- `dashboard/`: Static web terminal.
- `screenshots/`: 3 high-resolution terminal views.
- `dossier.json`: Sealed dossier summary for AI model evaluation.

---

## License

[MIT](LICENSE)
