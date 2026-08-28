import { env } from "cloudflare:workers";
import { classifyOutreach } from "../outreach";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";

function normalizeStageName(value: string) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function ghl(path: string, init: RequestInit = {}, version = "2021-07-28") {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
      Version: version,
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

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type LocationCustomField = { id: string; name: string };

function findFieldId(fields: LocationCustomField[], ...names: string[]) {
  return fields.find((field) =>
    names.some((name) => String(field.name || "").trim().toLowerCase() === name.toLowerCase())
  )?.id;
}

async function ensureField(
  fields: LocationCustomField[],
  name: string,
  dataType: "TEXT" | "LARGE_TEXT" | "SINGLE_OPTIONS",
  placeholder: string,
  optionLabels?: string[],
) {
  const existingId = findFieldId(fields, name);
  if (existingId) return existingId;
  const created = await ghl(`/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`, {
    method: "POST",
    body: JSON.stringify({
      name,
      dataType,
      model: "contact",
      placeholder,
      ...(optionLabels?.length ? { options: optionLabels } : {}),
    }),
  }, "v3");
  const customField = (created.customField || created) as { id?: string };
  if (!customField.id) throw new Error(`HighLevel did not return the ${name} custom field ID`);
  fields.push({ id: customField.id, name });
  return customField.id;
}

export async function POST(request: Request) {
  try {
    const call = await request.json() as Record<string, string | boolean>;
    if (!call.agencyName || !call.agencyPhoneNumber) {
      return Response.json({ error: "Agency Name and Agency Phone Number are required" }, { status: 400 });
    }
    if (!validEmail(String(call.decisionMakerEmail || ""))) {
      return Response.json({ error: "Decision Maker Email is invalid" }, { status: 400 });
    }
    if (!validEmail(String(call.answeredByEmail || ""))) {
      return Response.json({ error: "Answered By Email is invalid" }, { status: 400 });
    }

    const path = classifyOutreach(call);
    if (path.shouldEmail && !path.recipientEmail) {
      return Response.json({ error: `A recipient email is required for ${path.label}` }, { status: 400 });
    }
    const usersResult = await ghl(`/users/?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`).catch(() => ({ users: [] }));
    const users = (usersResult.users || []) as Array<{ id: string; name?: string; email?: string }>;
    const loggedBy = String(call.loggedBy || "").trim().toLowerCase();
    const assignedUser = users.find((user) =>
      loggedBy && ((user.name || "").toLowerCase().includes(loggedBy) || (user.email || "").toLowerCase() === loggedBy)
    );

    const fieldsResult = await ghl(`/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`, {}, "v3").catch(() => ({ customFields: [] }));
    const fields = (fieldsResult.customFields || []) as LocationCustomField[];
    const fieldId = (...names: string[]) => findFieldId(fields, ...names);
    const callNotesFieldId = await ensureField(fields, "Partner - Call Notes", "LARGE_TEXT", "Conversation notes from GUIDE Partner Call Assistant");
    const answeredByEmailFieldId = await ensureField(fields, "Partner - Answered By Email", "TEXT", "Gatekeeper or answerer email");
    const spokenToFieldId = await ensureField(
      fields,
      "Partner - Decision Maker Spoken To",
      "SINGLE_OPTIONS",
      "Select Yes or No",
      ["Yes", "No"],
    );
    const pathwayFieldId = await ensureField(fields, "Partner - Outreach Pathway", "TEXT", "Call pathway selected by the assistant");
    const emailStatusFieldId = await ensureField(fields, "Partner - Email Status", "TEXT", "Outreach email status");

    const initialEmailStatus = path.shouldEmail && path.recipientEmail
      ? "Pending automation"
      : "Not sent – email address needed";
    const customFields = [
      { id: fieldId("Answered By", "Partner - Answered By"), field_value: call.answeredBy },
      { id: answeredByEmailFieldId, field_value: call.answeredByEmail },
      { id: fieldId("Agency Phone Number", "Partner - Agency Phone Number"), field_value: call.agencyPhoneNumber },
      { id: fieldId("Decision Maker Name", "Partner - Decision Maker Name"), field_value: call.decisionMakerName },
      { id: fieldId("Decision Maker Phone", "Partner - Decision Maker Phone"), field_value: call.decisionMakerPhone },
      { id: fieldId("Decision Maker Email", "Partner - Decision Maker Email"), field_value: call.decisionMakerEmail },
      { id: spokenToFieldId, field_value: call.decisionMakerSpokenTo || "No" },
      { id: pathwayFieldId, field_value: path.label },
      { id: emailStatusFieldId, field_value: initialEmailStatus },
      { id: callNotesFieldId, field_value: call.manualNotes },
      { id: fieldId("Partner - Lead Source"), field_value: "GUIDE Model Outreach" },
      { id: fieldId("Partner - Last Contact Date"), field_value: new Date().toISOString().slice(0, 10) },
    ].filter((field) => field.id && field.field_value);

    const primaryName = String(
      path.key === "gatekeeper_only"
        ? call.answeredBy
        : call.decisionMakerName || call.answeredBy,
    ).trim();
    const names = primaryName.split(/\s+/).filter(Boolean);
    const contactResult = await ghl("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        firstName: names[0] || call.agencyName,
        lastName: names.slice(1).join(" "),
        companyName: call.agencyName,
        phone: call.decisionMakerPhone || call.agencyPhoneNumber,
        email: path.recipientEmail || call.decisionMakerEmail || call.answeredByEmail || undefined,
        assignedTo: assignedUser?.id || undefined,
        source: "GUIDE Partner Call Assistant",
        customFields,
        tags: ["GUIDE Model Outreach", `GUIDE Path - ${path.label}`],
      }),
    });
    const contact = (contactResult.contact || contactResult) as { id?: string };
    if (!contact.id) throw new Error("HighLevel did not return a contact ID");

    const pipelineResult = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineResult.pipelines || []) as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    if (!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);
    const stageCandidates = path.key === "gatekeeper_only"
      ? ["Gatekeeper Only – No Decision Maker Information", "Outreach Made", "Follow-Up Needed"]
      : path.key === "decision_maker_identified"
        ? ["Decision Maker Identified – Email Provided", "Decision Maker Identified – Email Sent", "Email Sent"]
        : path.key === "decision_maker_reached_scheduled"
          ? ["Decision Maker Reached – Appointment Scheduled"]
          : path.key === "decision_maker_reached_not_scheduled"
            ? ["Decision Maker Reached – Appointment Not Scheduled", "Decision Maker Contacted", "Decision Maker Contacted – Email Sent"]
            : path.key === "not_interested"
              ? ["Not Interested"]
              : ["Gatekeeper Only – No Decision Maker Information", "Follow-Up Needed", "Outreach Made"];
    const normalizedCandidates = stageCandidates.map(normalizeStageName);
    const stage = pipeline.stages.find((item) => normalizedCandidates.includes(normalizeStageName(item.name)));
    if (!stage) throw new Error(`${stageCandidates[0]} stage was not found in HighLevel`);

    const opportunityResult = await ghl("/opportunities/upsert", {
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
    const opportunity = (opportunityResult.opportunity || opportunityResult) as { id?: string };

    return Response.json({
      ok: true,
      contactId: contact.id,
      opportunityId: opportunity.id || "",
      pipelineId: pipeline.id,
      stage: stage.name,
      stageKey: path.stageKey,
      pathway: path.label,
      emailStatus: initialEmailStatus,
      emailMessageId: "",
      emailWarning: "",
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Submission failed" }, { status: 502 });
  }
}
