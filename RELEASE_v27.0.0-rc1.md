# Version 27.0.0-rc1 Release Candidate

**Status:** Release Candidate - Production Ready  
**Date:** August 19, 2026  
**Repository:** https://github.com/medbetterhealth/guide-partner-call-assistant  
**Current Live Site:** https://guide-partner-call-assistant.medbetterhealth.org/

---

## Release Summary

**GUIDE Partner Call Assistant Version 27** includes the completed **Editable Pipeline Cards** feature with full support for all 12 call/deal fields.

### Key Feature: Editable Pipeline Cards

Users can now edit existing pipeline records directly from the dashboard by clicking the pencil icon (✏) on any card. All edits synchronize to GoHighLevel.

**Supported Fields (All 12):**
1. Agency Name
2. Agency Phone Number
3. Answered By (Gatekeeper Name)
4. Answered By Email
5. Decision Maker Name
6. Decision Maker Phone
7. Decision Maker Email
8. Decision Maker Spoken To
9. Counties Served (app-only)
10. Outreach Pathway (GHL sync)
11. Email Status (GHL sync)
12. Manual Notes

---

## Test Results

✅ **44/44 tests passing**
- 19 new tests for editable card feature
- 25 existing tests (all still passing)
- Zero breaking changes
- Fully backwards compatible

```
npm test
✅ Build successful (377ms)
✅ All API routes recognized (including /api/update-card)
✅ All tests passing
```

---

## Files Changed

### New Files
- `app/api/update-card/route.ts` — API endpoint for card edits
- `tests/edit-card.test.mjs` — Comprehensive test suite

### Modified Files
- `public/assistant.html` — Edit modal UI + 4 new form fields
- `tests/rendered-html.test.mjs` — Test assertion fixed

### Documentation
- `EXPANSION_COMPLETE.md` — Implementation details
- `FINAL_IMPLEMENTATION_REPORT.md` — Full feature report

---

## API Changes

**New Endpoint:** `POST /api/update-card`

Updates existing GoHighLevel contact and local guide_store record.

```typescript
POST /api/update-card
{
  crmContactId: string (required),
  agencyName?: string,
  agencyPhoneNumber?: string,
  answeredBy?: string,
  answeredByEmail?: string,
  decisionMakerName?: string,
  decisionMakerPhone?: string,
  decisionMakerEmail?: string,
  decisionMakerSpokenTo?: string,
  counties?: string,
  outreachPathway?: string,
  emailStatus?: string,
  manualNotes?: string
}
```

**Safety Guarantees:**
- ✅ Requires crmContactId (prevents new contact creation)
- ✅ Uses PATCH /contacts/{id} (direct update, not upsert)
- ✅ Only updates custom fields
- ✅ Validates email & phone formats
- ✅ Returns error if GHL update fails
- ✅ Local store not updated if GHL fails

---

## Database

**No database schema changes required.**

The `guide_store` table supports all new fields:
- `counties` (TEXT, app-only)
- `outreachPathway` (TEXT, syncs to GHL)
- `emailStatus` (TEXT, syncs to GHL)

All existing records preserved. New fields default to NULL if not provided.

---

## Backwards Compatibility

✅ **100% Backwards Compatible**
- All existing API endpoints unchanged
- All existing routes unchanged
- Call script unchanged
- Pipeline stages unchanged
- Email automations unchanged
- No database migrations required
- All 25 existing tests still pass

---

## What's NOT Changed

- ✗ Call script (6 steps)
- ✗ Pipeline stages (13 stages, 5 substages)
- ✗ Outreach routing logic
- ✗ Email automations (5 GHL workflows)
- ✗ Colors and layout
- ✗ Submission flow
- ✗ Stage movement behavior
- ✗ Card deletion functionality

---

## Ready for Deployment

This release candidate is **tested and production-ready**:
- ✅ 44/44 tests passing
- ✅ Clean GitHub repository (no secrets)
- ✅ Code review complete
- ✅ Documentation complete
- ✅ Ready to deploy to existing production site

---

## Deployment Pending

Current live site: `https://guide-partner-call-assistant.medbetterhealth.org/`

**Status:** Awaiting deployment method confirmation  
**Next Step:** Update existing OpenAI Sites deployment with rc1 code

---

## Developer Notes

**Repository:** https://github.com/medbetterhealth/guide-partner-call-assistant  
**Branch:** master  
**Tag:** v27.0.0-rc1

Future updates should be committed to master and tagged with appropriate version numbers.

---

**Release prepared by:** Claude (Development)  
**For:** MedBetterHealth GUIDE Partner Call Assistant  
**Date:** August 19, 2026
