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
- **Status**: Current signing status (0=pending, 1=partial, 2=complete)
- **Version History**: Vector of signed document blob IDs

#### `SignerCap`
Capability objects that prove authorization to sign. Each authorized signer receives a `SignerCap` when:
- A document is created with them as a signer
- They are added as a new signer to an existing document

#### `Signature`
Individual signature records containing:
- **Signer address**: Who signed the document
- **Timestamp**: When the signature was recorded

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
- `sign_document()` - Sign a document using a SignerCap
- `issue_signer_capability()` - Add a new authorized signer
- `revoke_signer()` - Remove a signer's authorization

### Access Control
- `seal_approve()` - Entry function for Seal encryption system
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

## 🔒 Security Considerations

### Authorization Checks
- Document creators can update blob IDs and manage signers
- Only authorized signers can sign documents
- SignerCap must match the document being signed
- Duplicate signatures are prevented

### Access Control
- Seal encryption integration ensures only authorized parties can decrypt
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
│   └── wal_sign.move          # Main contract code
├── tests/
│   └── wal_sign_tests.move    # Test suite
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


**Built with ❤️ on Sui Blockchain**

