# WalSign Smart Contract

A decentralized document signing system built on Sui blockchain that enables secure, encrypted document management with multi-party signatures. WalSign combines the power of blockchain-based access control with encrypted storage on Walrus, creating a trustless document signing platform.

## 🌟 What is WalSign?

WalSign is a smart contract that manages the entire lifecycle of document signing on the blockchain. Think of it as a digital notary that:

- **Securely stores** document metadata and access permissions on-chain
- **Manages signatures** from multiple authorized parties
- **Tracks document status** from creation to completion
- **Integrates with Walrus** for encrypted document storage

Unlike traditional document signing services, WalSign gives you complete control over your documents with blockchain-backed security and immutability.

## ✨ Key Features

### 🔐 Secure Access Control
- Only authorized signers can decrypt and sign documents
- Creator maintains full control over document permissions
- Capability-based authorization system ensures proper access

### 📝 Multi-Party Signing
- Support for multiple authorized signers per document
- Track signature status in real-time
- Automatic status updates (pending → partial → complete)

### 📊 Document Registry
- Centralized registry for efficient document lookup
- Query documents by creator or assigned signer
- Track total documents across the entire system

### 🔄 Flexible Management
- Add new signers to existing documents
- Revoke signer permissions when needed

### 🎯 Integration Ready
- Seal integration for document encryption and decryption

## 🏗️ Architecture Overview

### Core Components

#### `DocumentRegistry`
The central index of all documents in the system. This shared object maintains:
- **`created_by_user`**: Maps user addresses to documents they created
- **`assigned_to_user`**: Maps user addresses to documents they can sign
- **`total_documents`**: Global counter of all documents

#### `Document`
The main document record containing:
- **Metadata**: Title, description, creator, creation timestamp
- **Storage**: Walrus blob ID for encrypted document storage
- **Access Control**: List of authorized signers
- **Signatures**: Collection of all signatures received
- **Status**: Current signing status (0=pending, 1=partial, 2=complete, 3=declined)
- **Version History**: Vector of signed document blob IDs

#### `SignerCap`
Capability objects that prove authorization to sign. Each authorized signer receives a `SignerCap` when:
- A document is created with them as a signer
- They are added as a new signer to an existing document

#### `Signature`
Individual signature records containing:
- **Signer address**: Who signed the document
- **Timestamp**: When the signature was recorded

#### `Workflow`
Optional signing rules stored as a dynamic field on the document (so `Document`'s layout and package upgrade compatibility are unchanged):
- **Sequential order**: signers must sign in the order of the signer list; set by the creator before the first signature
- **Deadline**: signatures after this timestamp are rejected; the creator can extend or clear it
- **Declines**: a signer can decline with a reason, which pauses signing until the creator reassigns or revokes them

#### `template::Template`
A reusable document template (module `wal_sign::template`), owned by its creator and not transferable:
- **Content**: name, description and the Walrus blob of the Seal-encrypted template PDF
- **Roles**: signer roles in their default signing order (max 20)
- **Signature fields**: rectangles per role (page, x, y, width, height in PDF points from the top-left; max 100)
- **Access**: `seal_approve_template` releases keys namespaced under the template ID to whoever can pass the owned object, i.e. only the owner

Documents created from a template are ordinary `Document`s; the frontend stamps the field boxes into each document's PDF.

#### `discussion::Thread`
A private discussion attached to a document (module `wal_sign::discussion`):
- **One per document**: opened by any participant; its ID is stored on the document under a `ThreadKey` dynamic field
- **Messages**: Seal ciphertext stored on chain in a table, with sender and timestamp (max 8 KiB per message)
- **Access**: only the document's participants (creator + authorized signers) can post or obtain decryption keys

### Workflow

1. **Document Creation**
   ```
   Creator → Creates Document → Issues SignerCaps → Registers in Registry
   ```

2. **Signing Process**
   ```
   Signer → Presents SignerCap → Signs Document → Status Updates → Event Emitted
   ```

3. **Document Completion**
   ```
   All Signers Signed → Status = Complete → Document Ready
   ```

## 🚀 Getting Started

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) installed
- Node.js and npm (for TypeScript scripts)
- A Sui wallet with test SUI tokens

### Installation

1. **Clone the repository** (if you haven't already)


2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the contract**
   ```bash
   sui move build
   ```

### Deployment

Deploy the contract to Sui using the setup script:

```bash
ts-node scripts/utils/setup.ts
```

This will:
- Build the Move package
- Publish it to the Sui network
- Generate `scripts/utils/packageInfo.ts` with the package ID and DocumentRegistry address

Make sure you have your Sui keypair configured in `.env`.

### Running Tests

```bash
sui move test
```

## 📖 Usage Guide

### Creating a Document

To create a new document, call `create_document` with:
- `walrus_blob_id`: The encrypted document's blob ID on Walrus
- `title`: Document title
- `description`: Document description
- `authorized_signers`: Vector of addresses authorized to sign
- `clock`: Clock object for timestamps

```move
create_document(
    &mut registry,
    b"walrus_blob_123",
    b"My Important Document",
    b"Contract for Q1 2024",
    vector[0x123..., 0x456...],
    &clock,
    ctx
);
```

This function will:
- Create a new `Document` shared object
- Register it in the `DocumentRegistry`
- Issue `SignerCap` objects to all authorized signers
- Emit a `DocumentCreated` event

### Signing a Document

Authorized signers use their `SignerCap` to sign:

```move
sign_document(
    &mut document,
    &signer_cap,
    &clock,
    ctx
);
```

The function will:
- Verify the `SignerCap` matches the document
- Check the signer hasn't already signed
- Record the signature with timestamp
- Update document status automatically
- Emit a `DocumentSigned` event

### Adding New Signers

The document creator can add new signers at any time:

```move
issue_signer_capability(
    &mut registry,
    &mut document,
    new_signer_address,
    ctx
);
```

### Revoking Signers

Remove a signer's authorization (creator only):

```move
revoke_signer(
    &mut document,
    signer_to_revoke,
    ctx
);
```

### Querying Documents

#### Get documents created by a user:
```move
let docs = get_created_documents(&registry, user_address);
```

#### Get documents assigned to a user:
```move
let docs = get_assigned_documents(&registry, user_address);
```

## 🔍 Key Functions Reference

### Document Management
- `create_document()` - Create a new document with authorized signers
- `update_blob_id()` - Update the Walrus blob ID (creator only)
- `update_signed_blob_id()` - Add a new signed document version

### Signing Operations
- `sign_document()` - Sign a document using a SignerCap (enforces order, deadline and declines)
- `issue_signer_capability()` - Add a new authorized signer (appended to the signing order)
- `revoke_signer()` - Remove a signer's authorization (also clears their decline)
- `decline_document()` - Decline to sign with a reason (max 500 bytes)
- `reassign_signer()` - Creator replaces a signer who has not signed; the new signer keeps the same position

### Signing Rules
- `set_signing_order()` - Switch between sequential and parallel signing (creator, before the first signature)
- `set_deadline()` / `clear_deadline()` - Manage the signing deadline (creator)
- `is_sequential()`, `deadline()`, `is_past_deadline()`, `next_signer()` - Read the rules
- `is_declined()`, `has_declined()`, `declines()`, `decline_details()` - Read declines

### Access Control
- `seal_approve()` - Seal policy for document versions; key ids must start with the document ID
- `is_participant()` - Check if an address is the creator or an authorized signer
- `is_authorized()` - Check if an address is authorized
- `has_signed()` - Check if a signer has already signed

### Query Functions
- `get_created_documents()` - Get all documents created by a user
- `get_assigned_documents()` - Get all documents assigned to a user
- `get_total_documents()` - Get total document count
- `get_status()` - Get document status
- `signatures_count()` - Get number of signatures
- `get_walrus_blob_id()` - Get document storage location
- `get_authorized_signers()` - Get list of authorized signers
- `get_signatures()` - Get all signatures

### Discussion (`wal_sign::discussion`)
- `create_thread()` - Open the document's discussion (participants only, once per document)
- `post_message()` - Store an encrypted message (participants only)
- `seal_approve_thread()` - Seal policy for messages; key ids must start with the thread ID
- `has_thread()` / `thread_id()` - Find a document's thread
- `message_count()` / `message()` - Read messages

### Templates (`wal_sign::template`)
- `new_field()` - Build a `SignatureField` inside a programmable transaction
- `create_template()` - Create a template owned by the sender
- `set_blob_id()` - Record the encrypted PDF's Walrus blob
- `delete_template()` - Delete a template
- `seal_approve_template()` - Seal policy for template PDFs (owner only)

## 📡 Events

The contract emits events for important actions:

### `DocumentCreated`
Emitted when a new document is created:
```move
{
    document_id: ID,
    creator: address,
    title: String,
    authorized_signers: vector<address>,
    timestamp: u64
}
```

### `DocumentSigned`
Emitted when a document is signed:
```move
{
    document_id: ID,
    signer: address,
    timestamp: u64,
    total_signatures: u64
}
```

### Workflow events
```move
SigningOrderSet   { document_id: ID, sequential: bool }
DeadlineSet       { document_id: ID, deadline_ms: Option<u64> }   // none = cleared
DocumentDeclined  { document_id: ID, signer: address, reason: String, timestamp: u64 }
SignerReassigned  { document_id: ID, from: address, to: address, timestamp: u64 }
DocumentCompleted { document_id: ID, timestamp: u64 }
```

### `discussion::ThreadCreated` / `discussion::MessagePosted`
Emitted when a participant opens a document's discussion or posts to it.
Message bodies are never included in events; they stay encrypted on the thread.
```move
{ thread_id: ID, document_id: ID, created_by: address, timestamp: u64 }
{ thread_id: ID, document_id: ID, sender: address, index: u64, timestamp: u64 }
```

## 🔒 Security Considerations

### Authorization Checks
- Document creators can update blob IDs and manage signers
- Only current authorized signers can sign or decline; a revoked or reassigned signer's leftover SignerCap is useless
- Sequential order, deadlines and outstanding declines are enforced on chain in `sign_document`
- SignerCap must match the document being signed
- Duplicate signatures are prevented

### Access Control
- Seal encryption integration ensures only authorized parties can decrypt
- Seal key ids are namespaced: document keys under the document ID, discussion keys under the thread ID, so access to one object never unlocks another
- Revoking a signer removes their access to the document and its discussion
- Capability-based system prevents unauthorized access
- Creator maintains ultimate control over document permissions

## 🧪 Testing

The contract includes test utilities:

```move
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
```

Run the test suite:
```bash
sui move test
```

## 📁 Project Structure

```
wal_sign/
├── sources/
│   ├── wal_sign.move          # Documents, signing and the document Seal policy
│   ├── discussion.move        # Encrypted per-document discussion threads
│   └── template.move          # Reusable document templates
├── tests/
│   ├── wal_sign_tests.move    # Document and signing tests
│   ├── workflow_tests.move    # Order, deadline, decline and reassign rules
│   ├── discussion_tests.move  # Discussion access-control tests
│   └── template_tests.move    # Template validation and access tests
├── scripts/
│   └── utils/
│       ├── setup.ts           # Deployment script
│       ├── execStuff.ts       # Execution utilities
│       └── packageInfo.ts     # Generated package info
├── Move.toml                  # Move package configuration
├── package.json               # Node.js dependencies
```

## 📝 Error Codes

- `E_NOT_AUTHORIZED (1)`: User is not authorized to perform the operation
- `E_ALREADY_SIGNED (2)`: User has already signed this document
- `E_INVALID_KEY_ID (3)`: Seal key id is not namespaced under the document
- `E_SIGNING_STARTED (4)`: Signing order cannot change after the first signature
- `E_INVALID_DEADLINE (5)`: Deadline must be in the future
- `E_DEADLINE_PASSED (6)`: The signing deadline has passed
- `E_NOT_YOUR_TURN (7)`: Sequential signing requires an earlier signer to sign first
- `E_DOCUMENT_COMPLETED (8)`: The document is already fully signed
- `E_ALREADY_DECLINED (9)`: The signer has already declined
- `E_DOCUMENT_DECLINED (10)`: Signing is paused while a decline is outstanding
- `E_INVALID_REASON (11)`: Decline reason is empty or too long
- `E_NOT_A_SIGNER (12)`: Address is not a signer of the document
- `E_ALREADY_A_SIGNER (13)`: Address is already a signer of the document

`wal_sign::discussion`:
- `E_NOT_PARTICIPANT (1)`: Sender is not the document's creator or an authorized signer
- `E_WRONG_DOCUMENT (2)`: Thread does not belong to the given document
- `E_THREAD_EXISTS (3)`: The document already has a thread
- `E_EMPTY_MESSAGE (4)` / `E_MESSAGE_TOO_LARGE (5)`: Ciphertext is empty or over 8 KiB
- `E_INVALID_KEY_ID (6)`: Seal key id is not namespaced under the thread

`wal_sign::template`:
- `E_INVALID_NAME (1)`: Name is empty or longer than 100 bytes
- `E_INVALID_ROLES (2)`: No roles, more than 20, or an empty role name
- `E_INVALID_FIELD (3)`: A field refers to a missing role or has no area
- `E_TOO_MANY_FIELDS (4)`: More than 100 signature fields
- `E_INVALID_KEY_ID (5)`: Seal key id is not namespaced under the template


**Built with ❤️ on Sui Blockchain**

