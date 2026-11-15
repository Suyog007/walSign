#[test_only]
module wal_sign::discussion_tests;

// ======== Imports ========

use std::string;
use std::unit_test::assert_eq;
use sui::{
    clock::{Self, Clock},
    test_scenario::{Self, Scenario},
};

use wal_sign::discussion::{Self, Thread};
use wal_sign::wal_sign::{Self, DocumentRegistry, Document};

// ======== Test Constants ========

const CREATOR: address = @0xB;
const SIGNER1: address = @0xC;
const SIGNER2: address = @0xD;
const OUTSIDER: address = @0xE;

const CIPHERTEXT: vector<u8> = b"sealed-message";

// ======== Helpers ========

/// Returns a test clock at `time`; test clocks share time within a scenario and never go back
fun new_clock(scenario: &mut Scenario, time: u64): Clock {
    let mut clock = clock::create_for_testing(scenario.ctx());
    if (time > clock.timestamp_ms()) {
        clock.set_for_testing(time);
    };
    clock
}

/// Creates a document owned by CREATOR with the given signers and returns its ID
fun create_document(scenario: &mut Scenario, signers: vector<address>): ID {
    scenario.next_tx(CREATOR);
    let mut registry = scenario.take_shared<DocumentRegistry>();
    let clock = new_clock(scenario, 1000);
    wal_sign::create_document(
        &mut registry,
        string::utf8(b"blob"),
        string::utf8(b"Lease"),
        string::utf8(b""),
        signers,
        &clock,
        scenario.ctx(),
    );
    clock.destroy_for_testing();
    test_scenario::return_shared(registry);

    scenario.next_tx(CREATOR);
    test_scenario::most_recent_id_shared<Document>().destroy_some()
}

/// Opens the thread of `document_id` as `opener` and returns the thread ID
fun open_thread(scenario: &mut Scenario, document_id: ID, opener: address): ID {
    scenario.next_tx(opener);
    let mut document = scenario.take_shared_by_id<Document>(document_id);
    let clock = new_clock(scenario, 2000);
    discussion::create_thread(&mut document, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(document);

    scenario.next_tx(opener);
    test_scenario::most_recent_id_shared<Thread>().destroy_some()
}

fun post(scenario: &mut Scenario, thread_id: ID, document_id: ID, sender: address, ciphertext: vector<u8>) {
    scenario.next_tx(sender);
    let mut thread = scenario.take_shared_by_id<Thread>(thread_id);
    let document = scenario.take_shared_by_id<Document>(document_id);
    let clock = new_clock(scenario, 3000);
    discussion::post_message(&mut thread, &document, ciphertext, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(document);
    test_scenario::return_shared(thread);
}

fun approve(scenario: &mut Scenario, thread_id: ID, document_id: ID, reader: address, key_id: vector<u8>) {
    scenario.next_tx(reader);
    let thread = scenario.take_shared_by_id<Thread>(thread_id);
    let document = scenario.take_shared_by_id<Document>(document_id);
    discussion::seal_approve_thread(key_id, &thread, &document, scenario.ctx());
    test_scenario::return_shared(document);
    test_scenario::return_shared(thread);
}

fun key_id_for(thread_id: ID): vector<u8> {
    let mut id = thread_id.to_bytes();
    id.append(b"nonce-1");
    id
}

fun setup(): (Scenario, ID) {
    let mut scenario = test_scenario::begin(CREATOR);
    wal_sign::init_for_testing(scenario.ctx());
    let document_id = create_document(&mut scenario, vector[SIGNER1, SIGNER2]);
    (scenario, document_id)
}

// ======== Thread Creation ========

#[test]
fun test_participant_opens_thread() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, SIGNER1);

    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 0);
    {
        let document = scenario.take_shared_by_id<Document>(document_id);
        let thread = scenario.take_shared_by_id<Thread>(thread_id);

        assert!(discussion::has_thread(&document));
        assert_eq!(discussion::thread_id(&document), option::some(thread_id));
        assert_eq!(discussion::document_id(&thread), document_id);
        assert_eq!(discussion::message_count(&thread), 0);

        test_scenario::return_shared(thread);
        test_scenario::return_shared(document);
    };
    scenario.end();
}

#[test]
fun test_document_without_thread() {
    let (mut scenario, document_id) = setup();

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared_by_id<Document>(document_id);
        assert!(!discussion::has_thread(&document));
        assert!(discussion::thread_id(&document).is_none());
        test_scenario::return_shared(document);
    };
    scenario.end();
}

#[test]
fun test_create_thread_emits_event() {
    let (mut scenario, document_id) = setup();

    scenario.next_tx(CREATOR);
    let mut document = scenario.take_shared_by_id<Document>(document_id);
    let clock = new_clock(&mut scenario, 2000);
    discussion::create_thread(&mut document, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(document);

    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 1);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_NOT_PARTICIPANT)]
fun test_outsider_cannot_open_thread() {
    let (mut scenario, document_id) = setup();
    open_thread(&mut scenario, document_id, OUTSIDER);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_THREAD_EXISTS)]
fun test_document_has_single_thread() {
    let (mut scenario, document_id) = setup();
    open_thread(&mut scenario, document_id, CREATOR);
    open_thread(&mut scenario, document_id, SIGNER1);
    scenario.end();
}

// ======== Posting ========

#[test]
fun test_participants_post_messages_in_order() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);

    post(&mut scenario, thread_id, document_id, CREATOR, b"first");
    post(&mut scenario, thread_id, document_id, SIGNER2, b"second");

    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 1);
    {
        let thread = scenario.take_shared_by_id<Thread>(thread_id);
        assert_eq!(discussion::message_count(&thread), 2);

        let (sender, ciphertext, posted_at) = discussion::message(&thread, 0);
        assert_eq!(sender, CREATOR);
        assert_eq!(ciphertext, b"first");
        assert_eq!(posted_at, 3000);

        let (sender, ciphertext, _) = discussion::message(&thread, 1);
        assert_eq!(sender, SIGNER2);
        assert_eq!(ciphertext, b"second");

        test_scenario::return_shared(thread);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_NOT_PARTICIPANT)]
fun test_outsider_cannot_post() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    post(&mut scenario, thread_id, document_id, OUTSIDER, CIPHERTEXT);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_NOT_PARTICIPANT)]
fun test_revoked_signer_cannot_post() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    post(&mut scenario, thread_id, document_id, SIGNER1, CIPHERTEXT);

    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared_by_id<Document>(document_id);
        wal_sign::revoke_signer(&mut document, SIGNER1, scenario.ctx());
        test_scenario::return_shared(document);
    };

    post(&mut scenario, thread_id, document_id, SIGNER1, CIPHERTEXT);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_WRONG_DOCUMENT)]
fun test_cannot_post_through_another_document() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    // OUTSIDER owns an unrelated document and tries to use it as the access proof
    let other_document_id = create_document(&mut scenario, vector[OUTSIDER]);

    post(&mut scenario, thread_id, other_document_id, OUTSIDER, CIPHERTEXT);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_EMPTY_MESSAGE)]
fun test_empty_message_rejected() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    post(&mut scenario, thread_id, document_id, CREATOR, vector[]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_MESSAGE_TOO_LARGE)]
fun test_oversized_message_rejected() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);

    let mut ciphertext = vector[];
    let mut i = 0;
    while (i <= discussion::max_message_bytes()) {
        ciphertext.push_back(0);
        i = i + 1;
    };
    post(&mut scenario, thread_id, document_id, CREATOR, ciphertext);
    scenario.end();
}

// ======== Seal Policy ========

#[test]
fun test_participants_can_read() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, SIGNER1);

    approve(&mut scenario, thread_id, document_id, CREATOR, key_id_for(thread_id));
    approve(&mut scenario, thread_id, document_id, SIGNER1, key_id_for(thread_id));
    approve(&mut scenario, thread_id, document_id, SIGNER2, key_id_for(thread_id));
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_NOT_PARTICIPANT)]
fun test_outsider_cannot_read() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    approve(&mut scenario, thread_id, document_id, OUTSIDER, key_id_for(thread_id));
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_NOT_PARTICIPANT)]
fun test_revoked_signer_cannot_read() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);

    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared_by_id<Document>(document_id);
        wal_sign::revoke_signer(&mut document, SIGNER2, scenario.ctx());
        test_scenario::return_shared(document);
    };

    approve(&mut scenario, thread_id, document_id, SIGNER2, key_id_for(thread_id));
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_INVALID_KEY_ID)]
fun test_document_key_id_does_not_unlock_thread() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    approve(&mut scenario, thread_id, document_id, SIGNER1, document_id.to_bytes());
    scenario.end();
}

#[test]
#[expected_failure(abort_code = discussion::E_WRONG_DOCUMENT)]
fun test_cannot_read_through_another_document() {
    let (mut scenario, document_id) = setup();
    let thread_id = open_thread(&mut scenario, document_id, CREATOR);
    let other_document_id = create_document(&mut scenario, vector[OUTSIDER]);

    approve(&mut scenario, thread_id, other_document_id, OUTSIDER, key_id_for(thread_id));
    scenario.end();
}
