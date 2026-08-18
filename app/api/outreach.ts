export type OutreachPathKey =
  | "gatekeeper_only"
  | "decision_maker_identified"
  | "decision_maker_reached_scheduled"
  | "decision_maker_reached_not_scheduled"
  | "not_interested"
  | "follow_up_needed";

export const OUTREACH_EMAIL_CC = "dr.erik@medbetterhealth.org";
export const OUTREACH_FROM_EMAIL = "GuideTeam2@medbetterhealth.org";
export const OUTREACH_BROCHURE_PATH = "/MedBetterHealth_GUIDE_Partner_OnePager.pdf";

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
  if (spokenTo !== "Yes" && decisionMakerName && decisionMakerEmail) {
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

export function buildOutreachEmail(call: OutreachCall, path: OutreachPath, calendarUrl: string) {
  const resolvedGreeting = greetingName(call, path);
  const firstName = escapeHtml(resolvedGreeting.split(/\s+/)[0] || "there");
  const greeting = path.key === "gatekeeper_only" ? firstName : escapeHtml(resolvedGreeting);
  const booking = escapeHtml(calendarUrl);
  const agency = escapeHtml(call.agencyName) || "your agency";
  const gatekeeper = escapeHtml(call.answeredBy);
  let subject = `${firstName} – GUIDE Model Private Duty Partnership & Revenue Opportunity`;
  let body = "";
  // The exact saved GuideTeam2 Outlook signature is appended by the delivery
  // flow, so the generated copy intentionally contains no duplicate sign-off.
  const closing = "";
  let includeBooking = false;

  if (path.key === "gatekeeper_only") {
    subject = `${firstName} – Great Speaking With You Today | GUIDE Model Private Duty Partnership Opportunity`;
    body = `<p>It was great speaking with you today about the GUIDE Model and the opportunity for your agency to provide private-duty home care services for individuals living with dementia.</p>
      <p>Through this partnership, MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> to provide eligible private-duty respite care services. This can create additional paid home care hours and a new revenue opportunity for your agency.</p>
      <p>I've attached a brief informational brochure with more details about the GUIDE Model and how the partnership works.</p>
      <p>I'd appreciate it if you could share this information with the appropriate decision maker at your agency.</p>
      <p>I'm copying our CEO, Dr. Erik Ilyayev, on this email. He would be happy to schedule a quick 15-minute conversation with the appropriate person to explain the program, answer any questions, and discuss the partnership opportunity.</p>
      <p>You can use Dr. Erik's calendar link below to select a convenient time.</p>
      <p>Looking forward to connecting again.</p>`;
    includeBooking = true;
  } else if (path.key === "decision_maker_identified") {
    body = `<p>I recently spoke with ${gatekeeper || "a member of your team"} at ${agency} regarding the GUIDE Model and the opportunity for your agency to partner with MedBetterHealth.</p>
      <p>Through this program, your agency can provide eligible private-duty respite care services for individuals living with dementia, and MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> for those services.</p>
      <p>Your agency provides the care and bills MedBetterHealth directly on the private-pay side, so your agency does not bill Medicare for these services.</p>
      <p>This partnership can provide your agency with additional paid referrals and additional home care hours.</p>
      <p>I've attached a brief informational brochure with more details about the program.</p>
      <p>I'm copying our CEO, Dr. Erik Ilyayev, on this email. He would love to schedule a quick 15-minute call with you to explain how the partnership works, answer any questions, and discuss the opportunity for ${agency}.</p>
      <p>Please use Dr. Erik's calendar link below to select a convenient date and time.</p>
      <p>We look forward to connecting with you.</p>`;
    includeBooking = true;
  } else if (path.key === "decision_maker_reached_scheduled") {
    subject = `${firstName} – Your Upcoming GUIDE Model Partnership Meeting`;
    body = `<p>It was great speaking with you today about the GUIDE Model and MedBetterHealth's private-duty home care partnership opportunity.</p>
      <p>As we discussed, MedBetterHealth can pay your agency <strong>$34.50 per hour</strong> to provide eligible private-duty respite care services for individuals living with dementia. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.</p>
      <p>I've attached our GUIDE Model informational brochure so you can review some additional information before your upcoming conversation.</p>
      <p>I'm copying our CEO, Dr. Erik Ilyayev, on this email. He looks forward to speaking with you and discussing how MedBetterHealth and ${agency} can work together.</p>
      <p>We look forward to the conversation.</p>`;
  } else if (path.key === "decision_maker_reached_not_scheduled") {
    subject = `${firstName} – Great Speaking With You Today | GUIDE Model Private Duty Partnership Opportunity`;
    body = `<p>It was great speaking with you today about the GUIDE Model and MedBetterHealth's private-duty home care partnership opportunity.</p>
      <p>As we discussed, MedBetterHealth is looking to partner with reliable private-duty home care agencies to provide respite services for individuals living with dementia.</p>
      <p>Through this partnership, MedBetterHealth will pay your agency <strong>$34.50 per hour</strong> for eligible private-duty respite care services. Your agency provides the care and bills MedBetterHealth directly on the private-pay side.</p>
      <p>I've attached a brief informational brochure with additional details about the program.</p>
      <p>I'm copying our CEO, Dr. Erik Ilyayev, on this email so you can connect with him directly. He would be happy to answer any additional questions and discuss how ${agency} can work with MedBetterHealth.</p>
      <p>Please use Dr. Erik's calendar link below to schedule a quick 15-minute conversation at a time that works best for you.</p>
      <p>Looking forward to connecting again.</p>`;
    includeBooking = true;
  } else if (path.key === "not_interested") {
    subject = `${firstName} – GUIDE Model Private Duty Partnership Information`;
    body = `<p>Thank you for taking the time to speak with me today about the GUIDE Model and MedBetterHealth's private-duty home care partnership opportunity.</p>
      <p>I understand that this may not be the right opportunity for your agency at this time.</p>
      <p>I've attached our informational brochure for your reference. If anything changes in the future, or if your agency would like to learn more about the opportunity to receive <strong>$34.50 per hour</strong> for eligible private-duty respite care services, we'd be happy to reconnect.</p>
      <p>I'm copying our CEO, Dr. Erik Ilyayev, so you have his information should you wish to connect in the future.</p>
      <p>Thank you again for your time.</p>`;
  } else {
    body = `<p>I'm following up regarding the GUIDE Model partnership opportunity for ${agency}. Once we have the appropriate contact information, a member of our team will follow up.</p>`;
  }

  const bookingBlock = includeBooking && booking
    ? `<p><a href="${booking}">Schedule a 15-minute call</a></p>`
    : "";
  // The live delivery flow must append Ekaterina Sbitneva-Bixler's existing
  // GuideTeam2 Outlook graphical signature, including its live calendar/social
  // links and banner. Do not flatten, recreate, or duplicate it in this body.
  const html = `<p>Hi ${greeting},</p>${body}${bookingBlock}${closing}`;

  return {
    subject,
    from: OUTREACH_FROM_EMAIL,
    cc: OUTREACH_EMAIL_CC,
    attachmentPath: OUTREACH_BROCHURE_PATH,
    signatureMode: "existing_guideteam2_outlook_graphical",
    html,
    message: html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim(),
  };
}
