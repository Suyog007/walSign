#[test_only]
module wal_sign::workflow_tests;

// ======== Imports ========

use std::string;
use std::unit_test::assert_eq;
use sui::{
    clock::{Self, Clock},
    test_scenario::{Self, Scenario},
};

use wal_sign::wal_sign::{Self, DocumentRegistry, Document, SignerCap};

// ======== Test Constants ========

const CREATOR: address = @0xB;
const SIGNER1: address = @0xC;
const SIGNER2: address = @0xD;
const SIGNER3: address = @0xF;
const OUTSIDER: address = @0xE;

const START: u64 = 1000;
const DEADLINE: u64 = 5000;

// ======== Helpers ========

/// Returns a test clock at `time`; test clocks share time within a scenario and never go back
fun new_clock(scenario: &mut Scenario, time: u64): Clock {
    let mut clock = clock::create_for_testing(scenario.ctx());
    if (time > clock.timestamp_ms()) {
        clock.set_for_testing(time);
    };
    clock
}

/// Initialises the registry and creates a document owned by CREATOR
fun setup(signers: vector<address>): Scenario {
    let mut scenario = test_scenario::begin(CREATOR);
    wal_sign::init_for_testing(scenario.ctx());

    scenario.next_tx(CREATOR);
    let mut registry = scenario.take_shared<DocumentRegistry>();
    let clock = new_clock(&mut scenario, START);
    wal_sign::create_document(
        &mut registry,
        string::utf8(b"blob"),
        string::utf8(b"Employment contract"),
        string::utf8(b""),
        signers,
        &clock,
        scenario.ctx(),
    );
    clock.destroy_for_testing();
    test_scenario::return_shared(registry);
    scenario
}

fun sign_at(scenario: &mut Scenario, signer: address, time: u64) {
    scenario.next_tx(signer);
    let mut document = scenario.take_shared<Document>();
    let cap = scenario.take_from_sender<SignerCap>();
    let clock = new_clock(scenario, time);
    wal_sign::sign_document(&mut document, &cap, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_to_sender(scenario, cap);
    test_scenario::return_shared(document);
}

fun sign(scenario: &mut Scenario, signer: address) {
    sign_at(scenario, signer, START);
}

fun set_sequential(scenario: &mut Scenario, sender: address, sequential: bool) {
    scenario.next_tx(sender);
    let mut document = scenario.take_shared<Document>();
    wal_sign::set_signing_order(&mut document, sequential, scenario.ctx());
    test_scenario::return_shared(document);
}

fun set_deadline_at(scenario: &mut Scenario, sender: address, deadline_ms: u64, now: u64) {
    scenario.next_tx(sender);
    let mut document = scenario.take_shared<Document>();
    let clock = new_clock(scenario, now);
    wal_sign::set_deadline(&mut document, deadline_ms, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(document);
}

fun assert_status(scenario: &mut Scenario, status: u8) {
    scenario.next_tx(CREATOR);
    let document = scenario.take_shared<Document>();
    assert_eq!(wal_sign::get_status(&document), status);
    test_scenario::return_shared(document);
}

// ======== Signing Order ========

#[test]
fun test_documents_default_to_parallel_signing() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        assert!(!wal_sign::is_sequential(&document));
        assert!(wal_sign::deadline(&document).is_none());
        test_scenario::return_shared(document);
    };

    // Any order is accepted
    sign(&mut scenario, SIGNER2);
    sign(&mut scenario, SIGNER1);
    assert_status(&mut scenario, 2);
    scenario.end();
}

#[test]
fun test_sequential_signing_in_order() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2, SIGNER3]);
    set_sequential(&mut scenario, CREATOR, true);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        assert!(wal_sign::is_sequential(&document));
        assert_eq!(wal_sign::next_signer(&document), option::some(SIGNER1));
        test_scenario::return_shared(document);
    };

    sign(&mut scenario, SIGNER1);
    sign(&mut scenario, SIGNER2);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        assert_eq!(wal_sign::next_signer(&document), option::some(SIGNER3));
        test_scenario::return_shared(document);
    };

    sign(&mut scenario, SIGNER3);
    assert_status(&mut scenario, 2);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        assert!(wal_sign::next_signer(&document).is_none());
        test_scenario::return_shared(document);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_YOUR_TURN)]
fun test_sequential_signing_rejects_out_of_turn() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    set_sequential(&mut scenario, CREATOR, true);
    sign(&mut scenario, SIGNER2);
    scenario.end();
}

#[test]
fun test_completion_emits_document_completed() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);

    sign(&mut scenario, SIGNER1);
    // DocumentSigned only
    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 1);

    sign(&mut scenario, SIGNER2);
    // DocumentSigned + DocumentCompleted
    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 2);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_only_creator_sets_signing_order() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    set_sequential(&mut scenario, SIGNER1, true);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_SIGNING_STARTED)]
fun test_signing_order_locked_after_first_signature() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    sign(&mut scenario, SIGNER2);
    set_sequential(&mut scenario, CREATOR, true);
    scenario.end();
}

#[test]
fun test_signing_order_can_be_switched_back_before_signing() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    set_sequential(&mut scenario, CREATOR, true);
    set_sequential(&mut scenario, CREATOR, false);
    sign(&mut scenario, SIGNER2);
    scenario.end();
}

// ======== Deadline ========

#[test]
fun test_signing_allowed_until_deadline() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        assert_eq!(wal_sign::deadline(&document), option::some(DEADLINE));
        test_scenario::return_shared(document);
    };

    sign_at(&mut scenario, SIGNER1, DEADLINE - 1);
    sign_at(&mut scenario, SIGNER2, DEADLINE);
    assert_status(&mut scenario, 2);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_DEADLINE_PASSED)]
fun test_signing_rejected_after_deadline() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);
    sign_at(&mut scenario, SIGNER1, DEADLINE + 1);
    scenario.end();
}

#[test]
fun test_extending_deadline_reopens_signing() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE * 2, DEADLINE + 1);
    sign_at(&mut scenario, SIGNER1, DEADLINE + 2);
    assert_status(&mut scenario, 2);
    scenario.end();
}

#[test]
fun test_clearing_deadline_allows_late_signing() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);

    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        wal_sign::clear_deadline(&mut document, scenario.ctx());
        assert!(wal_sign::deadline(&document).is_none());
        test_scenario::return_shared(document);
    };

    sign_at(&mut scenario, SIGNER1, DEADLINE + 1);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_INVALID_DEADLINE)]
fun test_deadline_must_be_in_future() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, START, START);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_only_creator_sets_deadline() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, OUTSIDER, DEADLINE, START);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_only_creator_clears_deadline() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);

    scenario.next_tx(SIGNER1);
    let mut document = scenario.take_shared<Document>();
    wal_sign::clear_deadline(&mut document, scenario.ctx());
    test_scenario::return_shared(document);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_DOCUMENT_COMPLETED)]
fun test_no_deadline_on_completed_document() {
    let mut scenario = setup(vector[SIGNER1]);
    sign(&mut scenario, SIGNER1);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);
    scenario.end();
}

#[test]
fun test_is_past_deadline() {
    let mut scenario = setup(vector[SIGNER1]);
    set_deadline_at(&mut scenario, CREATOR, DEADLINE, START);

    scenario.next_tx(CREATOR);
    {
        let document = scenario.take_shared<Document>();
        let clock = new_clock(&mut scenario, DEADLINE);
        assert!(!wal_sign::is_past_deadline(&document, &clock));
        clock.destroy_for_testing();
        let clock = new_clock(&mut scenario, DEADLINE + 1);
        assert!(wal_sign::is_past_deadline(&document, &clock));
        clock.destroy_for_testing();
        test_scenario::return_shared(document);
    };
    scenario.end();
}

// ======== Decline ========

fun decline(scenario: &mut Scenario, signer: address, reason: vector<u8>) {
    scenario.next_tx(signer);
    let mut document = scenario.take_shared<Document>();
    let cap = scenario.take_from_sender<SignerCap>();
    let clock = new_clock(scenario, START + 10);
    wal_sign::decline_document(&mut document, &cap, string::utf8(reason), &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_to_sender(scenario, cap);
    test_scenario::return_shared(document);
}

fun reassign(scenario: &mut Scenario, sender: address, from: address, to: address) {
    scenario.next_tx(sender);
    let mut registry = scenario.take_shared<DocumentRegistry>();
    let mut document = scenario.take_shared<Document>();
    let clock = new_clock(scenario, START + 20);
    wal_sign::reassign_signer(&mut registry, &mut document, from, to, &clock, scenario.ctx());
    clock.destroy_for_testing();
    test_scenario::return_shared(document);
    test_scenario::return_shared(registry);
}

#[test]
fun test_signer_declines_with_reason() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    decline(&mut scenario, SIGNER1, b"Salary figure is wrong");

    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 1);
    {
        let document = scenario.take_shared<Document>();
        assert_eq!(wal_sign::get_status(&document), 3);
        assert!(wal_sign::is_declined(&document));
        assert!(wal_sign::has_declined(&document, SIGNER1));
        assert!(!wal_sign::has_declined(&document, SIGNER2));

        let declines = wal_sign::declines(&document);
        assert_eq!(declines.length(), 1);
        let (signer, reason, declined_at) = wal_sign::decline_details(&declines[0]);
        assert_eq!(signer, SIGNER1);
        assert_eq!(reason, string::utf8(b"Salary figure is wrong"));
        assert_eq!(declined_at, START + 10);
        test_scenario::return_shared(document);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_DOCUMENT_DECLINED)]
fun test_signing_paused_while_declined() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    decline(&mut scenario, SIGNER1, b"Wrong start date");
    sign(&mut scenario, SIGNER2);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_INVALID_REASON)]
fun test_decline_requires_reason() {
    let mut scenario = setup(vector[SIGNER1]);
    decline(&mut scenario, SIGNER1, b"");
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_INVALID_REASON)]
fun test_decline_reason_length_limited() {
    let mut scenario = setup(vector[SIGNER1]);
    let mut reason = vector[];
    let mut i = 0;
    while (i <= wal_sign::max_reason_bytes()) {
        reason.push_back(65);
        i = i + 1;
    };
    decline(&mut scenario, SIGNER1, reason);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_ALREADY_SIGNED)]
fun test_cannot_decline_after_signing() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    sign(&mut scenario, SIGNER1);
    decline(&mut scenario, SIGNER1, b"Changed my mind");
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_ALREADY_DECLINED)]
fun test_cannot_decline_twice() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    decline(&mut scenario, SIGNER1, b"No");
    decline(&mut scenario, SIGNER1, b"Still no");
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_DOCUMENT_COMPLETED)]
fun test_cannot_decline_completed_document() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    sign(&mut scenario, SIGNER1);
    sign(&mut scenario, SIGNER2);
    decline(&mut scenario, SIGNER2, b"Too late");
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_revoked_signer_cannot_decline() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        wal_sign::revoke_signer(&mut document, SIGNER1, scenario.ctx());
        test_scenario::return_shared(document);
    };
    decline(&mut scenario, SIGNER1, b"No");
    scenario.end();
}

#[test]
fun test_revoking_declined_signer_resumes_signing() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    decline(&mut scenario, SIGNER1, b"Not my document");

    scenario.next_tx(CREATOR);
    {
        let mut document = scenario.take_shared<Document>();
        wal_sign::revoke_signer(&mut document, SIGNER1, scenario.ctx());
        assert!(!wal_sign::is_declined(&document));
        assert_eq!(wal_sign::get_status(&document), 0);
        test_scenario::return_shared(document);
    };

    sign(&mut scenario, SIGNER2);
    assert_status(&mut scenario, 2);
    scenario.end();
}

// ======== Reassign ========

#[test]
fun test_reassign_declined_signer_keeps_position() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    set_sequential(&mut scenario, CREATOR, true);
    decline(&mut scenario, SIGNER1, b"Ask my colleague");
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER3);

    let effects = scenario.next_tx(CREATOR);
    assert_eq!(effects.num_user_events(), 1);
    {
        let registry = scenario.take_shared<DocumentRegistry>();
        let document = scenario.take_shared<Document>();
        assert_eq!(wal_sign::get_authorized_signers(&document), vector[SIGNER3, SIGNER2]);
        assert!(!wal_sign::is_declined(&document));
        assert_eq!(wal_sign::get_status(&document), 0);
        assert_eq!(wal_sign::next_signer(&document), option::some(SIGNER3));
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER1).length(), 0);
        assert_eq!(wal_sign::get_assigned_documents(&registry, SIGNER3), vector[object::id(&document)]);
        test_scenario::return_shared(document);
        test_scenario::return_shared(registry);
    };

    // The new signer got a cap and signs first, as SIGNER1 would have
    sign(&mut scenario, SIGNER3);
    sign(&mut scenario, SIGNER2);
    assert_status(&mut scenario, 2);
    scenario.end();
}

#[test]
fun test_reassign_pending_signer_without_decline() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    sign(&mut scenario, SIGNER2);
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER3);
    assert_status(&mut scenario, 1);
    sign(&mut scenario, SIGNER3);
    assert_status(&mut scenario, 2);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_reassigned_signer_cannot_sign() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER3);
    sign(&mut scenario, SIGNER1);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_AUTHORIZED)]
fun test_only_creator_reassigns() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    reassign(&mut scenario, SIGNER2, SIGNER1, SIGNER3);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_ALREADY_SIGNED)]
fun test_cannot_reassign_signer_who_signed() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    sign(&mut scenario, SIGNER1);
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER3);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_NOT_A_SIGNER)]
fun test_cannot_reassign_non_signer() {
    let mut scenario = setup(vector[SIGNER1]);
    reassign(&mut scenario, CREATOR, OUTSIDER, SIGNER3);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_ALREADY_A_SIGNER)]
fun test_cannot_reassign_to_existing_signer() {
    let mut scenario = setup(vector[SIGNER1, SIGNER2]);
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER2);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = wal_sign::E_DOCUMENT_COMPLETED)]
fun test_cannot_reassign_on_completed_document() {
    let mut scenario = setup(vector[SIGNER1]);
    sign(&mut scenario, SIGNER1);
    reassign(&mut scenario, CREATOR, SIGNER1, SIGNER3);
    scenario.end();
}
