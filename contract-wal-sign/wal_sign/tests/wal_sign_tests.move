module wal_sign::wal_sign_tests;

// ======== Imports ========

use std::string;
use std::unit_test::assert_eq;
use sui::{
    test_scenario::{Self},
    clock::{Self, Clock},
};

use wal_sign::wal_sign::{
    Self,
    DocumentRegistry,
    Document,
    SignerCap,
};

// ======== Test Constants ========

const ADMIN: address = @0xA;
const CREATOR: address = @0xB;
const SIGNER1: address = @0xF;
const SIGNER2: address = @0xC;
const SIGNER3: address = @0xD;
const UNAUTHORIZED: address = @0xE;

const WALRUS_BLOB_ID: vector<u8> = b"walrus_blob_123";
const NEW_WALRUS_BLOB_ID: vector<u8> = b"walrus_blob_456";
const SIGNED_BLOB_ID: vector<u8> = b"signed_blob_789";
const DOCUMENT_TITLE: vector<u8> = b"Test Document";
const DOCUMENT_DESCRIPTION: vector<u8> = b"Test Description";

// ======== Helper Functions ========

/// Helper function to create a test clock
fun create_test_clock(ctx: &mut TxContext): Clock {
    clock::create_for_testing(ctx)
}

/// Helper function to set clock time
fun set_clock_time(clock: &mut Clock, time: u64) {
    clock.set_for_testing(time);
}

// ======== Init Function Tests ========

#[test]
fun test_init() {

    let mut scenario = test_scenario::begin(ADMIN);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(ADMIN);
    {
        let registry = scenario.take_shared<DocumentRegistry>();
        
        assert_eq!(wal_sign::get_total_documents(&registry), 0);
        
        test_scenario::return_shared(registry);
    };
    scenario.end();    
}

// ======== Document Creation Tests ========

#[test]
fun test_create_document_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        let authorized_signers = vector[SIGNER1, SIGNER2];
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            authorized_signers,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_total_documents(&registry), 1);
        assert_eq!(wal_sign::get_created_documents(&registry, CREATOR).length(), 1);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER1).length(), 1);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER2).length(), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        
        assert_eq!(wal_sign::get_title(&document), string::utf8(DOCUMENT_TITLE));
        assert_eq!(wal_sign::get_creator(&document), CREATOR);
        assert_eq!(wal_sign::get_status(&document), 0); // pending
        assert_eq!(wal_sign::signatures_count(&document), 0);
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 2);
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_create_document_with_single_signer() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        let authorized_signers = vector[SIGNER1];
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            authorized_signers,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_total_documents(&registry), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.end();
}

#[test]
fun test_create_document_with_multiple_signers() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        let authorized_signers = vector[SIGNER1, SIGNER2, SIGNER3];
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            authorized_signers,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_total_documents(&registry), 1);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER1).length(), 1);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER2).length(), 1);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER3).length(), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.next_tx(SIGNER3);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.end();
}

#[test]
fun test_create_multiple_documents() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        // Create first document
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(b"Document 1"),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        // Create second document
        wal_sign::create_document(
            &mut registry,
            string::utf8(b"walrus_blob_456"),
            string::utf8(b"Document 2"),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_total_documents(&registry), 2);
        assert_eq!(wal_sign::get_created_documents(&registry, CREATOR).length(), 2);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.end();
}

// ======== Sign Document Tests ========

#[test]
fun test_sign_document_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::signatures_count(&document), 1);
        assert_eq!(wal_sign::get_status(&document), 2); // completed (1/1)
        assert!(wal_sign::has_signed(&document, SIGNER1));
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_sign_document_partial_completion() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::signatures_count(&document), 1);
        assert_eq!(wal_sign::get_status(&document), 1); // partial (1/2)
        assert!(wal_sign::has_signed(&document, SIGNER1));
        assert!(!wal_sign::has_signed(&document, SIGNER2));
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 3000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::signatures_count(&document), 2);
        assert_eq!(wal_sign::get_status(&document), 2); // completed (2/2)
        assert!(wal_sign::has_signed(&document, SIGNER1));
        assert!(wal_sign::has_signed(&document, SIGNER2));
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_ALREADY_SIGNED)]
fun test_sign_document_already_signed() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        // Try to sign again - should fail
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Issue Signer Capability Tests ========

#[test]
fun test_issue_signer_capability_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut document = scenario.take_shared<Document>();
        
        wal_sign::issue_signer_capability(
            &mut registry,
            &mut document,
            SIGNER2,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER2).length(), 1);
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 2);
        
        test_scenario::return_shared(registry);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        test_scenario::return_to_sender(&scenario, cap);
    };
    
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_issue_signer_capability_not_creator() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut document = scenario.take_shared<Document>();
        
        // SIGNER1 tries to issue capability - should fail
        wal_sign::issue_signer_capability(
            &mut registry,
            &mut document,
            SIGNER2,
            scenario.ctx(),
        );
        
        test_scenario::return_shared(registry);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Update Blob ID Tests ========

#[test]
fun test_update_blob_id_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        
        assert_eq!(wal_sign::get_walrus_blob_id(&document), string::utf8(WALRUS_BLOB_ID));
        
        wal_sign::update_blob_id(
            &mut document,
            string::utf8(NEW_WALRUS_BLOB_ID),
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_walrus_blob_id(&document), string::utf8(NEW_WALRUS_BLOB_ID));
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_update_blob_id_not_creator() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let mut document = scenario.take_shared<Document>();
        
        // SIGNER1 tries to update blob ID - should fail
        wal_sign::update_blob_id(
            &mut document,
            string::utf8(NEW_WALRUS_BLOB_ID),
            scenario.ctx(),
        );
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Update Signed Blob ID Tests ========

#[test]
fun test_update_signed_blob_id_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        
        wal_sign::update_signed_blob_id(
            &cap,
            &mut document,
            string::utf8(SIGNED_BLOB_ID),
            scenario.ctx(),
        );
        
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Revoke Signer Tests ========

#[test]
fun test_revoke_signer_success() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 2);
        assert!(wal_sign::is_authorized(&document, SIGNER1));
        
        wal_sign::revoke_signer(
            &mut document,
            SIGNER1,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 1);
        assert!(!wal_sign::is_authorized(&document, SIGNER1));
        assert!(wal_sign::is_authorized(&document, SIGNER2));
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_revoke_signer_not_creator() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let mut document = scenario.take_shared<Document>();
        
        // SIGNER1 tries to revoke SIGNER2 - should fail
        wal_sign::revoke_signer(
            &mut document,
            SIGNER2,
            scenario.ctx(),
        );
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Seal Approve Tests ========

#[test]
fun test_seal_approve_creator() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        let encrypted_id = vector::empty<u8>();
        
        // Creator should be able to approve
        wal_sign::seal_approve(encrypted_id, &document, scenario.ctx());
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_seal_approve_authorized_signer() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let document = scenario.take_shared<Document>();
        let encrypted_id = vector::empty<u8>();
        
        // Authorized signer should be able to approve
        wal_sign::seal_approve(encrypted_id, &document, scenario.ctx());
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_seal_approve_unauthorized() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(UNAUTHORIZED);
    {
        let document = scenario.take_shared<Document>();
        let encrypted_id = vector::empty<u8>();
        
        // Unauthorized user tries to approve - should fail
        wal_sign::seal_approve(encrypted_id, &document, scenario.ctx());
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== View Function Tests ========

#[test]
fun test_get_created_documents() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(b"Document 1"),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(b"walrus_blob_456"),
            string::utf8(b"Document 2"),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        let created_docs = wal_sign::get_created_documents(&registry, CREATOR);
        assert_eq!(created_docs.length(), 2);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.end();
}

#[test]
fun test_get_assigned_documents() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        let assigned_docs_signer1 = wal_sign::get_assigned_documents(&registry, SIGNER1);
        let assigned_docs_signer2 = wal_sign::get_assigned_documents(&registry, SIGNER2);
        
        assert_eq!(assigned_docs_signer1.length(), 1);
        assert_eq!(assigned_docs_signer2.length(), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.end();
}

#[test]
fun test_get_document_properties() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        
        assert_eq!(wal_sign::get_title(&document), string::utf8(DOCUMENT_TITLE));
        assert_eq!(wal_sign::get_creator(&document), CREATOR);
        assert_eq!(wal_sign::get_walrus_blob_id(&document), string::utf8(WALRUS_BLOB_ID));
        assert_eq!(wal_sign::get_status(&document), 0);
        assert_eq!(wal_sign::signatures_count(&document), 0);
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 1);
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_has_signed() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        assert!(!wal_sign::has_signed(&document, SIGNER1));
        assert!(!wal_sign::has_signed(&document, SIGNER2));
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert!(wal_sign::has_signed(&document, SIGNER1));
        assert!(!wal_sign::has_signed(&document, SIGNER2));
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_is_authorized() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        
        assert!(wal_sign::is_authorized(&document, SIGNER1));
        assert!(wal_sign::is_authorized(&document, SIGNER2));
        assert!(!wal_sign::is_authorized(&document, UNAUTHORIZED));
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_get_signatures() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        let signatures = wal_sign::get_signatures(&document);
        assert_eq!(signatures.length(), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

// ======== Edge Case Tests ========

#[test]
fun test_create_document_with_empty_signers() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector::empty<address>(),
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_total_documents(&registry), 1);
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        
        assert_eq!(wal_sign::get_authorized_signers(&document).length(), 0);
        assert_eq!(wal_sign::signatures_count(&document), 0);
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_multiple_signers_complete_document() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2, SIGNER3],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_status(&document), 1); // partial (1/3)
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 3000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_status(&document), 1); // partial (2/3)
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(SIGNER3);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 4000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        assert_eq!(wal_sign::get_status(&document), 2); // completed (3/3)
        assert_eq!(wal_sign::signatures_count(&document), 3);
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_revoke_signer_after_signing() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 2000);
        
        wal_sign::sign_document(
            &mut document,
            &cap,
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        
        // Revoke SIGNER2 after SIGNER1 has already signed
        wal_sign::revoke_signer(
            &mut document,
            SIGNER2,
            scenario.ctx(),
        );
        
        // SIGNER1's signature should still exist
        assert_eq!(wal_sign::signatures_count(&document), 1);
        assert!(wal_sign::has_signed(&document, SIGNER1));
        assert!(!wal_sign::is_authorized(&document, SIGNER2));
        
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

#[test]
fun test_update_signed_blob_id_multiple_times() {
    let mut scenario = test_scenario::begin(CREATOR);
    {
        wal_sign::init_for_testing(scenario.ctx());
    };
    
    scenario.next_tx(CREATOR);
    {
        let mut registry = scenario.take_shared<DocumentRegistry>();
        let mut clock = create_test_clock(scenario.ctx());
        set_clock_time(&mut clock, 1000);
        
        wal_sign::create_document(
            &mut registry,
            string::utf8(WALRUS_BLOB_ID),
            string::utf8(DOCUMENT_TITLE),
            string::utf8(DOCUMENT_DESCRIPTION),
            vector[SIGNER1, SIGNER2],
            &clock,
            scenario.ctx(),
        );
        
        clock.destroy_for_testing();
        test_scenario::return_shared(registry);
    };
    
    scenario.next_tx(SIGNER1);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        
        wal_sign::update_signed_blob_id(
            &cap,
            &mut document,
            string::utf8(b"signed_blob_1"),
            scenario.ctx(),
        );
        
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.next_tx(SIGNER2);
    {
        let cap = scenario.take_from_sender<SignerCap>();
        let mut document = scenario.take_shared<Document>();
        
        wal_sign::update_signed_blob_id(
            &cap,
            &mut document,
            string::utf8(b"signed_blob_2"),
            scenario.ctx(),
        );
        
        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(document);
    };
    
    scenario.end();
}

