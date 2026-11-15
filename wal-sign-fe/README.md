# wal-sign-fe

React + Vite frontend for WalSign. Documents are encrypted with
[Seal](https://seal-docs.wal.app), stored on [Walrus](https://docs.wal.app) and
tracked by the `wal_sign` Move package on Sui testnet.

## Setup

```bash
cp env.example .env   # then fill in the package and registry IDs of your deployment
npm ci
npm run dev           # http://localhost:5173
```

| Variable | Description |
| --- | --- |
| `VITE_PACKAGE_ID` | Published `wal_sign` package ID |
| `VITE_REGISTRY_OBJECT_ID` | Shared `DocumentRegistry` object created when the package was published |
| `VITE_WALRUS_AGGREGATOR_URL` | Walrus aggregator used to read blobs |
| `VITE_WALRUS_PUBLISHER_URL` | Walrus publisher used to store blobs |
| `VITE_SEAL_KEY_SERVERS` | Comma separated Seal key server object IDs |
| `VITE_SUI_EXPLORER_URL` | Optional explorer base URL for transaction links |

## Features

- **Upload & sign**: documents are Seal-encrypted under their on-chain ID and stored on Walrus; signers place their signature on the PDF and record it on chain.
- **Signing rules**: optional sequential order and deadline, decline with a reason, reassign pending signers.
- **Discussion**: an end-to-end encrypted thread per document, readable only by its participants.
- **Audit trail & certificate**: every on-chain event of a document, a downloadable completion certificate, and `/certificate` to verify one against chain data.
- **Templates** (`/templates`): save a PDF with signer roles and signature fields, then send it to one set of recipients or in bulk (one document per line of a recipient list; two wallet prompts for the whole batch).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run typecheck` | Type-check the project with `tsc` |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest unit tests once (`npm run test:watch` to watch) |
| `npm run build` | Type-check and build the production bundle into `dist/` |

## Tests

Tests live next to the code they cover (`*.test.ts` / `*.test.tsx`) and run in
jsdom with React Testing Library. The wallet (`@mysten/dapp-kit`), the Seal
client, the Sui RPC client and `fetch` (Walrus) are mocked at their module
boundaries, so the suite needs no network access or wallet extension.
