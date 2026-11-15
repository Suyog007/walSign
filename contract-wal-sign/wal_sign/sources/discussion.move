module wal_sign::discussion;

// ======== Imports ========

use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::event;
use sui::table::{Self, Table};
use wal_sign::wal_sign::{Self, Document};

// ======== Error codes ========

/// Error: Sender is neither the document creator nor an authorized signer
const E_NOT_PARTICIPANT: u64 = 1;
/// Error: The thread does not belong to the given document
const E_WRONG_DOCUMENT: u64 = 2;
/// Error: The document already has a discussion thread
const E_THREAD_EXISTS: u64 = 3;
/// Error: Message ciphertext is empty
const E_EMPTY_MESSAGE: u64 = 4;
/// Error: Message ciphertext exceeds MAX_MESSAGE_BYTES
const E_MESSAGE_TOO_LARGE: u64 = 5;
/// Error: Seal key id is not namespaced under this thread
const E_INVALID_KEY_ID: u64 = 6;

/// Upper bound for a single encrypted message, keeps thread storage costs predictable
const MAX_MESSAGE_BYTES: u64 = 8192;

// ======== Structs ========

/// Private discussion attached to a document
///
/// Shared object holding Seal-encrypted messages. Messages are readable
/// only by the participants of the linked document (its creator and
/// authorized signers): every message is encrypted under a key id that
/// starts with this thread's object ID, and `seal_approve_thread` releases
/// those keys only to current participants.
public struct Thread has key {
    id: UID,
    /// Document this discussion belongs to
    document_id: ID,
    /// Participant who opened the thread
    created_by: address,
    /// Timestamp when the thread was opened (in milliseconds)
    created_at: u64,
    /// Messages in posting order, keyed by their index
    messages: Table<u64, Message>,
}

/// A single encrypted message in a thread
public struct Message has store, copy, drop {
    /// Address that posted the message
    sender: address,
    /// Seal-encrypted message body
    ciphertext: vector<u8>,
    /// Timestamp when the message was posted (in milliseconds)
    posted_at: u64,
}

/// Dynamic field key on a `Document` that stores its thread's ID
public struct ThreadKey has copy, drop, store {}

// ======== Events ========

/// Emitted when a participant opens the discussion for a document
public struct ThreadCreated has copy, drop {
    thread_id: ID,
    document_id: ID,
    created_by: address,
    timestamp: u64,
}

/// Emitted when a participant posts a message (the body stays encrypted on chain)
public struct MessagePosted has copy, drop {
    thread_id: ID,
    document_id: ID,
    sender: address,
    index: u64,
    timestamp: u64,
}

// ======== Public Functions ========

/// Opens the discussion thread for a document
///
/// Any participant can open it; a document has at most one thread, whose
/// ID is recorded on the document so clients can find it.
///
/// # Panics
/// * If the sender is not a participant of the document
/// * If the document already has a thread
///
/// # Emits
/// * `ThreadCreated`
public fun create_thread(document: &mut Document, clock: &Clock, ctx: &mut TxContext) {
    let sender = ctx.sender();
    assert!(wal_sign::is_participant(document, sender), E_NOT_PARTICIPANT);
    assert!(!has_thread(document), E_THREAD_EXISTS);

    let document_id = object::id(document);
    let thread = Thread {
        id: object::new(ctx),
        document_id,
        created_by: sender,
        created_at: clock.timestamp_ms(),
        messages: table::new(ctx),
    };
    let thread_id = object::id(&thread);

    df::add(wal_sign::uid_mut(document), ThreadKey {}, thread_id);

    event::emit(ThreadCreated {
        thread_id,
        document_id,
        created_by: sender,
        timestamp: thread.created_at,
    });

    transfer::share_object(thread);
}

/// Posts an encrypted message to a document's thread
///
/// The ciphertext must be produced client-side with Seal under a key id
/// that starts with the thread ID; the contract only stores it.
///
/// # Panics
/// * If the thread does not belong to the document
/// * If the sender is not a (current) participant of the document
/// * If the ciphertext is empty or larger than `MAX_MESSAGE_BYTES`
///
/// # Emits
/// * `MessagePosted`
public fun post_message(
    thread: &mut Thread,
    document: &Document,
    ciphertext: vector<u8>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(thread.document_id == object::id(document), E_WRONG_DOCUMENT);
    let sender = ctx.sender();
    assert!(wal_sign::is_participant(document, sender), E_NOT_PARTICIPANT);
    assert!(!ciphertext.is_empty(), E_EMPTY_MESSAGE);
    assert!(ciphertext.length() <= MAX_MESSAGE_BYTES, E_MESSAGE_TOO_LARGE);

    let index = thread.messages.length();
    let posted_at = clock.timestamp_ms();
    thread.messages.add(index, Message { sender, ciphertext, posted_at });

    event::emit(MessagePosted {
        thread_id: object::id(thread),
        document_id: thread.document_id,
        sender,
        index,
        timestamp: posted_at,
    });
}

// ======== Seal Policy ========

/// Seal approval function for thread messages
///
/// Releases decryption keys for ids namespaced under this thread to the
/// current participants of the linked document. A signer revoked from the
/// document loses access to the whole discussion.
///
/// # Panics
/// * If the key id is not namespaced under the thread
/// * If the thread does not belong to the document
/// * If the sender is not a participant of the document
entry fun seal_approve_thread(id: vector<u8>, thread: &Thread, document: &Document, ctx: &TxContext) {
    assert!(wal_sign::is_prefix(object::id(thread).to_bytes(), &id), E_INVALID_KEY_ID);
    assert!(thread.document_id == object::id(document), E_WRONG_DOCUMENT);
    assert!(wal_sign::is_participant(document, ctx.sender()), E_NOT_PARTICIPANT);
}

// ======== View Functions ========

/// Returns `true` if the document already has a discussion thread
public fun has_thread(document: &Document): bool {
    df::exists_(wal_sign::uid(document), ThreadKey {})
}

/// Returns the ID of the document's thread, if one was opened
public fun thread_id(document: &Document): Option<ID> {
    if (has_thread(document)) {
        option::some(*df::borrow(wal_sign::uid(document), ThreadKey {}))
    } else {
        option::none()
    }
}

/// Returns the document a thread belongs to
public fun document_id(thread: &Thread): ID {
    thread.document_id
}

/// Returns the number of messages posted to a thread
public fun message_count(thread: &Thread): u64 {
    thread.messages.length()
}

/// Returns the sender, ciphertext and timestamp of the message at `index`
public fun message(thread: &Thread, index: u64): (address, vector<u8>, u64) {
    let message = &thread.messages[index];
    (message.sender, message.ciphertext, message.posted_at)
}

/// Returns the maximum accepted ciphertext size in bytes
public fun max_message_bytes(): u64 {
    MAX_MESSAGE_BYTES
}
