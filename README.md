# Verichain

**Cryptographic Supply Chain Provenance & Anti-Counterfeiting Platform for Pharmaceutical Cold-Chain Logistics**

Verichain is a consortium blockchain platform that replaces fragmented, siloed supply chain databases with a shared, tamper-evident ledger. Every pharmaceutical batch is tokenized as a unique digital asset anchored to an Unspent Transaction Output (UTXO), and every custody transfer from manufacturing plant to clinical pharmacy is cryptographically signed using ECDSA P-256 keys and sealed into a SHA-256 hash-chained block via Proof of Authority (PoA) round-robin consensus.

---

## Core Capabilities

- **Consortium Blockchain & Tokenized Pharmaceutical Assets**
  - Five authorized consortium participants (**Helios Biopharma AG**, **NordicCold Freight Logistics**, **MedCore Regional Distribution**, **St. Jude Clinical Pharmacy**, and **EuroMed Quality Oversight**) share an immutable custody ledger.
  - Serializes vaccine, biologic, oncology, and cryogenic therapy batches into unique asset tokens (`VCH-YYYY-XXXX`) linked to lot numbers, GS1 GTIN-14 identifiers, batch quantities, and cold-chain temperature thresholds.

- **Cryptographic Hash Chaining & Digital Signatures**
  - Uses the browser's native **Web Crypto API (`crypto.subtle`)** for genuine **SHA-256** block hashing and **ECDSA P-256** asymmetric keypair generation, signing, and verification.
  - Every mint and custody transfer is signed by the active custodian's private key, and every sealed block is counter-signed by the scheduled consortium validator.

- **UTXO Custody State & Anti-Counterfeiting Verification**
  - Enforces a strict single-owner custody model using Unspent Transaction Outputs (`UNSPENT` → `SPENT`).
  - Each handoff consumes the previous UTXO and issues a new unspent output to the recipient, deterministically preventing duplicate serials and cloned-label counterfeits.
  - Built-in **Verify Product** counter validates Token IDs, Lot Numbers, and GTINs against live chain integrity, ECDSA signatures, UTXO ownership, and cold-chain thermal compliance, including a counterfeit clone test scenario.

- **Proof of Authority (PoA) Round-Robin Consensus**
  - Authorized consortium nodes seal blocks in deterministic round-robin order without energy-intensive mining.
  - Interactive validator availability controls allow toggling any node offline to demonstrate automatic round-robin failover to the next healthy authority.

- **Interactive Tamper Detection Audit**
  - Visual hash-chain sequence map and block-level cryptographic inspector displaying `previousHash`, stored block hash, recalculated SHA-256 digest, and per-transaction signature verification.
  - Allows altering historical block payloads (lot number, volume, recorded temperature, or audit notes) in place to verify that modifying an earlier block immediately triggers a SHA-256 digest mismatch, invalidates ECDSA signatures, and breaks every downstream `previousHash` link.
  - One-click restoration recovers the verified ledger state.

- **Live PoA vs. PoW Latency & Throughput Benchmarks**
  - Runs live empirical Web Crypto benchmarks comparing Verichain's Proof of Authority block sealing against genuine SHA-256 Proof of Work nonce grinding across configurable batch sizes (`5`–`12` blocks) and leading-zero difficulties (`1`–`4`).
  - Renders per-block finality bar charts (Log / Linear scale), difficulty scaling curves, speedup multipliers, SHA-256 hash counts, and supports **CSV export**.

- **Client-Side Persistence & Demo Reset**
  - Automatically persists ledger blocks, generated ECDSA authority keys, and benchmark runs in `localStorage`, paired with a one-click **Reset Demo Ledger** control.

---

## System Architecture

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        Verichain Enterprise Client                         │
│  ┌──────────────────┐  ┌────────────────────────────────────────────────┐  │
│  │ Workspace Shell  │  │ Views                                          │  │
│  │ - Sidebar Nav    │  │ - Overview (KPIs, Batch Registry, PoA Queue)   │  │
│  │ - Top Header     │  │ - Asset Custody (Handoff, Mint Token, UTXOs)   │  │
│  │ - Provenance     │  │ - Ledger & Audit (Hash Chain, Tamper Lab)      │  │
│  │   Drawer         │  │ - Benchmarks (Live PoA vs. PoW Charts + CSV)   │  │
│  │                  │  │ - Verify Product (Authenticity Certificate)    │  │
│  └──────────────────┘  └────────────────────────────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────────┐
│                        Consortium Blockchain Engine                        │
│  ┌─────────────────────────┐  ┌────────────────────┐  ┌─────────────────┐  │
│  │ Web Crypto Engine       │  │ PoA Scheduler      │  │ UTXO & Auditor  │  │
│  │ - SHA-256 Block Hashing │  │ - Round-Robin Turn │  │ - State Replay  │  │
│  │ - ECDSA P-256 Keypairs  │  │ - Node Failover    │  │ - Cascade Check │  │
│  │ - Sign & Verify         │  │ - PoW Mining Loop  │  │ - Clone Guard   │  │
│  └─────────────────────────┘  └────────────────────┘  └─────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────────┐
│                   Browser Persistence Layer (localStorage)                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```text
├── index.html                        # App entry point and font configuration
├── src/
│   ├── main.tsx                      # React root mount
│   ├── App.tsx                       # Workspace shell, state coordination, persistence
│   ├── index.css                     # Tailwind CSS v4 theme tokens and base styles
│   ├── types/
│   │   └── blockchain.ts             # Domain types for blocks, UTXOs, audits, benchmarks
│   ├── lib/
│   │   ├── crypto.ts                 # Web Crypto SHA-256, ECDSA P-256, PoA & PoW routines
│   │   └── ledgerEngine.ts           # Consortium seed, PoA rotation, UTXO replay, verifier
│   └── components/
│       ├── Sidebar.tsx               # Navigation sidebar and demo reset control
│       ├── TopBar.tsx                # Contextual breadcrumb header and primary CTA
│       ├── OverviewView.tsx          # KPI metrics, batch registry, validator schedule
│       ├── AssetCustodyView.tsx      # Signed custody handoff, batch minting, UTXO ledger
│       ├── LedgerAuditView.tsx       # Hash-chain explorer and tamper simulation lab
│       ├── BenchmarksView.tsx        # Live PoA vs. PoW benchmarking and SVG analytics
│       ├── VerifyProductView.tsx     # Authenticity certificate and clone detector
│       ├── ProvenanceDrawer.tsx      # Slide-over batch custody timeline inspector
│       └── ProductImage.tsx          # Resilient product media display with SVG fallback
```

---

## Tech Stack

- **Frontend Framework**: React 19, TypeScript
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS v4, Lucide React icons
- **Typography**: Plus Jakarta Sans, Public Sans, JetBrains Mono (tabular numerals)
- **Cryptography**: Browser-native Web Crypto API (`SHA-256`, `ECDSA` on `P-256`)
- **Persistence**: Client-side `localStorage` with deterministic cryptographic seed initialization

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation & Local Development

```bash
# Install dependencies
npm install

# Start the development server on http://localhost:3000
npm run dev
```

### Build & Type Checking

```bash
# Run TypeScript type checks
npm run lint

# Create a production build
npm run build

# Preview the production bundle locally
npm run preview
```

---

## Walkthrough & Verification Scenarios

1. **Inspect Live Provenance**: Open **Overview**, search or filter the pre-seeded pharmaceutical batches (`VCH-2026-0841` through `VCH-2026-0844`), and select any row to inspect its signed custody hops and active unspent UTXO.
2. **Test PoA Round-Robin Failover**: In the **Proof of Authority Validator Rotation** panel, toggle the next scheduled authority **Offline** and observe the turn pointer advance automatically to the next online consortium validator.
3. **Mint & Transfer Custody**: Navigate to **Asset Custody** to mint a new serialized pharmaceutical batch or execute a signed custody handoff with cold-chain temperature telemetry. Review the **UTXO State Ledger** tab to confirm the previous output transitioned from `Unspent (Active)` to `Spent`.
4. **Run Tamper Detection**: Open **Ledger & Audit** and click **Run Tamper Simulation (Block #2)** (or click **Alter Payload** on any block). Observe the immediate SHA-256 digest mismatch, invalidated ECDSA signature, and cascading broken links on all downstream blocks. Click **Restore Authentic Chain** to recover.
5. **Measure PoA vs. PoW Latency**: Open **Benchmarks**, choose a transaction batch size and PoW leading-zero difficulty (`1`–`4`), click **Run Live Benchmark**, and optionally click **Export CSV** to download per-block latency and hash-iteration metrics.
6. **Verify Authenticity & Counterfeit Clones**: Open **Verify Product**, look up any registered Token ID (`VCH-2026-0841`), and click **Test Counterfeit Clone** to see how a duplicated serial referencing a spent UTXO is detected and rejected.
