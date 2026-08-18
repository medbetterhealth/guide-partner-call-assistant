import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Call Details keeps required core fields without five-stage selector", async () => {
  const html = await read("public/assistant.html");
  const card = html.slice(html.indexOf("<h2>Call Details</h2>"), html.indexOf("<!-- Transcription + notes -->"));
  for (const field of ["f_agency_name","f_agency_phone_number","f_answered_by","f_answered_by_email","f_answerer_is_decision_maker","f_decision_maker_name","f_decision_maker_phone","f_decision_maker_email","f_decision_maker_spoken_to","f_manual_notes"]) {
    assert.match(card, new RegExp(`id=\\"${field}\\"`));
  }
  assert.match(card, /Gatekeeper Name/);
  assert.match(card, /Gatekeeper Email/);
  assert.doesNotMatch(card, /Call Outcome \/ Email Route/);
  assert.equal((card.match(/name="outreach_outcome"/g) || []).length, 0);
});

test("call script preserves requested wording and county question", async () => {
  const html = await read("public/assistant.html");
  assert.match(html, /Hi, my name is \[Name\]\. Quick question, do you provide private duty home care\?/);
  assert.match(html, /Which counties do you currently serve\?/);
  assert.match(html, /Have you ever heard about the GUIDE Model\?/);
  assert.match(html, /Our company handles all the enrollment and billing/);
  assert.match(html, /\$34\.50 via private pay/);
  assert.match(html, /Who would be the best person in your company to speak to about this\?/);
  assert.match(html, /scheduling the call is the main objective/);
  assert.doesNotMatch(html, /mutual\s+(?:patient|client)/i);
  assert.doesNotMatch(html, /id="f_counties_visible"/);
  assert.doesNotMatch(html, /id="newLeadCounties"/);
  assert.doesNotMatch(html, /id="stepCountiesInput"/);
  assert.doesNotMatch(html, />Counties Served</i);
});

test("New Call does not expose five pipeline stages and final step has only simple end statuses", async () => {
  const html = await read("public/assistant.html");
  assert.doesNotMatch(html, /name="outreach_outcome"/);
  assert.match(html, /id="stepAppointmentScheduled"/);
  assert.match(html, /Appointment successfully scheduled with Dr\. Erik/);
  assert.match(html, /id="stepNotInterested"/);
  assert.match(html, /Contact is not interested/);
});

test("five outreach pipeline stages stay compact and sequential", async () => {
  const html = await read("public/assistant.html");
  const block = html.slice(html.indexOf("const STAGES = ["), html.indexOf("];", html.indexOf("const STAGES = [")));
  const labels = [...block.matchAll(/label:'([^']+)'/g)].map(m=>m[1]);
  const steps = [...block.matchAll(/step:'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(labels.slice(0,6), [
    "New Lead",
    "Gatekeeper Only – No Decision Maker Information",
    "Decision Maker Identified – Email Provided",
    "Decision Maker Reached – Appointment Not Scheduled",
    "Decision Maker Reached – Appointment Scheduled",
    "Not Interested",
  ]);
  assert.deepEqual(steps.slice(0,6), ["1.","2.a","2.b","2.c","2.d","2.e"]);
  assert.match(html, /groupedColHtml\(outreachStages, '2\. Outreach Outcomes', 'kanban-outreach-col'\)/);
});

test("checkbox sync is non-destructive", async () => {
  const html = await read("public/assistant.html");
  const start = html.indexOf("function syncAnswererAsDecisionMaker");
  const end = html.indexOf("// ---------- Tabs ----------", start);
  const block = html.slice(start, end);
  assert.match(block, /Non-destructive sync/);
  assert.match(block, /if\(source && !target\.value\.trim\(\)\) target\.value = source/);
  assert.match(block, /spokenTo\.value = 'Yes'/);
  assert.doesNotMatch(block, /if\(!spokenTo\.value\)/);
  assert.doesNotMatch(block, /document\.getElementById\('f_decision_maker_name'\)\.value = answeredBy/);
});

test("New Call submits only simple status flags and auto-routing fields", async () => {
  const html = await read("public/assistant.html");
  assert.doesNotMatch(html, /outreachOutcome:/);
  assert.match(html, /appointmentScheduled: document\.getElementById\('f_appointment_scheduled'\)\.value === 'Yes'/);
  assert.match(html, /notInterested: document\.getElementById\('f_not_interested'\)\.value === 'Yes'/);
  assert.match(html, /f_appointment_scheduled'\)\.value = 'No'/);
  assert.match(html, /f_not_interested'\)\.value = 'No'/);
});

test("UI validates scheduled and reached decision-maker routes without a five-stage selector", async () => {
  const html = await read("public/assistant.html");
  assert.doesNotMatch(html, /Select the call outcome before submitting/);
  assert.match(html, /Set Decision Maker Spoken To to Yes before marking an appointment as scheduled/);
  assert.match(html, /Decision Maker Name and Decision Maker Email are required for a scheduled appointment/);
  assert.match(html, /Decision Maker Name and Decision Maker Email are required when the decision maker was reached/);
});

test("dashboard metrics use new appointment-scheduled stage", async () => {
  const html = await read("public/assistant.html");
  assert.match(html, /statMeetings'\)\.textContent = inStage\('decision_maker_appointment_scheduled'\)/);
  assert.doesNotMatch(html, /statMeetings'\)\.textContent = inStage\('meeting_scheduled'\)/);
  assert.match(html, /h\.stage === 'decision_maker_appointment_scheduled'\)\{ rep\(who\)\.meetings\+\+/);
});

test("outreach classifier supports all five selected outcomes", async () => {
  const outreach = await read("app/api/outreach.ts");
  for (const key of ["gatekeeper_only","decision_maker_identified","decision_maker_reached_scheduled","decision_maker_reached_not_scheduled","not_interested"]) assert.match(outreach, new RegExp(key));
  assert.match(outreach, /requestedOutcome/);
  assert.match(outreach, /follow_up_needed:[\s\S]*?shouldEmail: false/);
});

test("email draft source removes Dementia Times and uses teammate wording", async () => {
  const outreach = await read("app/api/outreach.ts");
  assert.match(outreach, /A member of my team recently spoke with you/);
  assert.match(outreach, /I understand you recently spoke with a member of my team/);
  assert.match(outreach, /\$34\.50 per hour/);
  assert.doesNotMatch(outreach, /Dementia Times/i);
  assert.doesNotMatch(outreach, /great speaking with you today/i);
  assert.match(outreach, /subject = `\$\{greeting\} – GUIDE Model Private Duty Partnership & Revenue Opportunity`/);
  assert.match(outreach, /signatureMode: "existing_outlook_graphical"/);
  assert.match(outreach, /OUTREACH_BROCHURE_PATH/);
  assert.doesNotMatch(outreach, /function signature\(/);
});

test("all email metadata carries GuideTeam2 CC", async () => {
  const outreach = await read("app/api/outreach.ts");
  assert.match(outreach, /OUTREACH_EMAIL_CC = "GuideTeam2@medbetterhealth\.org"/);
  assert.match(outreach, /OUTREACH_FROM_EMAIL = "dr\.erik@medbetterhealth\.org"/);
  assert.match(outreach, /cc: OUTREACH_EMAIL_CC/);
  assert.match(outreach, /from: OUTREACH_FROM_EMAIL/);
});

test("appointment scheduled email intentionally has no new booking CTA", async () => {
  const outreach = await read("app/api/outreach.ts");
  const scheduledStart = outreach.indexOf('path.key === "decision_maker_reached_scheduled"');
  const nextStart = outreach.indexOf('path.key === "decision_maker_reached_not_scheduled"', scheduledStart);
  const scheduled = outreach.slice(scheduledStart, nextStart);
  assert.match(scheduled, /Your Upcoming GUIDE Model Partnership Meeting/);
  assert.doesNotMatch(scheduled, /includeBooking = true/);
});

test("submit-call refuses an email stage with no recipient and keeps CRM writes", async () => {
  const route = await read("app/api/submit-call/route.ts");
  assert.match(route, /path\.shouldEmail && !path\.recipientEmail/);
  assert.match(route, /\/contacts\/upsert/);
  assert.match(route, /\/opportunities\/upsert/);
  assert.match(route, /Pending automation/);
});

test("manual stage move refuses missing recipients and marks automation pending", async () => {
  const route = await read("app/api/move-stage/route.ts");
  assert.match(route, /isEmailOutcome && !recipientEmail/);
  assert.match(route, /nextEmailStatus = isEmailOutcome \? "Pending automation"/);
  assert.match(route, /emailStatus: nextEmailStatus/);
});

test("pipeline migration uses the exact five-stage order and protects active opportunities", async () => {
  const route = await read("app/api/admin-pipeline/route.ts");
  const block = route.slice(route.indexOf("const DESIRED_STAGES = ["), route.indexOf("] as const;", route.indexOf("const DESIRED_STAGES = [")));
  const names = [...block.matchAll(/name: "([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(names.slice(0,6), [
    "New Lead",
    "Gatekeeper Only – No Decision Maker Information",
    "Decision Maker Identified – Email Provided",
    "Decision Maker Reached – Appointment Not Scheduled",
    "Decision Maker Reached – Appointment Scheduled",
    "Not Interested",
  ]);
  assert.match(route, /Cannot safely remove legacy stages with active opportunities/);
  assert.match(route, /Another HighLevel pipeline changed unexpectedly/);
});

test("calendar endpoint uses configured URL or live Dr. Erik HighLevel calendar", async () => {
  const route = await read("app/api/config/route.ts");
  assert.match(route, /GHL_CALENDAR_URL/);
  assert.match(route, /HIGHLEVEL_BOOKING_WIDGET/);
  assert.match(route, /drErikScore/);
  const html = await read("public/assistant.html");
  assert.match(html, /The active Dr\. Erik calendar could not be found in GoHighLevel/);
});
