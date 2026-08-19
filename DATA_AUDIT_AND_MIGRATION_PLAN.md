# Production Data Audit & Migration Plan

**Status:** Pre-Migration Analysis  
**Database:** guide_store (SQLite, Cloudflare D1)  
**Current Deployment:** OpenAI Sites at `guide-partner-call-assistant.medbetterhealth.org`  
**CRM:** GoHighLevel (custom fields + contacts)

---

## 1. DATA STORAGE ARCHITECTURE

### guide_store Database (Key-Value Store)

The application stores all records in a single SQLite table:

```sql
CREATE TABLE guide_store (
  key TEXT PRIMARY KEY,
  value TEXT (JSON),
  updated_at TEXT
);
```

**Key Naming Convention:**
- Call records: `deals:{uuid}` → JSON object with all deal fields
- Logs: `calls` → JSON array of all call logs
- Partners: `partners` → JSON object
- Other: Various configuration/state keys

---

## 2. FIELD INVENTORY & SYNC STATUS

### All Deal Fields (19 total)

| Field | Type | App-Only? | GHL Synced? | Notes |
|-------|------|-----------|------------|-------|
| `agencyName` | string | ❌ No | ✅ Yes | synced as `companyName` |
| `agencyPhoneNumber` | string | ❌ No | ✅ Yes | "Agency Phone Number" custom field |
| `answeredBy` | string | ❌ No | ✅ Yes | "Answered By" custom field (gatekeeper) |
| `answeredByEmail` | string | ❌ No | ✅ Yes | "Partner - Answered By Email" custom field |
| `decisionMakerName` | string | ❌ No | ✅ Yes | "Decision Maker Name" custom field |
| `decisionMakerPhone` | string | ❌ No | ✅ Yes | "Decision Maker Phone" custom field |
| `decisionMakerEmail` | string | ❌ No | ✅ Yes | "Decision Maker Email" custom field / primary contact |
| `decisionMakerSpokenTo` | Yes/No | ❌ No | ✅ Yes | "Partner - Decision Maker Spoken To" custom field |
| `counties` | string | ✅ **YES** | ❌ No | **APP-ONLY** — not synced to GHL |
| `outreachPathway` | string | ❌ No | ✅ Yes | "Partner - Outreach Pathway" custom field |
| `emailStatus` | string | ❌ No | ✅ Yes | "Partner - Email Status" custom field |
| `manualNotes` | string | ❌ No | ✅ Yes | "Partner - Call Notes" custom field |
| `stage` | string | ❌ No | ⚠️ Yes* | Pipeline stage (synced via /api/move-stage) |
| `crmContactId` | string | ❌ No | 🔑 Key | GoHighLevel contact ID (primary key) |
| `crmOpportunityId` | string | ❌ No | 🔑 Key | GoHighLevel opportunity ID |
| `createdAt` | ISO timestamp | ✅ **YES** | ❌ No | **APP-ONLY** |
| `updatedAt` | ISO timestamp | ✅ **YES** | ❌ No | **APP-ONLY** |
| `history` | array[{ts, stage, note}] | ✅ **YES** | ❌ No | **APP-ONLY** — critical audit trail |
| `assignedSalesperson` | string | ✅ **YES** | ❌ No | **APP-ONLY** — manual tracking |

### App-Only Fields (5 fields)
These exist ONLY in guide_store and NOT in GoHighLevel:
- ✅ `counties` — County list for the agency
- ✅ `createdAt` — When record was created
- ✅ `updatedAt` — Last update timestamp
- ✅ `history` — Complete audit trail of stage changes
- ✅ `assignedSalesperson` — Who is working on the deal

### Reconstruction Risk Assessment

| Field | Can Reconstruct from GHL? | Risk Level |
|-------|--------------------------|-----------|
| `counties` | ❌ No way to recover | 🔴 **CRITICAL** |
| `history` | Partial (can see notes in activity log) | 🟠 **HIGH** |
| `assignedSalesperson` | ❌ Not stored in GHL | 🟠 **HIGH** |
| `createdAt` / `updatedAt` | ⚠️ Possible from GHL timestamps | 🟡 **MEDIUM** |
| All other fields | ✅ Yes (from GHL contact custom fields) | 🟢 **LOW** |

---

## 3. DATA VOLUME ESTIMATE

**I cannot access the live production database.**

**To complete the audit, I need you to:**

### Action Required from You:

Run this command in the browser console on the live site to export the data count:

```javascript
// Count records
const response = await fetch('/api/store?prefix=deals:');
const result = await response.json();
console.log('Total deal records:', result.keys.length);
```

Or provide:
- Total number of active deal records
- Number of completed/closed deals
- Date range of oldest records
- Any data that's been manually edited recently

---

## 4. DATA EXPORT STRATEGY

### Pre-Migration Export (REQUIRED)

Before moving hosting, we must export all guide_store data:

```bash
# Export all deals to JSON
GET /api/store?prefix=deals: 
  → List of all deal keys
  
For each key, GET /api/store?key={key}
  → Export the complete JSON value
```

**Export Steps:**
1. Query all `deals:*` keys from guide_store
2. For each key, fetch the complete JSON value
3. Save to a migration bundle (JSON array)
4. **BACKUP:** Keep original in case of issues

**Export Format:**
```json
[
  {
    "key": "deals:uuid1",
    "value": {
      "agencyName": "...",
      "crmContactId": "ghl-id",
      ...
    },
    "exported_at": "2026-08-19T..."
  },
  ...
]
```

---

## 5. MIGRATION PLAN: D1 (SQLite) → PostgreSQL

### Phase 1: Export & Backup (30 minutes)
- [ ] Export all guide_store records to JSON
- [ ] Verify all `crmContactId` values are present
- [ ] Backup JSON to secure location
- [ ] Count records and verify count with GHL

### Phase 2: Create Target Database (PostgreSQL on new platform)
- [ ] Create PostgreSQL instance
- [ ] Create same table structure
- [ ] Verify connection and write access
- [ ] Test with sample record

### Phase 3: Migrate Data (1-2 minutes)
- [ ] Import JSON records to new PostgreSQL database
- [ ] Verify all records present
- [ ] Verify all critical fields (crmContactId, history, counties)
- [ ] Run count validation: old count = new count ✓

### Phase 4: Validate Against GHL (15 minutes)
- [ ] For each deal with crmContactId, query GHL API
- [ ] Verify all synced fields match (or are newer in guide_store)
- [ ] Check counties field (should not be in GHL, verify it's present)
- [ ] Verify no records missing

### Phase 5: Switch Deployment (5 minutes)
- [ ] Update DNS to new deployment
- [ ] Test live application
- [ ] Verify all records load
- [ ] Run smoke tests

### Phase 6: Keep Old Deployment Running (2 weeks)
- [ ] Keep OpenAI Sites online for rollback
- [ ] Monitor for any issues
- [ ] After stability confirmed, decommission old deployment

---

## 6. DATA LOSS PREVENTION CHECKLIST

### Critical Fields to Preserve
- [ ] **crmContactId** — Must be present on ALL records (primary key for GHL sync)
- [ ] **counties** — APP-ONLY field, will be LOST if not migrated
- [ ] **history** — Complete audit trail, should be preserved
- [ ] **assignedSalesperson** — May be important for internal tracking

### Validation Queries

**Before Migration:**
```javascript
// Verify all deals have crmContactId
const response = await fetch('/api/store?prefix=deals:');
const keys = (await response.json()).keys;
for (const key of keys) {
  const deal = await fetch(`/api/store?key=${key}`).then(r => r.json());
  if (!deal.value) continue;
  const parsed = JSON.parse(deal.value);
  if (!parsed.crmContactId) {
    console.warn(`⚠️ Missing crmContactId on ${key}`);
  }
}
```

**After Migration:**
```sql
-- Verify counts match
SELECT COUNT(*) FROM guide_store WHERE key LIKE 'deals:%';
-- Should match original count from D1
```

---

## 7. ROLLBACK PLAN

If anything goes wrong during migration:

1. **During Testing:** Revert DNS back to OpenAI Sites (5 minutes)
2. **Data Corruption:** Restore from JSON backup and re-import
3. **GHL Sync Issues:** Use `/api/update-card` to resync individual records
4. **Complete Failure:** Keep old deployment running, diagnose issue, try again

---

## 8. WHAT HAPPENS TO EACH DATA TYPE

### Scenario: Moving from OpenAI Sites → New Hosting

| Data | Current Location | After Migration | Action Required |
|------|------------------|-----------------|-----------------|
| **Deal Records** | guide_store (D1) | PostgreSQL | Export & Import |
| **Counties Field** | guide_store only | PostgreSQL | ⚠️ **MUST EXPORT** |
| **History Audit Trail** | guide_store only | PostgreSQL | ⚠️ **MUST EXPORT** |
| **GHL Custom Fields** | GoHighLevel | GoHighLevel (unchanged) | None — stays in GHL |
| **Contacts** | GoHighLevel | GoHighLevel (unchanged) | None — stays in GHL |
| **Pipeline Stages** | GoHighLevel | GoHighLevel (unchanged) | None — stays in GHL |

---

## 9. ESTIMATED TIMELINE

| Phase | Time | Blocker? |
|-------|------|----------|
| Export & Backup | 30 min | No |
| Set up new platform | Variable | No |
| Migrate data | 2 min | No |
| Validate & test | 30 min | No |
| **Total** | **~1-2 hours** | 🟢 Low Risk |

---

## 10. CRITICAL SUCCESS FACTORS

✅ **MUST DO:**
1. Export all guide_store data BEFORE touching DNS
2. Verify `crmContactId` exists on all deal records
3. Preserve `counties` field (it's app-only and precious)
4. Preserve `history` field (audit trail)
5. Validate counts match before/after
6. Keep old deployment running for 2 weeks as fallback

❌ **MUST NOT DO:**
1. Move DNS before new deployment is fully tested
2. Delete guide_store records until new system confirmed working
3. Trust that all data exists in GHL (counties doesn't)
4. Migrate without complete backup

---

## 11. NEXT STEPS

**Before I proceed with any hosting migration:**

1. **You provide:** Count of active deal records in production
2. **I will run:** Complete data audit & export script
3. **You verify:** The exported JSON looks correct
4. **Then we plan:** Specific migration steps for your platform

**Do NOT deploy to new hosting until:**
- [ ] All data is backed up
- [ ] Export verified complete
- [ ] Validation tests pass
- [ ] You've approved the backup

---

## SUMMARY

**Current State:**
- 19 deal fields stored
- 5 fields are app-only (counties, history, timestamps, etc.)
- All other fields synced to GoHighLevel
- **Data locked in D1 SQLite (Cloudflare)**

**Risk Level:** 🟠 **MEDIUM**
- **High Risk:** App-only fields (counties, history) will be lost if not migrated
- **Medium Risk:** Timestamps and metadata may be lost
- **Low Risk:** Contact/deal information (can be reconstructed from GHL)

**Migration Complexity:** 🟢 **LOW**
- Simple JSON export/import
- No complex transformation needed
- Validation is straightforward

---

**Status:** Awaiting your production data count to complete the audit.

Once provided, I will create a detailed, step-by-step migration script.
