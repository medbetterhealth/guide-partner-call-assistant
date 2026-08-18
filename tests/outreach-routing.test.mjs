import assert from "node:assert/strict";
import test from "node:test";
import { buildOutreachEmail, classifyOutreach } from "../app/api/outreach.ts";

const calendarUrl = "https://example.test/dr-erik";

const base = {
  agencyName: "Test Agency",
  agencyPhoneNumber: "3055550100",
  answeredBy: "Grace Gatekeeper",
  answeredByEmail: "grace@example.test",
  decisionMakerName: "Dana Decision",
  decisionMakerEmail: "dana@example.test",
  decisionMakerSpokenTo: "No",
};

test("routes the five automatic outreach outcomes", () => {
  const cases = [
    [{ ...base, decisionMakerName: "", decisionMakerEmail: "" }, "gatekeeper_only", "grace@example.test"],
    [base, "decision_maker_identified", "dana@example.test"],
    [{ ...base, decisionMakerSpokenTo: "Yes" }, "decision_maker_reached_not_scheduled", "dana@example.test"],
    [{ ...base, decisionMakerSpokenTo: "Yes", appointmentScheduled: true }, "decision_maker_reached_scheduled", "dana@example.test"],
    [{ ...base, notInterested: true }, "not_interested", "dana@example.test"],
  ];
  for (const [input, expectedKey, expectedRecipient] of cases) {
    const result = classifyOutreach(input);
    assert.equal(result.key, expectedKey);
    assert.equal(result.recipientEmail, expectedRecipient);
  }
});

test("identified route works when spoken-to is blank, as long as name and email exist", () => {
  const result = classifyOutreach({ ...base, decisionMakerSpokenTo: "" });
  assert.equal(result.key, "decision_maker_identified");
});

test("email drafts resolve names and preserve booking rules", () => {
  const keys = [
    "gatekeeper_only",
    "decision_maker_identified",
    "decision_maker_reached_not_scheduled",
    "decision_maker_reached_scheduled",
    "not_interested",
  ];
  for (const key of keys) {
    const path = classifyOutreach({
      ...base,
      decisionMakerSpokenTo: key.includes("reached") ? "Yes" : "No",
      appointmentScheduled: key === "decision_maker_reached_scheduled",
      notInterested: key === "not_interested",
      decisionMakerName: key === "gatekeeper_only" ? "" : base.decisionMakerName,
      decisionMakerEmail: key === "gatekeeper_only" ? "" : base.decisionMakerEmail,
    });
    const draft = buildOutreachEmail(base, path, calendarUrl);
    assert.ok(!draft.subject.includes("["));
    assert.ok(!draft.html.includes("undefined"));
    assert.ok(!draft.html.includes("Hi ,"));
    assert.equal(draft.from, "GuideTeam2@medbetterhealth.org");
    assert.equal(draft.cc, "dr.erik@medbetterhealth.org");
    assert.equal(draft.signatureMode, "existing_guideteam2_outlook_graphical");
    assert.equal(draft.attachmentPath, "/MedBetterHealth_GUIDE_Partner_OnePager.pdf");
    const shouldBook = key === "gatekeeper_only" || key === "decision_maker_identified" || key === "decision_maker_reached_not_scheduled";
    assert.equal(draft.html.includes(calendarUrl), shouldBook);
    assert.doesNotMatch(draft.html, /Dementia Times|DementiaTimes\.com/i);
    assert.match(draft.html, /copying our CEO, Dr\. Erik Ilyayev/i);
    assert.doesNotMatch(draft.html, /Best,<br>MedBetterHealth GUIDE Team/);
  }
});
