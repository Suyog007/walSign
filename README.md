# WalSign

Private, verifiable e-signatures on Sui. Documents are encrypted with
[Seal](https://seal-docs.wal.app) so only their participants can read them,
stored on [Walrus](https://docs.wal.app), and every step of the signing process
(signatures, declines, reassignments, completion) is recorded on chain.

## Features

- **Encrypted documents**: each PDF (and each signed version) is Seal-encrypted under its document ID; only the creator and current signers can decrypt.
- **Signing workflow**: optional sequential order, signing deadlines, decline with a reason, reassignment of pending signers, all enforced by the contract.
- **Encrypted discussion**: a private thread per document, readable only by its participants.
- **Audit trail and certificate**: the document's on-chain history, a downloadable completion certificate, and a page that verifies a certificate against chain and Walrus data.
- **Templates and bulk send**: reusable PDFs with signer roles and signature fields, sent to one set of recipients or in bulk.
- **Email notifications**: an optional service that emails participants when they are invited, when it is their turn, before a deadline and on completion.

## Architecture

```
                    ┌──────────────────────────────┐
                    │  wal-sign-fe (React + Vite)  │
                    │  wallet · Seal · pdf-lib     │
                    └──┬───────────┬───────────┬───┘
         transactions, │           │ encrypted │ key requests
         object reads  │           │ blobs     │ (seal_approve*)
                       ▼           ▼           ▼
   ┌───────────────────────┐  ┌─────────┐  ┌──────────────────┐
   │ Sui: wal_sign package │  │ Walrus  │  │ Seal key servers │
   │  wal_sign · discussion│  └─────────┘  └────────┬─────────┘
   │  template             │◄──────────────────────┘ dry-run the
   └───────────┬───────────┘                          policy on chain
               │ events (queryEvents)
               ▼
   ┌───────────────────────┐       SMTP       ┌───────────────┐
   │ services/notifier     │ ───────────────► │ participants' │
   │ (Node, polling)       │                  │ inboxes       │
   └───────────────────────┘                  └───────────────┘
```

| Part | Path | What it does |
| --- | --- | --- |
| Move package | [`contract-wal-sign/wal_sign`](contract-wal-sign/README.md) | `wal_sign` (documents, signing rules, Seal policy), `discussion` (encrypted threads), `template` (reusable templates) |
| Web app | [`wal-sign-fe`](wal-sign-fe/README.md) | Upload, sign, discuss, audit, certificates, templates |
| Notifier | [`services/notifier`](services/notifier) | Turns contract events into emails |

**Access control.** Every Seal key id is namespaced by the object it belongs to:
document versions under the document ID (`seal_approve`), discussion messages
under the thread ID (`seal_approve_thread`) and template PDFs under the template
ID (`seal_approve_template`). Key servers only release a key when the
corresponding policy passes for the requesting address, so access to one object
never unlocks another, and a revoked or reassigned signer loses access.

**Flow of a document.** The creator creates the `Document` on chain, encrypts
the PDF under its ID, uploads it to Walrus and records the blob ID (with the
optional signing order and deadline) in a second transaction. Signers decrypt,
place their signature, upload the signed version and sign on chain; the
contract enforces order, deadline and declines and emits an event for every step.

## Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (CI uses `testnet-v1.84.0`)
- Node.js 20+ (CI uses 22) and npm
- A Sui wallet browser extension with testnet SUI

## Setup and running

### 1. Contract

```bash
cd contract-wal-sign/wal_sign
sui move build
sui move test
```

To publish, put your deployer mnemonic in `contract-wal-sign/wal_sign/.env`
(see `.env.example`), then run `npm install` and `npx ts-node scripts/utils/setup.ts`. It writes the
package ID and the `DocumentRegistry` object ID to `scripts/utils/packageInfo.ts`.
All changes since the first release are upgrade-compatible additions, so an
existing deployment can also be upgraded with its `UpgradeCap`.

### 2. Web app

```bash
cd wal-sign-fe
cp env.example .env   # set VITE_PACKAGE_ID and VITE_REGISTRY_OBJECT_ID from step 1
npm ci
npm run dev           # http://localhost:5173
```

See [`wal-sign-fe/README.md`](wal-sign-fe/README.md) for all environment variables.

### 3. Notifier (optional)

```bash
cd services/notifier
cp .env.example .env                   # set WALSIGN_PACKAGE_ID, APP_BASE_URL, SMTP_* or MAIL_DRY_RUN=true
cp contacts.example.json contacts.json # map the addresses that opted in to their email
npm ci
npm run build
node --env-file=.env dist/index.js
```

The service polls the package's events every `POLL_INTERVAL_SECONDS` and stores
its position and tracked deadlines in `STATE_FILE`, so it resumes where it
stopped after a restart. Only addresses listed in the contacts file receive
email; with `MAIL_DRY_RUN=true` messages are logged instead of sent.

| Notification | Sent when | To |
| --- | --- | --- |
| Invited | a document is created, or a signer is reassigned | the new signers (not the creator) |
| Your turn | sequential signing starts, or the previous signer signs | the next signer |
| Deadline approaching | the deadline is within `DEADLINE_WARNING_HOURS` (once per deadline) | signers who have not signed yet |
| Completed | the last signature lands | the creator and all signers |

## Tests

| Part | Command | Covers |
| --- | --- | --- |
| Contract | `cd contract-wal-sign/wal_sign && sui move test` | Signing, access control, signing order, deadlines, decline/reassign, discussion and template policies |
| Web app | `cd wal-sign-fe && npm test` | Services, hooks and components (Vitest + React Testing Library; wallet, Seal, Sui RPC and Walrus mocked) |
| Notifier | `cd services/notifier && npm test` | Event handling, deadlines, cursor persistence, config, adapters (event source and mail transport mocked) |

`npm run typecheck`, `npm run lint` and `npm run build` are available in both
Node projects. GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
runs all of the above on every push to `main` and every pull request.
