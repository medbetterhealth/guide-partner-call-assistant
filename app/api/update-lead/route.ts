import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";

type LocationCustomField = { id: string; name: string };
type EditableLead = Record<string, string | boolean>;

const OUTREACH_LABELS: Record<string, string> = {
  gatekeeper_only: "Gatekeeper Only - No Decision Maker Information",
  decision_maker_identified: "Decision Maker Identified - Email Provided",
  decision_maker_reached_no_appointment: "Decision Maker Reached - Appointment Not Scheduled",
  decision_maker_reached_appointment_scheduled: "Decision Maker Reached - Appointment Scheduled",
  not_interested: "Not Interested",
};

function text(value: unknown, maximum = 5000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validId(value: string) {
  return !value || /^[A-Za-z0-9_-]+$/.test(value);
}

async function ghl(path: string, init: RequestInit = {}, version = "v3") {
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

function findFieldId(fields: LocationCustomField[], ...names: string[]) {
  return fields.find((field) =>
    names.some((name) => text(field.name).toLowerCase() === name.toLowerCase())
  )?.id;
}

function primaryEmail(lead: EditableLead) {
  const outcome = text(lead.outreachOutcome);
  if (outcome === "gatekeeper_only") return text(lead.answeredByEmail, 320);
  if (outcome === "not_interested") {
    return text(lead.decisionMakerEmail, 320) || text(lead.answeredByEmail, 320);
  }
  return text(lead.decisionMakerEmail, 320) || text(lead.answeredByEmail, 320);
}

function contactName(lead: EditableLead) {
  return text(lead.decisionMakerName, 200) || text(lead.answeredBy, 200) || text(lead.agencyName, 200);
}

export async function POST(request: Request) {
  try {
    const lead = await request.json() as EditableLead;
    const agencyName = text(lead.agencyName, 200);
    const agencyPhoneNumber = text(lead.agencyPhoneNumber, 50);
    const answeredByEmail = text(lead.answeredByEmail, 320);
    const decisionMakerEmail = text(lead.decisionMakerEmail, 320);
    let contactId = text(lead.crmContactId, 100);
    const opportunityId = text(lead.crmOpportunityId, 100);

    if (!agencyName || !agencyPhoneNumber) {
      return Response.json({ error: "Agency Name and Agency Phone Number are required" }, { status: 400 });
    }
    if (!validEmail(answeredByEmail)) {
      return Response.json({ error: "Answered By Email is invalid" }, { status: 400 });
    }
    if (!validEmail(decisionMakerEmail)) {
      return Response.json({ error: "Decision Maker Email is invalid" }, { status: 400 });
    }
    if (!validId(contactId) || !validId(opportunityId)) {
      return Response.json({ error: "The saved GoHighLevel record identifiers are invalid" }, { status: 400 });
    }

    const fieldsResult = await ghl(
      `/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`,
    ).catch(() => ({ customFields: [] }));
    const fields = (fieldsResult.customFields || []) as LocationCustomField[];
    const fieldId = (...names: string[]) => findFieldId(fields, ...names);
    const outreachPathway = OUTREACH_LABELS[text(lead.outreachOutcome)] || text(lead.outreachPathway, 300);
    const lastContactDate = text(lead.lastContactDate, 20) || new Date().toISOString().slice(0, 10);

    const editableCustomFields = [
      { id: fieldId("Answered By", "Partner - Answered By"), value: text(lead.answeredBy, 200) },
      { id: fieldId("Partner - Answered By Email"), value: answeredByEmail },
      { id: fieldId("Agency Phone Number", "Partner - Agency Phone Number"), value: agencyPhoneNumber },
      { id: fieldId("Decision Maker Name", "Partner - Decision Maker Name"), value: text(lead.decisionMakerName, 200) },
      { id: fieldId("Decision Maker Phone", "Partner - Decision Maker Phone"), value: text(lead.decisionMakerPhone, 50) },
      { id: fieldId("Decision Maker Email", "Partner - Decision Maker Email"), value: decisionMakerEmail },
      { id: fieldId("Partner - Decision Maker Spoken To"), value: text(lead.decisionMakerSpokenTo, 20) },
      { id: fieldId("Partner - Follow-Up Email Outcome"), value: outreachPathway },
      { id: fieldId("Partner - Outreach Pathway"), value: outreachPathway },
      { id: fieldId("Partner - Email Status"), value: text(lead.emailStatus, 100) },
      { id: fieldId("Partner - Call Notes", "Partner - Notes", "Call Notes"), value: text(lead.manualNotes, 12000) },
      { id: fieldId("Partner - Counties", "Counties Served", "Counties"), value: text(lead.counties, 500) },
      { id: fieldId("Partner - Last Contact Date"), value: lastContactDate },
      { id: fieldId("Partner - Next Follow-Up Date"), value: text(lead.nextFollowUpDate, 20) },
    ].filter((field): field is { id: string; value: string } => Boolean(field.id));

    const fullName = contactName(lead);
    const names = fullName.split(/\s+/).filter(Boolean);
    const email = primaryEmail(lead);
    const phone = text(lead.decisionMakerPhone, 50) || agencyPhoneNumber;
    const updatePayload = {
      firstName: names[0] || agencyName,
      lastName: names.slice(1).join(" "),
      name: fullName,
      email: email || null,
      phone: phone || null,
      companyName: agencyName,
      source: "GUIDE Partner Call Assistant",
      customFields: editableCustomFields.map((field) => ({ id: field.id, fieldValue: field.value })),
    };

    if (contactId) {
      try {
        await ghl(`/contacts/${encodeURIComponent(contactId)}`, {
          method: "PUT",
          body: JSON.stringify(updatePayload),
        });
      } catch {
        // Some HighLevel contact-update versions omit companyName from their schema.
        // Retry without it while still updating the opportunity name below.
        const compatiblePayload = {
          firstName: updatePayload.firstName,
          lastName: updatePayload.lastName,
          name: updatePayload.name,
          email: updatePayload.email,
          phone: updatePayload.phone,
          source: updatePayload.source,
          customFields: updatePayload.customFields,
        };
        await ghl(`/contacts/${encodeURIComponent(contactId)}`, {
          method: "PUT",
          body: JSON.stringify(compatiblePayload),
        });
      }
    } else {
      // Older locally migrated cards may not have retained their contact ID. Reuse
      // HighLevel's established upsert behavior instead of creating a new record.
      const result = await ghl("/contacts/upsert", {
        method: "POST",
        body: JSON.stringify({
          locationId: env.GHL_LOCATION_ID,
          firstName: updatePayload.firstName,
          lastName: updatePayload.lastName,
          companyName: agencyName,
          email: updatePayload.email || undefined,
          phone: updatePayload.phone || undefined,
          source: updatePayload.source,
          customFields: editableCustomFields.map((field) => ({ id: field.id, field_value: field.value })),
        }),
      }, "2021-07-28");
      const contact = (result.contact || result) as { id?: string };
      contactId = contact.id || "";
      if (!contactId) throw new Error("HighLevel did not return a contact ID");
    }

    if (opportunityId) {
      const opportunityResult = await ghl(`/opportunities/${encodeURIComponent(opportunityId)}`);
      const current = (opportunityResult.opportunity || opportunityResult) as {
        pipelineId?: string;
        pipelineStageId?: string;
        status?: string;
        assignedTo?: string;
      };
      if (current.pipelineId && current.pipelineStageId) {
        await ghl(`/opportunities/${encodeURIComponent(opportunityId)}`, {
          method: "PUT",
          body: JSON.stringify({
            pipelineId: current.pipelineId,
            pipelineStageId: current.pipelineStageId,
            name: `${agencyName} — GUIDE Partnership`,
            status: current.status || "open",
            ...(current.assignedTo ? { assignedTo: current.assignedTo } : {}),
          }),
        });
      }
    }

    return Response.json({
      ok: true,
      contactId,
      opportunityId,
      outreachPathway,
      lastContactDate,
      stagePreserved: true,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Lead update failed",
    }, { status: 502 });
  }
}
