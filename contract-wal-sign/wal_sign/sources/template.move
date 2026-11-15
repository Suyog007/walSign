module wal_sign::template;

// ======== Imports ========

use std::string::String;
use sui::clock::Clock;

// ======== Error codes ========

/// Error: Template name is empty or longer than MAX_NAME_BYTES
const E_INVALID_NAME: u64 = 1;
/// Error: A template needs between 1 and MAX_ROLES non-empty roles
const E_INVALID_ROLES: u64 = 2;
/// Error: A signature field refers to a role that does not exist or has no area
const E_INVALID_FIELD: u64 = 3;
/// Error: Too many signature fields
const E_TOO_MANY_FIELDS: u64 = 4;
/// Error: Seal key id is not namespaced under this template
const E_INVALID_KEY_ID: u64 = 5;

const MAX_NAME_BYTES: u64 = 100;
const MAX_ROLES: u64 = 20;
const MAX_FIELDS: u64 = 100;

// ======== Structs ========

/// Reusable document template owned by its creator
///
/// The template PDF is stored on Walrus, Seal-encrypted under a key id
/// namespaced by the template ID. Since only the owner can pass an owned
/// object into a transaction, only the owner can decrypt it. Templates
/// cannot be transferred.
public struct Template has key {
    id: UID,
    owner: address,
    name: String,
    description: String,
    /// Walrus blob ID of the encrypted template PDF (empty until uploaded)
    walrus_blob_id: String,
    /// Signer roles in their default signing order, e.g. ["Tenant", "Landlord"]
    roles: vector<String>,
    /// Where each role signs
    fields: vector<SignatureField>,
    /// Whether documents created from it default to sequential signing
    sequential: bool,
    created_at: u64,
}

/// Rectangle on a page where a role signs, in PDF points from the top-left corner
public struct SignatureField has store, copy, drop {
    /// Index into `roles`
    role: u64,
    /// Zero-based page number
    page: u64,
    x: u64,
    y: u64,
    width: u64,
    height: u64,
}

// ======== Public Functions ========

/// Builds a signature field, for use in a programmable transaction
public fun new_field(role: u64, page: u64, x: u64, y: u64, width: u64, height: u64): SignatureField {
    SignatureField { role, page, x, y, width, height }
}

/// Creates a template owned by the sender
///
/// The PDF is uploaded afterwards (it is encrypted under the template ID)
/// and recorded with `set_blob_id`.
///
/// # Panics
/// * If the name is empty or too long
/// * If there are no roles, too many roles or an empty role name
/// * If a field refers to a missing role or has no area, or there are too many fields
public fun create_template(
    name: String,
    description: String,
    roles: vector<String>,
    fields: vector<SignatureField>,
    sequential: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!name.is_empty() && name.length() <= MAX_NAME_BYTES, E_INVALID_NAME);
    assert!(!roles.is_empty() && roles.length() <= MAX_ROLES, E_INVALID_ROLES);
    let mut i = 0;
    while (i < roles.length()) {
        assert!(!roles[i].is_empty(), E_INVALID_ROLES);
        i = i + 1;
    };
    assert!(fields.length() <= MAX_FIELDS, E_TOO_MANY_FIELDS);
    let mut j = 0;
    while (j < fields.length()) {
        let field = &fields[j];
        assert!(field.role < roles.length() && field.width > 0 && field.height > 0, E_INVALID_FIELD);
        j = j + 1;
    };

    transfer::transfer(
        Template {
            id: object::new(ctx),
            owner: ctx.sender(),
            name,
            description,
            walrus_blob_id: std::string::utf8(b""),
            roles,
            fields,
            sequential,
            created_at: clock.timestamp_ms(),
        },
        ctx.sender(),
    );
}

/// Records the Walrus blob of the encrypted template PDF
public fun set_blob_id(template: &mut Template, walrus_blob_id: String) {
    template.walrus_blob_id = walrus_blob_id;
}

/// Deletes a template
public fun delete_template(template: Template) {
    let Template { id, .. } = template;
    id.delete();
}

// ======== Seal Policy ========

/// Seal approval function for template PDFs
///
/// Only the owner can provide their owned `Template`, so only they obtain
/// keys; ids must be namespaced under the template ID.
entry fun seal_approve_template(id: vector<u8>, template: &Template) {
    assert!(wal_sign::wal_sign::is_prefix(object::id(template).to_bytes(), &id), E_INVALID_KEY_ID);
}

// ======== View Functions ========

public fun owner(template: &Template): address { template.owner }

public fun name(template: &Template): String { template.name }

public fun walrus_blob_id(template: &Template): String { template.walrus_blob_id }

public fun roles(template: &Template): vector<String> { template.roles }

public fun fields(template: &Template): vector<SignatureField> { template.fields }

public fun is_sequential(template: &Template): bool { template.sequential }

/// Returns the role index, page and rectangle of a field
public fun field_details(field: &SignatureField): (u64, u64, u64, u64, u64, u64) {
    (field.role, field.page, field.x, field.y, field.width, field.height)
}
