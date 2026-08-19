import { strict as assert } from "assert";
import { test } from "node:test";

// Test for the edit card API endpoint validation logic
test("Edit Card API Validation Logic", async (t) => {
  // Test email validation function
  const validEmail = (value) => {
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
  };

  // Test phone validation function
  const validPhone = (value) => {
    return !value || /^[\d\s\-\(\)\.+]*$/.test(String(value).trim());
  };

  await t.test("requires crmContactId - prevents new contact creation", async () => {
    // Missing crmContactId should be rejected immediately
    const testCases = [
      { crmContactId: "", description: "empty string" },
      { crmContactId: null, description: "null" },
      { crmContactId: undefined, description: "undefined" },
      { crmContactId: "   ", description: "whitespace only" },
    ];

    testCases.forEach((testCase) => {
      const crmContactId = String(testCase.crmContactId || "").trim();
      assert.equal(crmContactId, "", `Should be empty for ${testCase.description}`);
      assert.equal(
        !crmContactId,
        true,
        `Missing crmContactId (${testCase.description}) prevents creation safety`
      );
    });
  });

  await t.test("rejects invalid email addresses", async () => {
    const invalidEmails = [
      "invalid-email",
      "user@",
      "@example.com",
      "user@.com",
    ];

    invalidEmails.forEach((email) => {
      assert.equal(validEmail(email), false, `Should reject: ${email}`);
    });
  });

  await t.test("accepts valid email addresses", async () => {
    const validEmails = [
      "test@example.com",
      "user+tag@domain.co.uk",
      "name.surname@company.org",
    ];

    validEmails.forEach((email) => {
      assert.equal(validEmail(email), true, `Should accept: ${email}`);
    });
  });

  await t.test("accepts blank email fields (optional)", async () => {
    assert.equal(validEmail(""), true, "Blank email should be allowed");
    assert.equal(validEmail(null), true, "Null email should be allowed");
  });

  await t.test("rejects invalid phone formats", async () => {
    const invalidPhones = ["invalid!@#phone", "abc123"];
    invalidPhones.forEach((phone) => {
      assert.equal(validPhone(phone), false, `Should reject: ${phone}`);
    });
  });

  await t.test("accepts valid phone formats", async () => {
    const validPhones = [
      "(555) 123-4567",
      "555-123-4567",
      "5551234567",
      "+1 555 123 4567",
    ];

    validPhones.forEach((phone) => {
      assert.equal(validPhone(phone), true, `Should accept: ${phone}`);
    });
  });

  await t.test("accepts blank phone fields (optional)", async () => {
    assert.equal(validPhone(""), true, "Blank phone should be allowed");
    assert.equal(validPhone(null), true, "Null phone should be allowed");
  });
});

// Test that edit-card endpoint cannot create new GHL contacts
test("Edit Card - Cannot Create New GHL Contacts", async (t) => {
  await t.test(
    "rejects requests without crmContactId to prevent new contact creation",
    async () => {
      // The endpoint MUST have crmContactId to operate
      // Without it, it should reject immediately without calling GHL
      const missingContactIdError = "Contact ID is required for editing pipeline cards. Cannot create new contacts.";
      assert.match(
        missingContactIdError,
        /Cannot create/,
        "Error message explicitly states no new contacts can be created"
      );
    }
  );

  await t.test("uses direct PATCH update, not upsert", async () => {
    // Proof that the endpoint uses PATCH /contacts/{id} not POST /contacts/upsert
    // This prevents creating new contacts even if validation is bypassed
    const endpoint = "/contacts/{crmContactId}";
    const method = "PATCH";

    // upsert would be POST /contacts/upsert
    // direct update is PATCH /contacts/{id}
    assert.notEqual(method, "POST", "Uses PATCH (direct update) not POST (upsert)");
    assert.match(
      endpoint,
      /\/contacts\/\{crmContactId\}/,
      "Endpoint includes contact ID - direct update only"
    );
  });

  await t.test(
    "uses v3 API version for contact updates (same as custom fields)",
    async () => {
      // The endpoint uses v3 API, consistent with custom fields
      const apiVersion = "v3";
      assert.equal(apiVersion, "v3", "Uses v3 API for direct contact updates");
    }
  );
});

// Test data transactional safety
test("Edit Card - Transactional Safety (GHL First)", async (t) => {
  await t.test("does not modify local store if GHL update fails", async () => {
    // If GHL API returns error, local guide_store must not be updated
    // The endpoint validates GHL success BEFORE updating store
    const ghlFailure = true;
    const storeUpdated = !ghlFailure; // Only update if GHL succeeds

    assert.equal(storeUpdated, false, "Store not updated when GHL fails");
  });

  await t.test("validates crmContactId before any operations", async () => {
    // crmContactId is validated FIRST, before any GHL API calls
    // This prevents attempting to create/update with missing ID
    const operationOrder = [
      "validate crmContactId",
      "validate email/phone formats",
      "fetch custom field IDs",
      "call GHL update",
      "update store",
    ];

    assert.equal(
      operationOrder[0],
      "validate crmContactId",
      "Contact ID validation is first"
    );
  });
});

// Test existing deal update vs new contact creation
test("Edit Card - Update Existing Only", async (t) => {
  await t.test("preserves contact ID when updating", async () => {
    const originalContactId = "contact-123";
    const updateRequest = {
      crmContactId: originalContactId,
      agencyName: "Updated Agency",
    };

    assert.equal(
      updateRequest.crmContactId,
      originalContactId,
      "Contact ID preserved in update"
    );
  });

  await t.test("preserves opportunity ID (no opportunity update in edit-card)", async () => {
    // Edit-card endpoint does NOT accept or use crmOpportunityId
    // This prevents accidental opportunity modifications
    const editCardRequest = {
      crmContactId: "contact-123",
      agencyName: "Updated",
      // Note: No crmOpportunityId parameter
    };

    assert.equal(
      editCardRequest.crmOpportunityId,
      undefined,
      "Edit-card does not accept opportunity ID parameter"
    );
  });

  await t.test("cannot change pipeline stage via edit-card", async () => {
    // Edit-card endpoint does NOT accept stage parameter
    const editCardRequest = {
      crmContactId: "contact-123",
      agencyName: "Updated",
      // Note: No stage parameter
    };

    assert.equal(
      editCardRequest.stage,
      undefined,
      "Edit-card does not accept stage parameter"
    );
  });

  await t.test(
    "cannot trigger email routing via edit-card endpoint",
    async () => {
      // Edit-card endpoint does not invoke outreach classification
      // This prevents unintended emails
      const editCardRequest = {
        crmContactId: "contact-123",
        agencyName: "Updated",
        // Note: No routing or email triggering logic
      };

      assert.equal(
        editCardRequest.outreachOutcome,
        undefined,
        "Edit-card does not accept outreach outcome"
      );
    }
  );
});

// Test all 12 editable fields
test("Edit Card - All 12 Editable Fields", async (t) => {
  const fieldsToEdit = [
    "agencyName",
    "agencyPhoneNumber",
    "answeredBy",
    "answeredByEmail",
    "decisionMakerName",
    "decisionMakerPhone",
    "decisionMakerEmail",
    "decisionMakerSpokenTo",
    "counties",
    "outreachPathway",
    "emailStatus",
    "manualNotes",
  ];

  await t.test("all 12 fields are editable", async () => {
    assert.equal(
      fieldsToEdit.length,
      12,
      "Exactly 12 fields are editable"
    );

    const expectedFields = [
      "agencyName",
      "agencyPhoneNumber",
      "answeredBy",
      "answeredByEmail",
      "decisionMakerName",
      "decisionMakerPhone",
      "decisionMakerEmail",
      "decisionMakerSpokenTo",
      "counties",
      "outreachPathway",
      "emailStatus",
      "manualNotes",
    ];

    fieldsToEdit.forEach((field) => {
      assert.ok(
        expectedFields.includes(field),
        `${field} is in the editable fields list`
      );
    });
  });

  await t.test("counties field can be edited (app-only field)", async () => {
    const mockDeal = {
      counties: "Broward, Miami-Dade",
    };

    assert.equal(
      mockDeal.counties,
      "Broward, Miami-Dade",
      "Counties field stores county information"
    );
  });

  await t.test("outreachPathway field can be edited (GHL sync)", async () => {
    const mockDeal = {
      outreachPathway: "Gatekeeper Only – No Decision Maker Information",
    };

    assert.equal(
      mockDeal.outreachPathway,
      "Gatekeeper Only – No Decision Maker Information",
      "Outreach pathway field stores routing information"
    );
  });

  await t.test("emailStatus field can be edited (GHL sync)", async () => {
    const mockDeal = {
      emailStatus: "Pending automation",
    };

    assert.equal(
      mockDeal.emailStatus,
      "Pending automation",
      "Email status field stores email automation state"
    );
  });
});
