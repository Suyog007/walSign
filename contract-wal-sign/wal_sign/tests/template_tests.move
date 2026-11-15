#[test_only]
module wal_sign::template_tests;

// ======== Imports ========

use std::string::{Self, String};
use std::unit_test::assert_eq;
use sui::{
    clock::{Self, Clock},
    test_scenario::{Self, Scenario},
};

use wal_sign::template::{Self, Template, SignatureField};

// ======== Test Constants ========

const OWNER: address = @0xB;
const OTHER: address = @0xE;

// ======== Helpers ========

fun new_clock(scenario: &mut Scenario): Clock {
    clock::create_for_testing(scenario.ctx())
}

fun roles(): vector<String> {
    vector[string::utf8(b"Tenant"), string::utf8(b"Landlord")]
}

fun fields(): vector<SignatureField> {
    vector[template::new_field(0, 0, 50, 700, 180, 40), template::new_field(1, 1, 300, 700, 180, 40)]
}

fun create(scenario: &mut Scenario, name: vector<u8>, roles: vector<String>, fields: vector<SignatureField>) {
    scenario.next_tx(OWNER);
    let clock = new_clock(scenario);
    template::create_template(
        string::utf8(name),
        string::utf8(b"Standard residential lease"),
        roles,
        fields,
        true,
        &clock,
        scenario.ctx(),
    );
    clock.destroy_for_testing();
}

// ======== Tests ========

#[test]
fun test_create_template_owned_by_creator() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), fields());

    scenario.next_tx(OWNER);
    {
        let mut tpl = scenario.take_from_sender<Template>();
        assert_eq!(template::owner(&tpl), OWNER);
        assert_eq!(template::name(&tpl), string::utf8(b"Lease"));
        assert_eq!(template::roles(&tpl), roles());
        assert!(template::is_sequential(&tpl));
        assert_eq!(template::walrus_blob_id(&tpl), string::utf8(b""));

        let fields = template::fields(&tpl);
        assert_eq!(fields.length(), 2);
        let (role, page, x, y, width, height) = template::field_details(&fields[1]);
        assert_eq!(vector[role, page, x, y, width, height], vector[1, 1, 300, 700, 180, 40]);

        template::set_blob_id(&mut tpl, string::utf8(b"blob-1"));
        assert_eq!(template::walrus_blob_id(&tpl), string::utf8(b"blob-1"));
        scenario.return_to_sender(tpl);
    };

    // Nobody else received it
    scenario.next_tx(OTHER);
    assert!(!scenario.has_most_recent_for_sender<Template>());
    scenario.end();
}

#[test]
fun test_owner_can_decrypt_template() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), fields());

    scenario.next_tx(OWNER);
    {
        let tpl = scenario.take_from_sender<Template>();
        let mut key_id = object::id(&tpl).to_bytes();
        key_id.append(b"nonce");
        template::seal_approve_template(key_id, &tpl);
        scenario.return_to_sender(tpl);
    };
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_KEY_ID)]
fun test_template_does_not_unlock_other_keys() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), fields());

    scenario.next_tx(OWNER);
    {
        let tpl = scenario.take_from_sender<Template>();
        template::seal_approve_template(object::id_from_address(@0x1234).to_bytes(), &tpl);
        scenario.return_to_sender(tpl);
    };
    scenario.end();
}

#[test]
fun test_delete_template() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), fields());

    scenario.next_tx(OWNER);
    template::delete_template(scenario.take_from_sender<Template>());

    scenario.next_tx(OWNER);
    assert!(!scenario.has_most_recent_for_sender<Template>());
    scenario.end();
}

#[test]
fun test_template_without_fields() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Simple NDA", vector[string::utf8(b"Recipient")], vector[]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_NAME)]
fun test_name_required() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"", roles(), fields());
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_ROLES)]
fun test_roles_required() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", vector[], vector[]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_ROLES)]
fun test_empty_role_name_rejected() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", vector[string::utf8(b"Tenant"), string::utf8(b"")], vector[]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_FIELD)]
fun test_field_for_unknown_role_rejected() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), vector[template::new_field(2, 0, 0, 0, 10, 10)]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_INVALID_FIELD)]
fun test_field_without_area_rejected() {
    let mut scenario = test_scenario::begin(OWNER);
    create(&mut scenario, b"Lease", roles(), vector[template::new_field(0, 0, 0, 0, 0, 10)]);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = template::E_TOO_MANY_FIELDS)]
fun test_too_many_fields_rejected() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut many = vector[];
    let mut i = 0;
    while (i <= 100) {
        many.push_back(template::new_field(0, 0, 0, 0, 10, 10));
        i = i + 1;
    };
    create(&mut scenario, b"Lease", roles(), many);
    scenario.end();
}
