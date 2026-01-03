module wal_sign::wal_sign;

// ======== Imports ========

use sui::event;
use std::string::String;
use sui::clock::{Clock};
use sui::table::{Self, Table};
// ======== Error codes ========

/// Error: User is not authorized to perform the operation
const E_NOT_AUTHORIZED: u64 = 1;
/// Error: User has already signed this document
const E_ALREADY_SIGNED: u64 = 2;

// ======== Structs ========

/// Global registry to track all documents in the system
///
/// This shared object serves as the central index for all documents, mapping
/// user addresses to the documents they created or are authorized to sign.
/// It provides efficient lookup capabilities for querying user-specific
/// document lists.
public struct DocumentRegistry has key {
    id: UID,
    /// Map of user address -> list of document IDs they created
    created_by_user: Table<address, vector<ID>>,
    /// Map of user address -> list of document IDs they can sign
    assigned_to_user: Table<address, vector<ID>>,
    /// Total document count across all users
    total_documents: u64,
}

/// Main document record - stores metadata and access control
///
/// This shared object encapsulates all information about a document, including
/// its encrypted storage location on Walrus, authorized signers, collected
/// signatures, and status. Each document is independently accessible and
/// can be updated by authorized parties.
public struct Document has key, store {
    id: UID,
    /// Creator of the document
    creator: address,
    /// Walrus blob ID where encrypted document is stored
    walrus_blob_id: String,
    /// Document title/description
    title: String,
    /// Description (optional)
    description: String,
    /// List of addresses authorized to decrypt and sign
    authorized_signers: vector<address>,
    /// Collected signatures from authorized signers
    signatures: vector<Signature>,
    /// Timestamp when document was created (in milliseconds)
    created_at: u64,
    /// Status: 0=pending, 1=partial, 2=complete
    status: u8,
    /// Vector of blob IDs for signed document versions (newest last)
    signed_blob_id: vector<String>,
}

/// Signature record for a document
///
/// This struct represents a single signature on a document, recording
/// who signed and when. Multiple signatures are collected in the
/// document's signatures vector.
public struct Signature has store, drop, copy {
    /// Address that signed the document
    signer: address,
    /// Timestamp of signature (in milliseconds)
    signed_at: u64,
}

/// Capability object given to authorized signers
///
/// This capability object is issued to each authorized signer when a document
/// is created or when a new signer is added. It serves as proof of authorization
/// and must be presented when signing the document. Each SignerCap is tied to
/// a specific document via the document_id field.
public struct SignerCap has key, store {
    id: UID,
    /// Document this capability is for
    document_id: ID,
}

// ======== Events ========

/// Event emitted when a new document is created
///
/// Emitted when a document is created and registered in the system.
/// Includes the document ID, creator address, title, list of authorized
/// signers, and creation timestamp.
public struct DocumentCreated has copy, drop {
    document_id: ID,
    creator: address,
    title: String,
    authorized_signers: vector<address>,
    timestamp: u64,
}

/// Event emitted when a document is signed
///
/// Emitted when an authorized signer signs a document. Includes the
/// document ID, signer address, timestamp of signature, and the total
/// number of signatures collected so far.
public struct DocumentSigned has copy, drop {
    document_id: ID,
    signer: address,
    timestamp: u64,
    total_signatures: u64,
}

// ======== Init Function ========

/// Initializes the WalSign document signing system
///
/// Called once during deployment to set up the shared `DocumentRegistry`
/// object that will track all documents in the system.
///
/// # Parameters
/// * `ctx` - Transaction context for object creation
///
/// # Creates
/// * A shared `DocumentRegistry` object for indexing documents
fun init(ctx: &mut TxContext) {
    

    let registry = DocumentRegistry {
        id: object::new(ctx),
        created_by_user: table::new(ctx),
        assigned_to_user: table::new(ctx),
        total_documents: 0,
    };
    
    transfer::share_object(registry);
}

// ======== Public Functions ========

/// Creates a new encrypted document with authorized signers
///
/// Creates a new document record in the system, registers it in the
/// `DocumentRegistry`, and issues `SignerCap` capability objects to
/// all authorized signers. The document is stored as a shared object
/// and can be accessed by authorized parties.
///
/// # Parameters
/// * `registry` - Mutable reference to the document registry
/// * `walrus_blob_id` - Blob ID where the encrypted document is stored on Walrus
/// * `title` - Document title
/// * `description` - Document description
/// * `authorized_signers` - List of addresses authorized to decrypt and sign
/// * `clock` - Clock object for timestamp generation
/// * `ctx` - Transaction context for object creation and sender identification
///
/// # Creates
/// * A shared `Document` object with initial state
/// * `SignerCap` objects for each authorized signer (transferred to them)
///
/// # Emits
/// * `DocumentCreated` event with document details
public fun create_document(
    registry: &mut DocumentRegistry,
    walrus_blob_id: String,
    title: String,
    description: String,
    authorized_signers: vector<address>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();
    
    // Create document object
    let document = Document {
        id: object::new(ctx),
        creator: sender,
        walrus_blob_id,
        title,
        description,
        authorized_signers,
        signatures: vector::empty(),
        created_at: clock.timestamp_ms(),
        status: 0, // pending
        signed_blob_id: vector::empty(),
    };

    // Update registry - add to creator's list
    if (!registry.created_by_user.contains(sender)) {
        registry.created_by_user.add(sender, vector::empty());
    };
    let creator_docs = table::borrow_mut(&mut registry.created_by_user, sender);
    creator_docs.push_back(object::id(&document));

    // Add to each authorized signer's list
    let mut i = 0;
    let len = document.authorized_signers.length();
    while (i < len) {
        let signer_addr = document.authorized_signers[i];
        if (!registry.assigned_to_user.contains(signer_addr)) {
            registry.assigned_to_user.add(signer_addr, vector::empty());
        };
        let signer_docs = registry.assigned_to_user.borrow_mut(signer_addr);
        signer_docs.push_back(object::id(&document));
        
        let cap = SignerCap {
            id: object::new(ctx),
            document_id: object::id(&document)
        };

        transfer::public_transfer(cap, signer_addr);
        
        i = i + 1;
    };

    // Increment total
    registry.total_documents = registry.total_documents + 1;

    // Emit event
    event::emit(DocumentCreated {
        document_id: object::id(&document),
        creator: sender,
        title: document.title,
        authorized_signers: document.authorized_signers,
        timestamp: document.created_at,
    });

    // Share document object
    transfer::share_object(document);
}

/// Updates the Walrus blob ID for a document
///
/// Allows the document creator to update the blob ID after the document
/// has been created, useful for updating the encrypted document storage
/// location.
///
/// # Parameters
/// * `document` - Mutable reference to the document
/// * `walrus_blob_id` - New Walrus blob ID
/// * `ctx` - Transaction context for sender identification
///
/// # Panics
/// * If the sender is not the document creator
public fun update_blob_id(
    document: &mut Document,
    walrus_blob_id: String,
    ctx: &mut TxContext
) {
    assert!(ctx.sender() == document.creator, E_NOT_AUTHORIZED);
    document.walrus_blob_id = walrus_blob_id;
}

/// Updates the signed blob ID vector with a new signed document version
///
/// Allows authorized signers to append a new blob ID to the `signed_blob_id`
/// vector after they have signed and uploaded a new version of the document
/// to Walrus. This maintains a history of all signed document versions.
///
/// # Parameters
/// * `_` - SignerCap capability for authorization (must match the document)
/// * `document` - Mutable reference to the document
/// * `signed_blob_id` - New blob ID for the signed document version
/// * `ctx` - Transaction context for sender identification
///
/// # Panics
/// * If the sender is not an authorized signer
public fun update_signed_blob_id(
    _: &SignerCap,
    document: &mut Document,
    signed_blob_id: String,
    ctx: &mut TxContext
) {
    assert!(document.authorized_signers.contains(&ctx.sender()), E_NOT_AUTHORIZED);
    document.signed_blob_id.push_back(signed_blob_id);
}

/// Issues signer capabilities to a new authorized address
///
/// Allows the document creator to add a new authorized signer to an
/// existing document. This function creates a new `SignerCap` and
/// transfers it to the recipient, while also updating the registry
/// and document's authorized signers list.
///
/// # Parameters
/// * `document_registry` - Mutable reference to the document registry
/// * `document` - Mutable reference to the document
/// * `recipient` - Address of the new authorized signer
/// * `ctx` - Transaction context for object creation and sender identification
///
/// # Panics
/// * If the sender is not the document creator
///
/// # Creates
/// * A new `SignerCap` object (transferred to the recipient)
public fun issue_signer_capability(
    document_registry: &mut DocumentRegistry,
    document: &mut Document,
    recipient: address,
    ctx: &mut TxContext
) {
    assert!(ctx.sender() == document.creator, E_NOT_AUTHORIZED);
    let document_id = object::id(document);

    // Add to registry - assigned_to_user
    if (!document_registry.assigned_to_user.contains(recipient)) {
        document_registry.assigned_to_user.add(recipient, vector::empty());
    };
    let signer_docs = document_registry.assigned_to_user.borrow_mut(recipient);
    signer_docs.push_back(object::id(document));
    document.authorized_signers.push_back(recipient);

    let cap = SignerCap {
        id: object::new(ctx),
        document_id,
    };

    transfer::public_transfer(cap, recipient);
}

/// Signs a document using a SignerCap capability
///
/// Records a signature on the document from an authorized signer. The
/// signer must present a valid `SignerCap` that matches the document.
/// The document status is automatically updated based on the number of
/// collected signatures versus required signers.
///
/// # Parameters
/// * `document` - Mutable reference to the document
/// * `cap` - SignerCap capability proving authorization
/// * `clock` - Clock object for timestamp generation
/// * `ctx` - Transaction context for sender identification
///
/// # Panics
/// * If the SignerCap does not match the document
/// * If the signer has already signed the document
///
/// # Emits
/// * `DocumentSigned` event with signature details
public fun sign_document(
    document: &mut Document,
    cap: &SignerCap,
    clock: &Clock,
    ctx: &mut TxContext
) {
    assert!(
        cap.document_id == object::id(document),
        E_NOT_AUTHORIZED
    );

    let signer = ctx.sender();

    let already_signed = has_signed(document, signer);
    assert!(!already_signed, E_ALREADY_SIGNED);

    // Add signature
    let signature = Signature {
        signer,
        signed_at: clock.timestamp_ms(),
    };
    
    document.signatures.push_back(signature);

    // Update status
    let total_sigs = document.signatures.length();
    let total_required = document.authorized_signers.length();
    
    if (total_sigs == total_required) {
        document.status = 2; // completed
    } else {
        document.status = 1; // partially signed
    };

    // Emit event
    event::emit(DocumentSigned {
        document_id: object::id(document),
        signer,
        timestamp: clock.timestamp_ms(),
        total_signatures: total_sigs,
    });
}

/// Seal approval function for document decryption
///
/// This entry function is called by the Seal encryption system to verify
/// that a user has permission to decrypt a document. Only the document
/// creator or authorized signers can decrypt.
///
/// # Parameters
/// * `_` - Encrypted object ID (unused, required by Seal API)
/// * `document` - Reference to the document
/// * `ctx` - Transaction context for sender identification
///
/// # Panics
/// * If the sender is not the creator or an authorized signer
entry fun seal_approve(_: vector<u8>, document: &Document, ctx: &TxContext) {
    assert!(
        vector::contains(&document.authorized_signers, &ctx.sender()) || 
        ctx.sender() == document.creator, 
        E_NOT_AUTHORIZED
    );
}

/// Revokes a signer's authorization from a document
///
/// Allows the document creator to remove an authorized signer from the
/// document's authorized signers list. This prevents the revoked signer
/// from signing the document, but does not affect existing signatures.
///
/// # Parameters
/// * `document` - Mutable reference to the document
/// * `signer_to_revoke` - Address of the signer to revoke
/// * `ctx` - Transaction context for sender identification
///
/// # Panics
/// * If the sender is not the document creator
public fun revoke_signer(
    document: &mut Document,
    signer_to_revoke: address,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();
    assert!(sender == document.creator, E_NOT_AUTHORIZED);
    
    let (found, index) = document.authorized_signers.index_of(&signer_to_revoke);
    if (found) {
        vector::remove(&mut document.authorized_signers, index);
    };
}

// ======== View Functions ========

/// Returns all document IDs created by a specific user
///
/// Queries the registry to find all documents that were created by
/// the specified user address.
///
/// # Parameters
/// * `registry` - Reference to the document registry
/// * `user` - Address of the user
///
/// # Returns
/// * Vector of document IDs created by the user (empty if none)
public fun get_created_documents(
    registry: &DocumentRegistry,
    user: address
): vector<ID> {
    if (table::contains(&registry.created_by_user, user)) {
        *table::borrow(&registry.created_by_user, user)
    } else {
        vector::empty()
    }
}

/// Returns all document IDs assigned to a user for signing
///
/// Queries the registry to find all documents that the specified user
/// is authorized to sign.
///
/// # Parameters
/// * `registry` - Reference to the document registry
/// * `user` - Address of the user
///
/// # Returns
/// * Vector of document IDs assigned to the user (empty if none)
public fun get_assigned_documents(
    registry: &DocumentRegistry,
    user: address
): vector<ID> {
    if (table::contains(&registry.assigned_to_user, user)) {
        *table::borrow(&registry.assigned_to_user, user)
    } else {
        vector::empty()
    }
}

/// Returns the total number of documents in the system
///
/// # Parameters
/// * `registry` - Reference to the document registry
///
/// # Returns
/// * Total count of all documents created
public fun get_total_documents(registry: &DocumentRegistry): u64 {
    registry.total_documents
}

/// Checks if a signer has already signed a document
///
/// # Parameters
/// * `document` - Reference to the document
/// * `signer` - Address of the signer to check
///
/// # Returns
/// * `true` if the signer has signed, `false` otherwise
public fun has_signed(document: &Document, signer: address): bool {
    let mut i = 0;
    let len = document.signatures.length();
    
    while (i < len) {
        let sig = document.signatures[i];
        if (sig.signer == signer) {
            return true
        };
        i = i + 1;
    };
    
    false
}

/// Checks if an address is authorized to sign a document
///
/// # Parameters
/// * `document` - Reference to the document
/// * `addr` - Address to check
///
/// # Returns
/// * `true` if the address is in the authorized signers list, `false` otherwise
public fun is_authorized(document: &Document, addr: address): bool {
    vector::contains(&document.authorized_signers, &addr)
}

/// Returns the current status of a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Status code: 0=pending, 1=partial, 2=complete
public fun get_status(document: &Document): u8 {
    document.status
}

/// Returns the number of signatures collected on a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Count of signatures collected
public fun signatures_count(document: &Document): u64 {
    vector::length(&document.signatures)
}

/// Returns the Walrus blob ID where the document is stored
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Walrus blob ID string
public fun get_walrus_blob_id(document: &Document): String {
    document.walrus_blob_id
}

/// Returns the creator address of a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Address of the document creator
public fun get_creator(document: &Document): address {
    document.creator
}

/// Returns the title of a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Document title string
public fun get_title(document: &Document): String {
    document.title
}

/// Returns the list of authorized signers for a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Vector of authorized signer addresses
public fun get_authorized_signers(document: &Document): vector<address> {
    document.authorized_signers
}

/// Returns all signatures collected on a document
///
/// # Parameters
/// * `document` - Reference to the document
///
/// # Returns
/// * Vector of Signature structs
public fun get_signatures(document: &Document): vector<Signature> {
    document.signatures
}

// ======== Testing ========

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}