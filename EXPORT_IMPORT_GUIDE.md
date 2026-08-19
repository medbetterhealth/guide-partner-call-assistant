# Export/Import Guide - Production Data Backup & Migration

**Purpose:** Safely export all 12 production deal records and restore them to a new hosting environment without data loss.

**Status:** ✅ Ready to use  
**Test Coverage:** 8 comprehensive tests (all passing)  
**API Endpoints:** `/api/export-deals` and `/api/import-deals`

---

## Quick Start

### Export Your Production Data (Right Now!)

```bash
# Call the export endpoint
curl https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals > deals-backup.json

# This downloads a JSON file with all 12 deal records
```

Or use the browser:

```javascript
// Open browser console on the live site and run:
fetch('/api/export-deals')
  .then(r => r.json())
  .then(data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deals-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  });
```

**Result:** A JSON file with all 12 deal records, dated and ready for backup.

---

## What Gets Exported

### All 12 Deal Records
Each deal includes ALL fields:

```json
{
  "export_version": "1.0",
  "exported_at": "2026-08-19T12:00:00Z",
  "total_records": 12,
  "records": [
    {
      "key": "deals:uuid-1",
      "value": {
        "agencyName": "Example Agency",
        "crmContactId": "ghl-contact-id",
        "crmOpportunityId": "ghl-opp-id",
        "counties": "Broward, Miami-Dade",
        "createdAt": "2026-08-01T10:00:00Z",
        "updatedAt": "2026-08-10T15:30:00Z",
        "history": [
          {"ts": "2026-08-01T10:00:00Z", "stage": "new_lead", "note": "Lead created"},
          {"ts": "2026-08-05T14:30:00Z", "stage": "outreach_outcomes_2a", "note": "Moved to 2.a"}
        ],
        "assignedSalesperson": "Dr. Erik",
        "stage": "outreach_outcomes_2a",
        "agencyPhoneNumber": "(954) 555-1234",
        "answeredBy": "John Doe",
        "answeredByEmail": "john@example.com",
        "decisionMakerName": "Jane Smith",
        "decisionMakerPhone": "(954) 555-5678",
        "decisionMakerEmail": "jane@example.com",
        "decisionMakerSpokenTo": "Yes",
        "outreachPathway": "Gatekeeper Only – No Decision Maker Information",
        "emailStatus": "Pending automation",
        "manualNotes": "Discussed services with gatekeeper"
      },
      "exported_at": "2026-08-19T12:00:00Z",
      "updated_at": "2026-08-10T15:30:00Z"
    }
    // ... 11 more deal records
  ],
  "metadata": {
    "source": "GUIDE Partner Call Assistant v27",
    "environment": "production",
    "database_type": "D1-SQLite",
    "preserves": [
      "crmContactId",
      "crmOpportunityId",
      "counties",
      "history",
      "createdAt",
      "updatedAt",
      "assignedSalesperson",
      "all_other_fields"
    ]
  }
}
```

### What's Preserved

✅ **All 12 deal records** (even if some are inactive)  
✅ **Every field** including app-only data:
  - `counties` (not in GoHighLevel)
  - `history` audit trail (not in GoHighLevel)
  - `createdAt` / `updatedAt` timestamps (not in GoHighLevel)
  - `assignedSalesperson` (not in GoHighLevel)
  - All GHL sync fields

✅ **Complete history** for each record with timestamps and notes  
✅ **CRM IDs** to prevent duplicate GoHighLevel contacts  
✅ **Original timestamps** when records were created and updated

---

## API Endpoint: `/api/export-deals`

### Request

```
GET /api/export-deals
```

No parameters required. Exports all `deals:*` records from guide_store.

### Response

**Status:** 200 OK  
**Content-Type:** application/json  
**Content-Disposition:** attachment (browser downloads the file)

**Success Response:**
```json
{
  "export_version": "1.0",
  "exported_at": "ISO timestamp",
  "total_records": 12,
  "records": [...],
  "metadata": {...}
}
```

**Error Response:**
```json
{
  "error": "Export failed"
}
```

### Testing Export

```bash
# Check export works
curl -s https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals | jq '.total_records'
# Output: 12

# Count records
curl -s https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals | jq '.records | length'
# Output: 12

# Check a specific field is preserved
curl -s https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals | jq '.records[0].value.counties'
# Output: "Broward, Miami-Dade"

# Check history is preserved
curl -s https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals | jq '.records[0].value.history'
# Output: [{"ts":"...","stage":"...","note":"..."}]
```

---

## API Endpoint: `/api/import-deals`

### Request

```
POST /api/import-deals
Content-Type: application/json

{
  "records": [
    {
      "key": "deals:uuid-1",
      "value": { ... complete deal object ... }
    }
    // ... more records
  ],
  "dry_run": false  // Optional: set to true for validation only
}
```

### Response

**Success (200 OK):**
```json
{
  "total_records": 12,
  "successful": 12,
  "skipped": 0,
  "imported_keys": ["deals:uuid-1", "deals:uuid-2", ...],
  "dry_run": false,
  "summary": "Successfully imported 12 records, skipped 0",
  "next_step": "Import complete. Records are now in guide_store",
  "warnings": [
    "This import does NOT create new GHL contacts (uses existing crmContactId only)",
    "This import does NOT trigger email automations",
    "History field is fully preserved",
    "Timestamps and app-only fields are preserved"
  ]
}
```

**Error (400/500):**
```json
{
  "error": "records array is required",
  "import_status": "failed"
}
```

### Safety Features

✅ **Requires crmContactId** — Does NOT create new GoHighLevel contacts  
✅ **No email triggers** — Does NOT trigger GHL email automations  
✅ **Dry-run mode** — Validate before actually importing  
✅ **Field validation** — Checks for required fields (key, value, identifier)  
✅ **History preserved** — Audit trail stays intact  
✅ **Timestamps preserved** — createdAt/updatedAt stay accurate

---

## Migration Workflow: Export → Backup → Import

### Step 1: Export Current Data (5 minutes)

```bash
# On live production site
curl https://guide-partner-call-assistant.medbetterhealth.org/api/export-deals > \
  deals-backup-$(date +%Y-%m-%d).json

# Verify the export
cat deals-backup-2026-08-19.json | jq '.total_records'
# Should output: 12
```

### Step 2: Verify Backup Completeness (5 minutes)

```bash
# Check all critical fields are present
jq '.records[] | select(.value.crmContactId == null)' deals-backup-2026-08-19.json
# Should output: nothing (all records have crmContactId)

# Count counties field (app-only)
jq '[.records[] | select(.value.counties != null)] | length' deals-backup-2026-08-19.json
# Should be > 0

# Check history exists
jq '[.records[] | select(.value.history != null)] | length' deals-backup-2026-08-19.json
# Should be > 0
```

### Step 3: Backup to Safe Location (1 minute)

```bash
# Store in multiple places:
cp deals-backup-2026-08-19.json ~/Documents/guide-deals-backup.json
cp deals-backup-2026-08-19.json ~/Dropbox/guide-partner-backups/deals-2026-08-19.json
# Email to yourself or upload to secure storage
```

### Step 4: Set Up New Hosting (Variable)

- Create PostgreSQL database
- Deploy new Version 27 application
- Verify `/api/import-deals` endpoint is available

### Step 5: Import with Dry-Run (5 minutes)

```bash
# First, validate import without making changes
curl -X POST https://new-deployment.example.com/api/import-deals \
  -H "Content-Type: application/json" \
  -d @deals-backup-2026-08-19.json \
  -d '{"dry_run": true}'

# Response should show: "DRY RUN: Would import 12 records"
```

### Step 6: Perform Real Import (2 minutes)

```bash
# Now actually import the data
curl -X POST https://new-deployment.example.com/api/import-deals \
  -H "Content-Type: application/json" \
  -d '{"records": '"$(cat deals-backup-2026-08-19.json | jq '.records')"'}'

# Response should show: "Successfully imported 12 records, skipped 0"
```

### Step 7: Verify Imported Data (5 minutes)

```bash
# On new deployment, check records loaded
curl https://new-deployment.example.com/api/store?prefix=deals: | jq '.keys | length'
# Should output: 12

# Check specific field
curl https://new-deployment.example.com/api/store?key=deals:uuid-1 | \
  jq '.value | fromjson | .counties'
# Should output the counties value (not null)

# Check history
curl https://new-deployment.example.com/api/store?key=deals:uuid-1 | \
  jq '.value | fromjson | .history | length'
# Should be > 0
```

### Step 8: Switch DNS (5 minutes)

Once all verification passes:

```
Update MedBetterHealth DNS CNAME to point new deployment
guide-partner-call-assistant.medbetterhealth.org → new-deployment.example.com

Wait 5 minutes for propagation
Verify live site works
```

---

## Validation Checklist

Before importing to new hosting, verify the backup:

- [ ] **Export file valid JSON** — `jq '.' deals-backup.json` runs without error
- [ ] **12 records present** — `.total_records` equals 12
- [ ] **All records have crmContactId** — No null values for GHL IDs
- [ ] **Counties field preserved** — At least some records have counties value
- [ ] **History preserved** — Records have non-empty history arrays
- [ ] **Timestamps intact** — createdAt and updatedAt present
- [ ] **Backup file date** — Filename includes today's date
- [ ] **Backup stored** — Multiple copies in safe locations

---

## Safety Guarantees

### What Does NOT Happen on Import

❌ **NO new GoHighLevel contacts created** — Uses existing crmContactId only  
❌ **NO email automations triggered** — GHL workflows do NOT run  
❌ **NO pipeline stages changed in GHL** — Stage values stay local  
❌ **NO duplicate records** — If record exists, it updates (does not create new)  
❌ **NO field data lost** — All 19 fields fully preserved

### What DOES Happen on Import

✅ All deal records restored to guide_store  
✅ All app-only fields (counties, history, timestamps) restored  
✅ All relationships preserved (crmContactId, crmOpportunityId)  
✅ Complete history audit trail restored  
✅ Existing GHL contact references maintained  

---

## Testing Export/Import

### Automated Tests

All export/import functionality has 8 comprehensive tests:

```bash
npm test -- tests/export-import.test.mjs

# Output:
# ✔ export endpoint returns valid JSON structure
# ✔ export preserves all critical app-only fields
# ✔ import endpoint validates required fields
# ✔ import does NOT create new GHL contacts
# ✔ import does NOT trigger email automations
# ✔ import fully preserves history audit trail
# ✔ import supports dry-run mode for validation
# ✔ export/import handles all 12 production records
```

All tests must pass before migration.

---

## Troubleshooting

### Export Returns Empty

**Problem:** `/api/export-deals` returns `"total_records": 0`

**Solution:**
1. Verify live site is still running
2. Check database table exists: `SELECT COUNT(*) FROM guide_store WHERE key LIKE 'deals:%'`
3. Ensure API key/auth is correct

### Import Fails with Validation Error

**Problem:** Import rejects records as invalid

**Solutions:**
- Verify export file has correct structure (run `jq` on it)
- Check that each record has both `key` and `value`
- Ensure `value.crmContactId` or `value.agencyName` exists
- Check JSON file is not corrupted

### Some Records Skipped on Import

**Problem:** Import says "Successfully imported 11 records, skipped 1"

**Solution:**
- Check `errors` array in response for specific failures
- Validate the skipped record's `key` and `value` structure
- Re-run import - duplicate records should update, not fail

### History Lost After Import

**Problem:** History field is empty on imported records

**Solution:**
- Verify backup file contains history: `jq '.records[0].value.history' deals-backup.json`
- Check that import completed successfully
- If history is truly missing from backup, it means it wasn't in original production data

---

## Timeline Summary

| Task | Time | When |
|------|------|------|
| Export production data | 5 min | NOW (before any migration) |
| Verify backup complete | 5 min | Immediately after |
| Store backup copies | 1 min | Same day |
| Set up new hosting | Variable | When ready |
| Dry-run import | 5 min | Before real import |
| Real import | 2 min | After dry-run passes |
| Verify data | 5 min | After import |
| Switch DNS | 5 min | Final step |
| **TOTAL** | **~28 min** | **Spread over time** |

---

## Next Steps

**IMMEDIATE (Do This Now):**

1. Run export on live site
2. Download the JSON backup
3. Store in at least 2 safe locations
4. Verify backup file contains all 12 records

**BEFORE MIGRATION:**

5. Share backup file with team
6. Don't modify live site during migration prep
7. Keep old hosting running until new one is verified

**DURING MIGRATION:**

8. Follow "Migration Workflow" section above
9. Run dry-run import first
10. Verify all data loads on new system
11. Test that all records appear in UI
12. Check that GHL sync still works

**AFTER SUCCESSFUL MIGRATION:**

13. Keep old hosting as fallback for 2 weeks
14. Monitor new system for issues
15. After stable, decommission old hosting

---

## Questions?

The export/import mechanism is designed to be bulletproof. If you encounter issues:

1. Check this guide's troubleshooting section
2. Verify backup file is valid JSON
3. Run dry-run import to see what would happen
4. Check error messages in import response
5. Ensure new hosting has same database schema

All 12 deal records can be safely exported and restored.
