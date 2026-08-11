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
  assert.match(card, /<label>Answered By<\/label>/);
  assert.match(card, /<input type="text" id="f_answered_by"[^>]*>/);
  assert.doesNotMatch(card, /id="f_answered_by"[^>]*\brequired\b/);
  assert.doesNotMatch(card, /Answered By \(Required\)/);
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
  assert.doesNotMatch(submitRoute, /!call\.answeredBy/);
  assert.match(submitRoute, /Agency Name and Agency Phone Number are required/);
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

test("Step 5 uses the requested Medicare partnership explanation", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");

  assert.match(html, /Many of your clients have a dementia diagnosis and traditional Medicare\. Through the GUIDE Model, MedBetterHealth handles all Medicare enrollment and billing, your agency delivers the respite Homecare, and we pay you directly at a rate of 34\.50\/hour/);
  assert.match(html, /This way, your organization does not bill Medicare\. Instead, your agency bills us directly on the private side\./);
  assert.doesNotMatch(html, /You never enroll in Medicare and never file a claim/);
  assert.doesNotMatch(html, /agency bills MedBetterHealth directly/);
  assert.doesNotMatch(html, /However, Medicare saw a major gap/);
  assert.doesNotMatch(html, /approved respite services/);
});

test("the assistant pipeline shows the requested numbered stages and hover guidance", async () => {
  const html = await readFile(new URL("public/assistant.html", root), "utf8");
  const start = html.indexOf("const STAGES = [");
  const end = html.indexOf("];", start);
  const stagesBlock = html.slice(start, end);
  const labels = [...stagesBlock.matchAll(/label:'([^']+)'/g)].map((match) => match[1]);
  const steps = [...stagesBlock.matchAll(/step:'([^']+)'/g)].map((match) => match[1]);

  assert.deepEqual(labels, [
    "New Lead",
    "Outreach Made",
    "Decision Maker Identified – Email Sent",
    "Decision Maker Contacted – Email Sent",
    "Not Interested",
    "Meeting Scheduled",
    "Meeting Held",
    "Onboarding Documents Signed",
    "Submitted to Medicare",
    "Partner Training",
    "Medicare Approved",
    "Partner Onboarding Call",
    "Active Partner",
  ]);
  assert.deepEqual(steps, ["1.", "2.", "3.a", "3.b", "3.c", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11."]);
  assert.match(stagesBlock, /Gatekeeper provided the decision maker’s name\/contact information\. Email was sent, but no conversation with the decision maker yet\./);
  assert.match(stagesBlock, /Gatekeeper connected you to the decision maker\. You spoke with them, then sent the follow-up email\./);
  assert.match(stagesBlock, /You spoke with the gatekeeper or decision maker and they clearly declined\./);
  assert.match(html, /data-tooltip="\$\{escapeAttr\(description\)\}"/);
  assert.match(html, /stage-name\.has-description:hover::after/);
  assert.match(html, /3\. Next Contact \/ Email Sent/);
  assert.match(html, /class="kanban-col kanban-group-col"/);
  assert.match(html, /class="kanban-substage kanban-stage-target"/);
  assert.doesNotMatch(html, /text-decoration:underline/);
  assert.doesNotMatch(html, /title="\$\{escapeAttr\(description\)\}"/);
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
    "Decision Maker Identified – Email Sent",
    "Decision Maker Contacted – Email Sent",
    "Not Interested",
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
  assert.match(route, /\["Outreach Made", "Outreach Attempted"\]/);
  assert.match(route, /\["Decision Maker Identified – Email Sent", "Email Sent"\]/);
  assert.match(route, /\["Onboarding Documents Signed", "Partner Onboarding"\]/);
  assert.doesNotMatch(route, /method: "DELETE"/);
});
