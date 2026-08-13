export type OutreachPathKey =
  | "gatekeeper_only"
  | "decision_maker_identified"
  | "gatekeeper_transferred"
  | "answerer_is_decision_maker"
  | "follow_up_needed";

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
    label: "Gatekeeper Only",
    stageName: "Outreach Made",
    stageKey: "outreach_made",
    shouldEmail: true,
  },
  decision_maker_identified: {
    key: "decision_maker_identified",
    label: "Decision Maker Identified, Not Contacted",
    stageName: "Decision Maker Identified – Email Sent",
    stageKey: "decision_maker_identified_email_sent",
    shouldEmail: true,
  },
  gatekeeper_transferred: {
    key: "gatekeeper_transferred",
    label: "Gatekeeper Transferred to Decision Maker",
    stageName: "Decision Maker Contacted",
    stageKey: "decision_maker_contacted_email_sent",
    shouldEmail: true,
  },
  answerer_is_decision_maker: {
    key: "answerer_is_decision_maker",
    label: "Answerer Is Decision Maker",
    stageName: "Decision Maker Contacted",
    stageKey: "decision_maker_contacted_email_sent",
    shouldEmail: true,
  },
  follow_up_needed: {
    key: "follow_up_needed",
    label: "Follow-Up Needed",
    stageName: "Follow-Up Needed",
    stageKey: "follow_up_needed",
    shouldEmail: false,
  },
};

function text(value: unknown) {
  return String(value || "").trim();
}

export function classifyOutreach(call: OutreachCall): OutreachPath {
  const answeredByEmail = text(call.answeredByEmail);
  const decisionMakerName = text(call.decisionMakerName);
  const decisionMakerPhone = text(call.decisionMakerPhone);
  const decisionMakerEmail = text(call.decisionMakerEmail);
  const spokenTo = text(call.decisionMakerSpokenTo);
  const answererIsDecisionMaker = call.answererIsDecisionMaker === true;
  const hasDecisionMakerDetails = Boolean(decisionMakerName || decisionMakerPhone || decisionMakerEmail);

  if (answererIsDecisionMaker && spokenTo === "Yes" && (answeredByEmail || decisionMakerEmail)) {
    return { ...PATHS.answerer_is_decision_maker, recipientEmail: answeredByEmail || decisionMakerEmail };
  }
  if (spokenTo === "Yes" && decisionMakerEmail) {
    return { ...PATHS.gatekeeper_transferred, recipientEmail: decisionMakerEmail };
  }
  if (spokenTo === "No" && decisionMakerEmail) {
    return { ...PATHS.decision_maker_identified, recipientEmail: decisionMakerEmail };
  }
  if (spokenTo === "No" && answeredByEmail && !hasDecisionMakerDetails) {
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

function opening(call: OutreachCall, path: OutreachPath) {
  const answeredBy = escapeHtml(call.answeredBy);
  if (path.key === "gatekeeper_only") {
    return `Thank you for speaking with me today about a GUIDE Model partnership opportunity. Please share or forward this information with the appropriate decision maker at ${escapeHtml(call.agencyName)}.`;
  }
  if (path.key === "decision_maker_identified") {
    return answeredBy
      ? `I had a great conversation with ${answeredBy} today about your agency's private duty home care services.`
      : "I am reaching out about your agency's private duty home care services.";
  }
  if (path.key === "gatekeeper_transferred") {
    return answeredBy
      ? `It was great speaking with you today after ${answeredBy} connected our call.`
      : "It was great speaking with you today.";
  }
  return "It was great speaking with you today about the GUIDE Model partnership opportunity.";
}

export function buildOutreachEmail(
  call: OutreachCall,
  path: OutreachPath,
  calendarUrl: string,
) {
  const greeting = escapeHtml(greetingName(call, path));
  const booking = escapeHtml(calendarUrl);
  const html = `
    <p>Hi ${greeting},</p>
    <p>${opening(call, path)}</p>
    <p>It appears your agency is not currently participating in the GUIDE Model.</p>
    <p>We'd love the opportunity to work with your agency through the GUIDE Model and pay your agency <strong>$34.50 per hour</strong> to provide private duty home care services.</p>
    <p>I've attached a brief informational brochure with more details about the GUIDE Model and the partnership opportunity.</p>
    <p>I'd also love to schedule a quick <strong>15-minute call</strong> to explain how the program works, answer any questions, and discuss how we can work together.</p>
    <p>Please select the date and time that is most convenient for you using our booking link:<br><a href="${booking}">Schedule a 15-minute call</a></p>
    <p>I'm also including a resource that I created with videos and newsletters that can help you, your team, and caregivers navigate through the dementia journey.</p>
    <p><strong>The Dementia Times:</strong><br><a href="https://thedementiatimes.com/">https://thedementiatimes.com/</a></p>
    <p>I look forward to connecting with you.</p>
    <p>Sincerely,</p>
    <p><strong>Dr. Erik Ilyayev</strong><br>
    CEO<br>
    M: 718-781-8858<br>
    P: (305) 339-1756<br>
    E: <a href="mailto:dr.erik@medbetterhealth.org">dr.erik@medbetterhealth.org</a></p>
    <p><strong>MedBetterHealth</strong><br>
    3100 Ray Ferrero Jr Blvd Suite 5030 | Davie, FL 33314<br>
    <a href="https://medbetterhealth.org/">MedBetterHealth.org</a><br>
    <a href="${booking}">Book time to meet with me</a></p>
    <p style="font-size:11px;color:#777;">The content of this email is confidential and intended for the recipient specified in the message only. If you received this message by mistake, please reply to the sender and delete it.</p>
  `.trim();

  return {
    subject: "GUIDE Model Partnership Opportunity with MedBetterHealth",
    html,
    message: html.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim(),
  };
}
