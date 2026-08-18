import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";

function normalizeStageName(value: string) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stageAliases(value: string) {
  const normalized = normalizeStageName(value);
  if (normalized === "gatekeeper only - no decision maker information") {
    return ["Gatekeeper Only – No Decision Maker Information", "Outreach Made", "Follow-Up Needed"];
  }
  if (normalized === "decision maker identified - email provided") {
    return ["Decision Maker Identified – Email Provided", "Decision Maker Identified – Email Sent", "Email Sent"];
  }
  if (normalized === "decision maker reached - appointment scheduled") {
    return ["Decision Maker Reached – Appointment Scheduled", "Meeting Scheduled"];
  }
  if (normalized === "decision maker reached - appointment not scheduled") {
    return ["Decision Maker Reached – Appointment Not Scheduled", "Decision Maker Contacted", "Decision Maker Contacted – Email Sent"];
  }
  if (normalized === "decision maker contacted" || normalized === "decision maker contacted - email sent") {
    return ["Decision Maker Reached – Appointment Not Scheduled", "Decision Maker Contacted", "Decision Maker Contacted – Email Sent"];
  }
  if (normalized === "decision maker identified" || normalized === "decision maker identified - email sent") {
    return ["Decision Maker Identified – Email Provided", "Decision Maker Identified", "Decision Maker Identified – Email Sent"];
  }
  if (normalized === "meeting scheduled") {
    return ["Decision Maker Reached – Appointment Scheduled", "Meeting Scheduled"];
  }
  if (normalized === "follow-up needed" || normalized === "follow up needed" || normalized === "outreach made") {
    return ["Gatekeeper Only – No Decision Maker Information", "Follow-Up Needed", "Outreach Made"];
  }
  return [value];
}

async function ghl(path: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { message?: string }).message || `HighLevel request failed (${response.status})`);
  }
  return data as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const deal = await request.json() as Record<string, string>;
    if (!deal.agencyName || !deal.stageName) {
      return Response.json({ error: "Agency Name and stage are required" }, { status: 400 });
    }

    const normalizedStage = normalizeStageName(deal.stageName);
    const isGatekeeperStage = normalizedStage === "gatekeeper only - no decision maker information";
    const outreachStageNames = [
      "gatekeeper only - no decision maker information",
      "decision maker identified - email provided",
      "decision maker reached - appointment scheduled",
      "decision maker reached - appointment not scheduled",
      "not interested",
    ];
    const isEmailOutcome = outreachStageNames.includes(normalizedStage);
    const recipientEmail = isGatekeeperStage
      ? String(deal.answeredByEmail || "").trim()
      : String(deal.decisionMakerEmail || deal.answeredByEmail || "").trim();
    if (isEmailOutcome && !recipientEmail) {
      return Response.json({ error: `A recipient email is required before moving to ${deal.stageName}` }, { status: 400 });
    }
    const nextEmailStatus = isEmailOutcome ? "Pending automation" : deal.emailStatus;
    const outreachPathway = [
      "gatekeeper only - no decision maker information",
      "decision maker identified - email provided",
      "decision maker reached - appointment scheduled",
      "decision maker reached - appointment not scheduled",
      "not interested",
    ].includes(normalizedStage) ? deal.stageName : deal.outreachPathway;

    const fieldsResult = await ghl(`/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`).catch(() => ({ customFields: [] }));
    const fields = (fieldsResult.customFields || []) as Array<{ id: string; name: string }>;
    const fieldId = (...names: string[]) => fields.find((field) =>
      names.some((name) => String(field.name || "").trim().toLowerCase() === name.toLowerCase())
    )?.id;
    const customFields = [
      { id: fieldId("Answered By", "Partner - Answered By"), field_value: deal.answeredBy },
      { id: fieldId("Partner - Answered By Email"), field_value: deal.answeredByEmail },
      { id: fieldId("Agency Phone Number", "Partner - Agency Phone Number"), field_value: deal.agencyPhoneNumber },
      { id: fieldId("Decision Maker Name", "Partner - Decision Maker Name"), field_value: deal.decisionMakerName },
      { id: fieldId("Decision Maker Phone", "Partner - Decision Maker Phone"), field_value: deal.decisionMakerPhone },
      { id: fieldId("Decision Maker Email", "Partner - Decision Maker Email"), field_value: deal.decisionMakerEmail },
      { id: fieldId("Partner - Decision Maker Spoken To"), field_value: deal.decisionMakerSpokenTo },
      { id: fieldId("Partner - Outreach Pathway"), field_value: outreachPathway },
      { id: fieldId("Partner - Email Status"), field_value: nextEmailStatus },
      { id: fieldId("Partner - Call Notes", "Partner - Notes", "Call Notes"), field_value: deal.manualNotes },
    ].filter((field) => field.id && field.field_value);

    const primaryName = String(
      isGatekeeperStage
        ? deal.answeredBy || deal.decisionMakerName || deal.agencyName
        : deal.decisionMakerName || deal.answeredBy || deal.agencyName || "",
    ).trim();
    const names = primaryName.split(/\s+/).filter(Boolean);
    const contactResult = await ghl("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        firstName: names[0] || deal.agencyName,
        lastName: names.slice(1).join(" "),
        companyName: deal.agencyName,
        phone: isGatekeeperStage
          ? deal.agencyPhoneNumber || deal.decisionMakerPhone || undefined
          : deal.decisionMakerPhone || deal.agencyPhoneNumber || undefined,
        email: isGatekeeperStage
          ? deal.answeredByEmail || undefined
          : deal.decisionMakerEmail || deal.answeredByEmail || undefined,
        source: "GUIDE Partner Call Assistant",
        customFields,
      }),
    });
    const contact = (contactResult.contact || contactResult) as { id?: string };
    if (!contact.id) throw new Error("HighLevel did not return a contact ID");

    const pipelineResult = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineResult.pipelines || []) as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    if (!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);
    const aliases = stageAliases(deal.stageName).map(normalizeStageName);
    const stage = pipeline.stages.find((item) => aliases.includes(normalizeStageName(item.name)));
    if (!stage) throw new Error(`${deal.stageName} stage was not found in HighLevel`);

    const opportunityResult = await ghl("/opportunities/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        contactId: contact.id,
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        name: `${deal.agencyName} — GUIDE Partnership`,
        status: deal.stageName === "Active Partner" ? "won" : "open",
      }),
    });
    const opportunity = (opportunityResult.opportunity || opportunityResult) as { id?: string };

    return Response.json({ ok: true, stage: stage.name, opportunityId: opportunity.id || "", emailStatus: nextEmailStatus || "" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Stage update failed" }, { status: 502 });
  }
}
