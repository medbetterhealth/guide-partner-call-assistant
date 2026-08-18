export type OutreachPathKey =
  | "gatekeeper_only"
  | "decision_maker_identified"
  | "decision_maker_reached_scheduled"
  | "decision_maker_reached_not_scheduled"
  | "not_interested"
  | "follow_up_needed";

export const OUTREACH_EMAIL_CC = "GuideTeam2@medbetterhealth.org";

export type OutreachCall = Record<string, string | boolean | undefined>;

export type OutreachPath = {
  key: OutreachPathKey;
  label: string;
  stageName: string;
  stageKey: string;
  recipientEmail: string;
  shouldEmail: boolean;
};

const PATHS: Record<OutreachPathKey, Omit<OutreachPath, "recipientEmail">> = {
  gatekeeper_only: {
    key: "gatekeeper_only",
    label: "Gatekeeper Only – No Decision Maker Information",
    stageName: "Gatekeeper Only – No Decision Maker Information",
    stageKey: "gatekeeper_only",
    shouldEmail: true,
  },
  decision_maker_identified: {
    key: "decision_maker_identified",
    label: "Decision Maker Identified – Email Provided",
    stageName: "Decision Maker Identified – Email Provided",
    stageKey: "decision_maker_identified_email_sent",
    shouldEmail: true,
  },
  decision_maker_reached_scheduled: {
    key: "decision_maker_reached_scheduled",
    label: "Decision Maker Reached – Appointment Scheduled",
    stageName: "Decision Maker Reached – Appointment Scheduled",
    stageKey: "decision_maker_appointment_scheduled",
    shouldEmail: true,
  },
  decision_maker_reached_not_scheduled: {
    key: "decision_maker_reached_not_scheduled",
    label: "Decision Maker Reached – Appointment Not Scheduled",
    stageName: "Decision Maker Reached – Appointment Not Scheduled",
    stageKey: "decision_maker_appointment_not_scheduled",
    shouldEmail: true,
  },
  not_interested: {
    key: "not_interested",
    label: "Not Interested",
    stageName: "Not Interested",
    stageKey: "not_interested",
    shouldEmail: true,
  },
  // Internal fallback only. It intentionally does not send an email because the
  // call did not contain enough usable recipient information to choose one of
  // the five real outreach outcomes safely.
  follow_up_needed: {
    key: "follow_up_needed",
    label: "Follow-Up Needed",
    stageName: "Gatekeeper Only – No Decision Maker Information",
    stageKey: "gatekeeper_only",
    shouldEmail: false,
  },
};

function text(value: unknown) {
  return String(value || "").trim();
}

function booleanish(value: unknown) {
  return value === true || text(value).toLowerCase() === "yes" || text(value).toLowerCase() === "true";
}

export function classifyOutreach(call: OutreachCall): OutreachPath {
  const answeredByEmail = text(call.answeredByEmail);
  const decisionMakerName = text(call.decisionMakerName);
  const decisionMakerPhone = text(call.decisionMakerPhone);
  const decisionMakerEmail = text(call.decisionMakerEmail);
  const spokenTo = text(call.decisionMakerSpokenTo);
  const answererIsDecisionMaker = call.answererIsDecisionMaker === true;
  const appointmentScheduled = booleanish(call.appointmentScheduled);
  const notInterested = booleanish(call.notInterested);
  const requestedOutcome = text(call.outreachOutcome);
  const hasDecisionMakerDetails = Boolean(decisionMakerName || decisionMakerPhone || decisionMakerEmail);

  // These optional flags make the API future-proof without adding any required
  // controls to the current UI. Manual stage moves can still set 2.c or 2.e.
  if (notInterested || requestedOutcome === "not_interested") {
    return { ...PATHS.not_interested, recipientEmail: decisionMakerEmail || answeredByEmail };
  }
  if ((appointmentScheduled || requestedOutcome === "decision_maker_reached_scheduled") && spokenTo === "Yes") {
    return { ...PATHS.decision_maker_reached_scheduled, recipientEmail: decisionMakerEmail || answeredByEmail };
  }
  if (answererIsDecisionMaker && spokenTo === "Yes") {
    return { ...PATHS.decision_maker_reached_not_scheduled, recipientEmail: answeredByEmail || decisionMakerEmail };
  }
  if (spokenTo === "Yes") {
    return { ...PATHS.decision_maker_reached_not_scheduled, recipientEmail: decisionMakerEmail || answeredByEmail };
  }
  if (spokenTo === "No" && decisionMakerEmail) {
    return { ...PATHS.decision_maker_identified, recipientEmail: decisionMakerEmail };
  }
  if (answeredByEmail && !hasDecisionMakerDetails) {
    return { ...PATHS.gatekeeper_only, recipientEmail: answeredByEmail };
  }
  return { ...PATHS.follow_up_needed, recipientEmail: "" };
}

function escapeHtml(value: unknown) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function greetingName(call: OutreachCall, path: OutreachPath) {
  if (path.key === "gatekeeper_only") return text(call.answeredBy) || "there";
  return text(call.decisionMakerName) || text(call.answeredBy) || "there";
}

function signature(booking: string) {
  return `<p><strong>Dr. Erik Ilyayev</strong><br>
    CEO<br>
    M: 718-781-8858<br>
    P: (305) 339-1756<br>
    E: <a href="mailto:dr.erik@medbetterhealth.org">dr.erik@medbetterhealth.org</a></p>
    <p><strong>MedBetterHealth</strong><br>
    3100 Ray Ferrero Jr Blvd Suite 5030 | Davie, FL 33314<br>
    <a href="https://medbetterhealth.org/">MedBetterHealth.org</a>${booking ? `<br><a href="${booking}">Book time to meet with me</a>` : ""}</p>`;
}

export function buildOutreachEmail(call: OutreachCall, path: OutreachPath, calendarUrl: string) {
  const greeting = escapeHtml(greetingName(call, path));
  const booking = escapeHtml(calendarUrl);
  const agency = escapeHtml(call.agencyName) || "your agency";
  const gatekeeper = escapeHtml(call.answeredBy);
  let subject = "GUIDE Model Private Duty Partnership & Revenue Opportunity";
  let body = "";
  let includeBooking = false;

  if (path.key === "gatekeeper_only") {
    body = `<p>A member of my team recently spoke with you regarding the GUIDE Model and an opportunity for your agency to partner with MedBetterHealth.</p>
      <p>Through this partnership, your agency can provide eligible private-duty respite care services for individuals living with dementia, and MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> for those services.</p>
      <p>Your agency provides the care and bills MedBetterHealth directly on the private-pay side. Your agency does not bill Medicare for these services.</p>
      <p>I've attached a brief informational brochure with additional details about the GUIDE Model and how the partnership works.</p>
      <p>If possible, please share this information with the appropriate decision maker at your agency. I would be happy to schedule a quick 15-minute call with them to explain the program, answer any questions, and discuss the partnership opportunity.</p>
      <p>Please use my calendar link below to select a convenient time.</p>`;
    includeBooking = true;
  } else if (path.key === "decision_maker_identified") {
    body = `<p>A member of my team recently spoke with ${gatekeeper || "a member of your team"} at ${agency}, who provided your contact information regarding a potential partnership through the GUIDE Model.</p>
      <p>MedBetterHealth is looking to partner with reliable private-duty home care agencies to provide respite care services for individuals living with dementia.</p>
      <p>Through this partnership, MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> for eligible private-duty respite care services. Your agency provides the care and bills MedBetterHealth directly on the private-pay side, so your agency does not bill Medicare for these services.</p>
      <p>This can provide your agency with additional paid referrals and additional home care hours.</p>
      <p>I've attached a brief informational brochure with more information about the program.</p>
      <p>I'd love to schedule a quick 15-minute call with you to explain how the partnership works, answer your questions, and discuss the opportunity for ${agency}.</p>
      <p>Please select a convenient date and time using my calendar link below.</p>`;
    includeBooking = true;
  } else if (path.key === "decision_maker_reached_scheduled") {
    subject = "Your Upcoming GUIDE Model Partnership Meeting";
    body = `<p>I understand you recently spoke with a member of my team about the GUIDE Model and MedBetterHealth's private-duty home care partnership opportunity.</p>
      <p>I'm glad we were able to get a meeting scheduled, and I look forward to speaking with you personally.</p>
      <p>As my team shared, MedBetterHealth can pay your agency <strong>$34.50 per hour</strong> to provide eligible private-duty respite care services for individuals living with dementia. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.</p>
      <p>I've attached our GUIDE Model informational brochure so you can review the partnership before our conversation.</p>
      <p>I look forward to meeting with you and discussing how MedBetterHealth and ${agency} may be able to work together.</p>`;
  } else if (path.key === "decision_maker_reached_not_scheduled") {
    body = `<p>I understand you recently spoke with a member of my team regarding the GUIDE Model and our private-duty home care partnership opportunity.</p>
      <p>MedBetterHealth is looking to partner with reliable private-duty home care agencies to provide respite care services for individuals living with dementia.</p>
      <p>Through this partnership, MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> for eligible private-duty respite care services. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.</p>
      <p>I've attached a brief informational brochure with additional details about the program and partnership.</p>
      <p>I'd be happy to speak with you personally, answer any questions you may have, and discuss how ${agency} could work with MedBetterHealth.</p>
      <p>Please use my calendar link below to schedule a quick 15-minute call at a time that works best for you.</p>`;
    includeBooking = true;
  } else if (path.key === "not_interested") {
    subject = "GUIDE Model Partnership Information";
    body = `<p>I understand you recently spoke with a member of my team regarding MedBetterHealth's GUIDE Model private-duty home care partnership opportunity.</p>
      <p>I understand that this may not be the right opportunity for your agency at this time.</p>
      <p>I've attached our informational brochure for your reference. If anything changes in the future, or if you would like to learn more about the opportunity for agencies to receive <strong>$34.50 per hour</strong> for eligible private-duty respite care services, we would be happy to reconnect.</p>
      <p>Thank you for your time and consideration.</p>`;
  } else {
    body = `<p>I'm following up regarding the GUIDE Model partnership opportunity for ${agency}. Once we have the appropriate contact information, a member of our team will follow up.</p>`;
  }

  const bookingBlock = includeBooking && booking
    ? `<p><a href="${booking}">Schedule a 15-minute call</a></p>`
    : "";
  const html = `<p>Hi ${greeting},</p>${body}${bookingBlock}<p>Looking forward to connecting.</p>${signature(includeBooking ? booking : "")}`;

  return {
    subject,
    cc: OUTREACH_EMAIL_CC,
    html,
    message: html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim(),
  };
}
