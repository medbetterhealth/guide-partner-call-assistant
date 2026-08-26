import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";

const PIPELINE_NAME = "GUIDE Partner Call Assistant";

const EMAIL_STAGE_BY_KEY: Record<string, { stageName: string; workflowName: string }> = {
  gatekeeper_only: {
    stageName: "Gatekeeper Only – No Decision Maker Information",
    workflowName: "GUIDE Partner - 2.a Gatekeeper Only Email",
  },
  decision_maker_identified_email_sent: {
    stageName: "Decision Maker Identified – Email Provided",
    workflowName: "GUIDE Partner - 2.b Decision Maker Identified Email",
  },
  decision_maker_appointment_scheduled: {
    stageName: "Decision Maker Reached – Appointment Scheduled",
    workflowName: "GUIDE Partner - 2.c Appointment Scheduled Email",
  },
  decision_maker_appointment_not_scheduled: {
    stageName: "Decision Maker Reached – Appointment Not Scheduled",
    workflowName: "GUIDE Partner - 2.d Appointment Not Scheduled Email",
  },
  not_interested: {
    stageName: "Not Interested",
    workflowName: "GUIDE Partner - 2.e Not Interested Email",
  },
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

function normalized(value: unknown) {
  return text(value).replace(/[–—]/g, "-").replace(/\s+/g, " ").toLowerCase();
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
    const opportunityId = text(lead.crmOpportunityId, 100);
    const dealKey = text(lead._key, 300);
    const emailStage = EMAIL_STAGE_BY_KEY[stage];

    if (!emailStage) {
      return Response.json({ error: "This pipeline stage does not have an email automation." }, { status: 400 });
    }
    if (!contactId || !validId(contactId) || !opportunityId || !validId(opportunityId)) {
      return Response.json({ error: "Save this lead before resending its email." }, { status: 400 });
    }
    if (!dealKey.startsWith("deals:")) {
      return Response.json({ error: "The saved pipeline record is invalid." }, { status: 400 });
    }

    const savedRow = await env.DB.prepare("SELECT value FROM guide_store WHERE key = ?").bind(dealKey).first<{ value: string }>();
    const savedLead = savedRow?.value ? JSON.parse(savedRow.value) as Record<string, unknown> : null;
    if (!savedLead || text(savedLead.crmContactId, 100) !== contactId || text(savedLead.crmOpportunityId, 100) !== opportunityId || text(savedLead.stage, 100) !== stage) {
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

    const pipelineResult = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineResult.pipelines || []) as Array<{
      id: string;
      name: string;
      stages: Array<{ id: string; name: string }>;
    }>;
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    const newLeadStage = pipeline?.stages.find((item) => normalized(item.name) === "new lead");
    const targetStage = pipeline?.stages.find((item) => normalized(item.name) === normalized(emailStage.stageName));
    if (!pipeline || !newLeadStage || !targetStage) {
      return Response.json({ error: "The required GUIDE pipeline stages were not found in HighLevel." }, { status: 404 });
    }

    const opportunityResult = await ghl(`/opportunities/${encodeURIComponent(opportunityId)}`);
    const opportunity = (opportunityResult.opportunity || opportunityResult) as {
      pipelineId?: string;
      pipelineStageId?: string;
      status?: string;
      assignedTo?: string;
    };
    if (opportunity.pipelineId !== pipeline.id || opportunity.pipelineStageId !== targetStage.id) {
      return Response.json({ error: "Refresh the pipeline before resending this email." }, { status: 409 });
    }

    const updateStage = async (pipelineStageId: string) => ghl(`/opportunities/${encodeURIComponent(opportunityId)}`, {
      method: "PUT",
      body: JSON.stringify({
        pipelineId: pipeline.id,
        pipelineStageId,
        name: `${text(lead.agencyName, 200)} — GUIDE Partnership`,
        status: opportunity.status || "open",
        ...(opportunity.assignedTo ? { assignedTo: opportunity.assignedTo } : {}),
      }),
    });

    await updateStage(newLeadStage.id);
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      await updateStage(targetStage.id);
    } catch {
      await updateStage(targetStage.id);
    }

    await env.DB.prepare(`INSERT INTO guide_email_resends (deal_key, sent_at) VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(deal_key) DO UPDATE SET sent_at = CURRENT_TIMESTAMP`).bind(dealKey).run();

    return Response.json({ ok: true, workflowName: emailStage.workflowName, recipientEmail, emailStatus: "Pending automation" });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "The email could not be resent.",
    }, { status: 502 });
  }
}
