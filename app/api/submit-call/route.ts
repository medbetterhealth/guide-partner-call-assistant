import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";

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

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const call = await request.json() as Record<string, string>;
    if (!call.agencyName || !call.agencyPhoneNumber) {
      return Response.json(
        { error: "Agency Name and Agency Phone Number are required" },
        { status: 400 },
      );
    }
    if (!validEmail(call.decisionMakerEmail || "")) {
      return Response.json({ error: "Decision Maker Email is invalid" }, { status: 400 });
    }

    const usersResult = await ghl(`/users/?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`).catch(() => ({ users: [] }));
    const users = (usersResult.users || []) as Array<{ id: string; name?: string; email?: string }>;
    const loggedBy = (call.loggedBy || "").trim().toLowerCase();
    const assignedUser = users.find((user) =>
      loggedBy && ((user.name || "").toLowerCase().includes(loggedBy) || (user.email || "").toLowerCase() === loggedBy)
    );

    const fieldsResult = await ghl(`/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`).catch(() => ({ customFields: [] }));
    const fields = (fieldsResult.customFields || []) as Array<{ id: string; name: string }>;
    const fieldId = (...names: string[]) => fields.find((field) =>
      names.some((name) => field.name.trim().toLowerCase() === name.toLowerCase())
    )?.id;
    const customFields = [
      { id: fieldId("Answered By", "Partner - Answered By"), field_value: call.answeredBy },
      { id: fieldId("Agency Phone Number", "Partner - Agency Phone Number"), field_value: call.agencyPhoneNumber },
      { id: fieldId("Decision Maker Name", "Partner - Decision Maker Name"), field_value: call.decisionMakerName },
      { id: fieldId("Decision Maker Phone", "Partner - Decision Maker Phone"), field_value: call.decisionMakerPhone },
      { id: fieldId("Decision Maker Email", "Partner - Decision Maker Email"), field_value: call.decisionMakerEmail },
      { id: fieldId("Partner - Lead Source"), field_value: "GUIDE Model Outreach" },
      { id: fieldId("Partner - Last Contact Date"), field_value: new Date().toISOString().slice(0, 10) },
    ].filter((field) => field.id && field.field_value);

    const primaryName = (call.decisionMakerName || call.answeredBy).trim();
    const names = primaryName.split(/\s+/).filter(Boolean);
    const contactResult = await ghl("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        firstName: names[0] || call.agencyName,
        lastName: names.slice(1).join(" "),
        companyName: call.agencyName,
        phone: call.decisionMakerPhone || call.agencyPhoneNumber,
        email: call.decisionMakerEmail || undefined,
        assignedTo: assignedUser?.id || undefined,
        source: "GUIDE Partner Call Assistant",
        customFields,
        tags: ["GUIDE Model Outreach"],
      }),
    });
    const contact = (contactResult.contact || contactResult) as { id?: string };
    if (!contact.id) throw new Error("HighLevel did not return a contact ID");

    const pipelineResult = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineResult.pipelines || []) as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    if (!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);
    const stage = pipeline.stages.find((item) => item.name === "New Lead") || pipeline.stages[0];
    if (!stage) throw new Error(`${PIPELINE_NAME} has no pipeline stages`);

    await ghl("/opportunities/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        contactId: contact.id,
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        name: `${call.agencyName} — GUIDE Partnership`,
        assignedTo: assignedUser?.id || undefined,
        status: "open",
      }),
    });

    return Response.json({ ok: true, contactId: contact.id, pipelineId: pipeline.id, stage: stage.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 502 });
  }
}
