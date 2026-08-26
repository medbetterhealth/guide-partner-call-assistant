import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";

const WORKFLOW_BY_STAGE: Record<string, string> = {
  gatekeeper_only: "GUIDE Partner - 2.a Gatekeeper Only Email",
  decision_maker_identified_email_sent: "GUIDE Partner - 2.b Decision Maker Identified Email",
  decision_maker_appointment_scheduled: "GUIDE Partner - 2.c Appointment Scheduled Email",
  decision_maker_appointment_not_scheduled: "GUIDE Partner - 2.d Appointment Not Scheduled Email",
  not_interested: "GUIDE Partner - 2.e Not Interested Email",
};

function text(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function validId(value: string) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function ghl(path: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
      Version: "v3",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { message?: string | string[] }).message;
    throw new Error(Array.isArray(message) ? message.join(", ") : message || `HighLevel request failed (${response.status})`);
  }
  return data as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const lead = await request.json() as Record<string, unknown>;
    const stage = text(lead.stage, 100);
    const contactId = text(lead.crmContactId, 100);
    const dealKey = text(lead._key, 300);
    const workflowName = WORKFLOW_BY_STAGE[stage];

    if (!workflowName) {
      return Response.json({ error: "This pipeline stage does not have an email automation." }, { status: 400 });
    }
    if (!contactId || !validId(contactId)) {
      return Response.json({ error: "Save this lead before resending its email." }, { status: 400 });
    }
    if (!dealKey.startsWith("deals:")) {
      return Response.json({ error: "The saved pipeline record is invalid." }, { status: 400 });
    }

    const savedRow = await env.DB.prepare("SELECT value FROM guide_store WHERE key = ?").bind(dealKey).first<{ value: string }>();
    const savedLead = savedRow?.value ? JSON.parse(savedRow.value) as Record<string, unknown> : null;
    if (!savedLead || text(savedLead.crmContactId, 100) !== contactId || text(savedLead.stage, 100) !== stage) {
      return Response.json({ error: "Refresh the pipeline before resending this email." }, { status: 409 });
    }

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guide_email_resends (
      deal_key TEXT PRIMARY KEY NOT NULL,
      sent_at TEXT NOT NULL
    )`).run();
    const recent = await env.DB.prepare(
      "SELECT sent_at FROM guide_email_resends WHERE deal_key = ? AND sent_at > datetime('now', '-60 seconds')",
    ).bind(dealKey).first<{ sent_at: string }>();
    if (recent) {
      return Response.json({ error: "Please wait one minute before resending this email again." }, { status: 429 });
    }

    const recipientEmail = stage === "gatekeeper_only"
      ? text(lead.answeredByEmail, 320)
      : text(lead.decisionMakerEmail, 320) || text(lead.answeredByEmail, 320);
    if (!validEmail(recipientEmail)) {
      return Response.json({ error: "A valid recipient email is required for this stage." }, { status: 400 });
    }

    const workflowResult = await ghl(`/workflows/?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const workflows = (workflowResult.workflows || []) as Array<{ id?: string; name?: string; status?: string }>;
    const workflow = workflows.find((item) => text(item.name).toLowerCase() === workflowName.toLowerCase());
    if (!workflow?.id) {
      return Response.json({ error: `${workflowName} was not found in HighLevel.` }, { status: 404 });
    }
    if (text(workflow.status).toLowerCase() === "draft") {
      return Response.json({ error: `${workflowName} is still a draft in HighLevel.` }, { status: 409 });
    }

    const workflowPath = `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(workflow.id)}`;
    await ghl(workflowPath, { method: "DELETE" }).catch(() => null);
    const result = await ghl(workflowPath, {
      method: "POST",
      body: JSON.stringify({ eventStartTime: new Date().toISOString() }),
    });
    if (result.succeeded === false || result.succeded === false) {
      throw new Error("HighLevel did not start the email workflow.");
    }

    await env.DB.prepare(`INSERT INTO guide_email_resends (deal_key, sent_at) VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(deal_key) DO UPDATE SET sent_at = CURRENT_TIMESTAMP`).bind(dealKey).run();

    return Response.json({ ok: true, workflowName, recipientEmail, emailStatus: "Pending automation" });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "The email could not be resent.",
    }, { status: 502 });
  }
}
