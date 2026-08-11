import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Call Details contains only the six requested fields in order", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");
  const cardStart = html.indexOf("<h2>Call Details</h2>");
  const cardEnd = html.indexOf('id="validationMsg"', cardStart);
  const card = html.slice(cardStart, cardEnd);
  const fields = [
    "f_agency_name",
    "f_agency_phone_number",
    "f_answered_by",
    "f_decision_maker_name",
    "f_decision_maker_phone",
    "f_decision_maker_email",
  ];

  let previous = -1;
  for (const field of fields) {
    const position = card.indexOf(`id="${field}"`);
    assert.ok(position > previous, `${field} must appear in the requested order`);
    previous = position;
  }

  assert.match(card, /Agency Name \(Required\)/);
  assert.match(card, /Agency Phone Number \(Required\)/);
  assert.match(card, /Answered By \(Required\)/);
  assert.match(card, /type="email" id="f_decision_maker_email"/);
});

test("removed fields and their old element IDs are absent", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");
  const forbidden = [
    "Contact Full Name",
    "Email Address",
    "Interest Level",
    "Call Outcome",
    "Meeting Date & Time",
    "Next Follow-Up Action",
    "f_contact",
    "f_email",
    "f_interest",
    "f_outcome",
    "f_meeting",
    "f_nextaction",
  ];
  for (const value of forbidden) {
    assert.doesNotMatch(html, new RegExp(value, "i"));
  }
});

test("dependent views, CSV, and HighLevel routes use the new field model", async () => {
  const [html, submitRoute, moveRoute] = await Promise.all([
    readFile(new URL("public/assistant.html", root), "utf8"),
    readFile(new URL("app/api/submit-call/route.ts", root), "utf8"),
    readFile(new URL("app/api/move-stage/route.ts", root), "utf8"),
  ]);
  for (const field of [
    "agencyName",
    "agencyPhoneNumber",
    "answeredBy",
    "decisionMakerName",
    "decisionMakerPhone",
    "decisionMakerEmail",
  ]) {
    assert.match(html, new RegExp(field));
    assert.match(submitRoute, new RegExp(field));
    assert.match(moveRoute, new RegExp(field));
  }
  assert.match(html, /Answered By','Agency Phone Number','Decision Maker Name','Decision Maker Phone','Decision Maker Email'/);
  assert.match(submitRoute, /Decision Maker Email is invalid/);
  assert.match(submitRoute, /item\.name === "New Lead"/);
});

test("Schedule with Dr. Erik discovers the active HighLevel calendar securely", async () => {
  const [html, configRoute] = await Promise.all([
    readFile(new URL("public/assistant.html", root), "utf8"),
    readFile(new URL("app/api/config/route.ts", root), "utf8"),
  ]);

  assert.match(html, /Schedule with Dr\. Erik/);
  assert.match(html, /fetch\('\/api\/config'\)/);
  assert.match(configRoute, /services\.leadconnectorhq\.com/);
  assert.match(configRoute, /\/calendars\/\?locationId=/);
  assert.match(configRoute, /Authorization: `Bearer \$\{token\}`/);
  assert.match(configRoute, /Version: "v3"/);
  assert.match(configRoute, /api\.leadconnectorhq\.com\/widget\/booking/);
  assert.match(configRoute, /calendarUrl: calendar\?\.url \|\| ""/);
  assert.doesNotMatch(configRoute, /GHL_PRIVATE_TOKEN[^\n]*calendarUrl/);
});

test("Schedule with Dr. Erik appears only in Step 8", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");
  const scheduleButtons = html.match(/>Schedule with Dr\. Erik<\/button>/g) || [];

  assert.equal(scheduleButtons.length, 1);
  assert.doesNotMatch(html, /scheduleTopBtn/);
  assert.match(html, /currentStep === STEPS\.length - 1/);
  assert.match(html, /onclick="openScheduler\(\)"/);
});

test("the assistant pipeline shows exactly the eleven requested stages in order", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");
  const start = html.indexOf("const STAGES = [");
  const end = html.indexOf("];", start);
  const stagesBlock = html.slice(start, end);
  const labels = [...stagesBlock.matchAll(/label:'([^']+)'/g)].map((match) => match[1]);

  assert.deepEqual(labels, [
    "New Lead",
    "Outreach Made",
    "Email Sent",
    "Meeting Scheduled",
    "Meeting Held",
    "Onboarding Documents Signed",
    "Submitted to Medicare",
    "Partner Training",
    "Medicare Approved",
    "Partner Onboarding Call",
    "Active Partner",
  ]);
});

test("the secured HighLevel migration targets only the GUIDE pipeline and preserves records", async () => {
  const route = await readFile(new URL("app/api/admin-pipeline/route.ts", root), "utf8");
  const start = route.indexOf("const DESIRED_STAGES = [");
  const end = route.indexOf("] as const;", start);
  const stageBlock = route.slice(start, end);
  const names = [...stageBlock.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(names, [
    "New Lead",
    "Outreach Made",
    "Email Sent",
    "Meeting Scheduled",
    "Meeting Held",
    "Onboarding Documents Signed",
    "Submitted to Medicare",
    "Partner Training",
    "Medicare Approved",
    "Partner Onboarding Call",
    "Active Partner",
  ]);
  assert.match(route, /const PIPELINE_NAME = "GUIDE Partner Call Assistant"/);
  assert.match(route, /Opportunity preservation verification failed/);
  assert.match(route, /Another HighLevel pipeline changed unexpectedly/);
  assert.doesNotMatch(route, /method: "DELETE"/);
});
