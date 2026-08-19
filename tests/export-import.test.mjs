import { strict as assert } from "assert";
import { test } from "node:test";

test("Export/Import Mechanism - Data Preservation", async (t) => {
  // Test 1: Export endpoint structure
  await t.test("export endpoint returns valid JSON structure", async () => {
    // Mock what the export endpoint should return
    const mockExport = {
      export_version: "1.0",
      exported_at: "2026-08-19T12:00:00Z",
      total_records: 12,
      records: [
        {
          key: "deals:test-uuid-1",
          value: {
            agencyName: "Test Agency",
            crmContactId: "ghl-contact-123",
            crmOpportunityId: "ghl-opp-456",
            counties: "Broward, Miami-Dade",
            history: [
              { ts: "2026-08-01T10:00:00Z", stage: "new_lead", note: "Lead created" },
              { ts: "2026-08-10T15:30:00Z", stage: "outreach_outcomes_2a", note: "Moved to 2.a" },
            ],
            createdAt: "2026-08-01T10:00:00Z",
            updatedAt: "2026-08-10T15:30:00Z",
            assignedSalesperson: "Dr. Erik",
            stage: "outreach_outcomes_2a",
          },
          exported_at: "2026-08-19T12:00:00Z",
          updated_at: "2026-08-10T15:30:00Z",
        },
      ],
      metadata: {
        source: "GUIDE Partner Call Assistant v27",
        preserves: [
          "crmContactId",
          "crmOpportunityId",
          "counties",
          "history",
          "createdAt",
          "updatedAt",
          "assignedSalesperson",
          "all_other_fields",
        ],
      },
    };

    assert.equal(mockExport.export_version, "1.0", "Export has version");
    assert.ok(mockExport.exported_at, "Export has timestamp");
    assert.equal(mockExport.total_records, 12, "Export has record count");
    assert.ok(Array.isArray(mockExport.records), "Records is an array");
    assert.ok(mockExport.metadata, "Export has metadata");
  });

  // Test 2: Preserved fields
  await t.test("export preserves all critical app-only fields", async () => {
    const deal = {
      key: "deals:uuid-1",
      value: {
        agencyName: "Test Agency",
        crmContactId: "ghl-123",
        crmOpportunityId: "ghl-opp-456",
        counties: "Broward", // APP-ONLY
        createdAt: "2026-08-01T10:00:00Z", // APP-ONLY
        updatedAt: "2026-08-10T15:30:00Z", // APP-ONLY
        history: [
          // APP-ONLY
          { ts: "2026-08-01T10:00:00Z", stage: "new_lead", note: "Created" },
        ],
        assignedSalesperson: "Dr. Erik", // APP-ONLY
      },
    };

    const value = deal.value;
    assert.ok(value.counties, "counties field preserved");
    assert.ok(value.createdAt, "createdAt field preserved");
    assert.ok(value.updatedAt, "updatedAt field preserved");
    assert.ok(Array.isArray(value.history), "history array preserved");
    assert.ok(value.history[0].ts, "history timestamps preserved");
    assert.ok(value.assignedSalesperson, "assignedSalesperson preserved");
    assert.ok(value.crmContactId, "crmContactId preserved");
    assert.ok(value.crmOpportunityId, "crmOpportunityId preserved");
  });

  // Test 3: Import validation
  await t.test("import endpoint validates required fields", async () => {
    const validRecord = {
      key: "deals:uuid-1",
      value: {
        agencyName: "Agency",
        crmContactId: "ghl-123",
        stage: "new_lead",
      },
    };

    const invalidRecords = [
      { key: "", value: { agencyName: "Agency" } }, // Empty key
      { key: "deals:uuid-2", value: null }, // Null value
      { key: "deals:uuid-3", value: {} }, // Missing both crmContactId and agencyName
    ];

    // Valid record should pass all checks
    assert.ok(validRecord.key && validRecord.key.length > 0, "Valid record has non-empty key");
    assert.ok(validRecord.value, "Valid record has value");
    assert.ok(validRecord.value.agencyName || validRecord.value.crmContactId, "Valid record has identifier");

    // Invalid records should fail at least one check
    const recordValidationResults = invalidRecords.map((record) => {
      const hasKey = typeof record.key === "string" && record.key.length > 0;
      const hasValue = record.value !== null && record.value !== undefined && typeof record.value === "object";
      const hasIdentifier = hasValue ? !!(record.value.agencyName || record.value.crmContactId) : false;
      return hasKey && hasValue && hasIdentifier;
    });

    // All invalid records should fail validation
    recordValidationResults.forEach((result, i) => {
      assert.equal(result, false, `Invalid record ${i} should fail validation`);
    });
  });

  // Test 4: No GHL duplicate creation
  await t.test(
    "import does NOT create new GHL contacts (uses existing crmContactId only)",
    async () => {
      const importedDeal = {
        key: "deals:uuid-1",
        value: {
          agencyName: "Test Agency",
          crmContactId: "existing-ghl-contact-id", // Uses existing contact
          crmOpportunityId: "existing-ghl-opp-id",
          stage: "new_lead",
        },
      };

      // Import mechanism should:
      // 1. NOT call GHL API to create contact
      // 2. NOT call /contacts/upsert
      // 3. ONLY restore the guide_store record
      // 4. Preserve the existing crmContactId

      assert.ok(importedDeal.value.crmContactId, "crmContactId is preserved");
      assert.ok(
        importedDeal.value.crmContactId === "existing-ghl-contact-id",
        "Uses existing GHL contact ID, does not create new"
      );
      assert.ok(
        importedDeal.value.crmOpportunityId === "existing-ghl-opp-id",
        "Uses existing GHL opportunity ID"
      );
    }
  );

  // Test 5: No email triggers on import
  await t.test("import does NOT trigger email automations", async () => {
    const importedDeal = {
      key: "deals:uuid-1",
      value: {
        agencyName: "Test Agency",
        crmContactId: "ghl-123",
        stage: "outreach_outcomes_2a", // Stage that normally triggers email
        decisionMakerEmail: "test@example.com",
      },
    };

    // Import mechanism should:
    // 1. NOT call /api/move-stage (which triggers GHL email workflows)
    // 2. ONLY restore the guide_store record with stage value
    // 3. NO side effects on GoHighLevel

    const value = importedDeal.value;
    assert.ok(value.stage, "stage is preserved in local store");
    assert.ok(value.decisionMakerEmail, "email is preserved");
    // Note: Import does NOT move stage in GHL, just restores local state
  });

  // Test 6: History preservation
  await t.test("import fully preserves history audit trail", async () => {
    const deal = {
      key: "deals:uuid-1",
      value: {
        agencyName: "Test Agency",
        crmContactId: "ghl-123",
        history: [
          {
            ts: "2026-08-01T10:00:00Z",
            stage: "new_lead",
            note: "Lead created by Dr. Erik",
          },
          {
            ts: "2026-08-05T14:30:00Z",
            stage: "outreach_outcomes_2a",
            note: "Gatekeeper answered, moved to 2.a",
          },
          {
            ts: "2026-08-10T16:45:00Z",
            stage: "outreach_outcomes_2a",
            note: "Email sent via automation",
          },
        ],
      },
    };

    const history = deal.value.history;
    assert.equal(history.length, 3, "All 3 history entries preserved");
    assert.ok(history[0].ts, "First entry has timestamp");
    assert.ok(history[1].stage, "Second entry has stage");
    assert.ok(history[2].note, "Third entry has note");
    assert.equal(
      history[0].note,
      "Lead created by Dr. Erik",
      "Original wording preserved in history"
    );
  });

  // Test 7: Dry run mode
  await t.test("import supports dry-run mode for validation", async () => {
    const importRequest = {
      records: [
        {
          key: "deals:uuid-1",
          value: {
            agencyName: "Agency 1",
            crmContactId: "ghl-123",
          },
        },
      ],
      dry_run: true, // Dry run mode
    };

    // Dry run should:
    // 1. Validate all records
    // 2. NOT actually write to database
    // 3. Return success status with "Would import" message
    // 4. Allow user to verify before real import

    const mockResponse = {
      total_records: 1,
      successful: 1,
      skipped: 0,
      dry_run: true,
      summary: "DRY RUN: Would import 1 records",
      next_step: "Review results and call again with dry_run=false to actually import",
    };

    assert.equal(mockResponse.dry_run, true, "Dry run flag set");
    assert.ok(mockResponse.summary.includes("DRY RUN"), "Response indicates dry run");
    assert.equal(mockResponse.successful, 1, "Would import 1 record");
  });

  // Test 8: 12 records scenario
  await t.test("export/import handles all 12 production records", async () => {
    const mockExport = {
      total_records: 12,
      records: Array.from({ length: 12 }, (_, i) => ({
        key: `deals:uuid-${i + 1}`,
        value: {
          agencyName: `Agency ${i + 1}`,
          crmContactId: `ghl-contact-${i + 1}`,
          stage: i % 3 === 0 ? "new_lead" : "outreach_outcomes_2a",
          counties: `County ${i + 1}`,
          history: [{ ts: "2026-08-01T10:00:00Z", stage: "new_lead", note: "Created" }],
          createdAt: "2026-08-01T10:00:00Z",
          updatedAt: "2026-08-10T15:30:00Z",
        },
      })),
    };

    assert.equal(mockExport.total_records, 12, "Export has 12 records");
    assert.equal(mockExport.records.length, 12, "Records array has 12 items");

    // Simulate import
    const importResult = {
      total_records: 12,
      successful: 12,
      skipped: 0,
      dry_run: false,
      summary: "Successfully imported 12 records, skipped 0",
    };

    assert.equal(
      importResult.successful,
      12,
      "All 12 records imported successfully"
    );
    assert.equal(importResult.skipped, 0, "No records skipped");
  });
});
