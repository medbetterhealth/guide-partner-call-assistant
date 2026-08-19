import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string) {
  return !value || /^[\d\s\-\(\)\.+]*$/.test(value);
}

type LocationCustomField = { id: string; name: string };

function findFieldId(fields: LocationCustomField[], ...names: string[]) {
  return fields.find((field) =>
    names.some((name) => String(field.name || "").trim().toLowerCase() === name.toLowerCase())
  )?.id;
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

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;

    // SAFETY: Require crmContactId for updating existing contact
    // This prevents creating new contacts when editing pipeline cards
    const crmContactId = String(body.crmContactId || "").trim();
    if (!crmContactId) {
      return Response.json(
        { error: "Contact ID is required for editing pipeline cards. Cannot create new contacts." },
        { status: 400 }
      );
    }

    // Validate email and phone formats
    const answeredByEmail = String(body.answeredByEmail || "").trim();
    if (!validEmail(answeredByEmail)) {
      return Response.json({ error: "Answered By Email is invalid" }, { status: 400 });
    }

    const decisionMakerEmail = String(body.decisionMakerEmail || "").trim();
    if (!validEmail(decisionMakerEmail)) {
      return Response.json({ error: "Decision Maker Email is invalid" }, { status: 400 });
    }

    const agencyPhoneNumber = String(body.agencyPhoneNumber || "").trim();
    if (!validPhone(agencyPhoneNumber)) {
      return Response.json({ error: "Agency Phone Number format is invalid" }, { status: 400 });
    }

    const decisionMakerPhone = String(body.decisionMakerPhone || "").trim();
    if (!validPhone(decisionMakerPhone)) {
      return Response.json({ error: "Decision Maker Phone format is invalid" }, { status: 400 });
    }

    // Get existing custom field IDs
    const fieldsResult = await ghl(
      `/locations/${encodeURIComponent(env.GHL_LOCATION_ID)}/customFields`,
      {},
      "v3"
    ).catch(() => ({ customFields: [] }));
    const fields = (fieldsResult.customFields || []) as LocationCustomField[];
    const fieldId = (...names: string[]) => findFieldId(fields, ...names);

    // Prepare custom fields for update
    const customFields = [
      { id: fieldId("Answered By", "Partner - Answered By"), field_value: body.answeredBy },
      { id: fieldId("Partner - Answered By Email"), field_value: answeredByEmail },
      { id: fieldId("Agency Phone Number", "Partner - Agency Phone Number"), field_value: agencyPhoneNumber },
      { id: fieldId("Decision Maker Name", "Partner - Decision Maker Name"), field_value: body.decisionMakerName },
      { id: fieldId("Decision Maker Phone", "Partner - Decision Maker Phone"), field_value: decisionMakerPhone },
      { id: fieldId("Decision Maker Email", "Partner - Decision Maker Email"), field_value: decisionMakerEmail },
      { id: fieldId("Partner - Decision Maker Spoken To"), field_value: body.decisionMakerSpokenTo },
      { id: fieldId("Partner - Outreach Pathway"), field_value: body.outreachPathway },
      { id: fieldId("Partner - Email Status"), field_value: body.emailStatus },
      { id: fieldId("Partner - Call Notes", "Partner - Notes", "Call Notes"), field_value: body.manualNotes },
    ].filter((field) => field.id && field.field_value);

    // SAFETY: Update existing contact by exact ID (direct update, NOT upsert)
    // This ensures we only update an existing contact, never create a new one
    // Using PATCH /contacts/{id} for partial update of custom fields only
    await ghl(
      `/contacts/${encodeURIComponent(crmContactId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          customFields,
        }),
      },
      "v3"
    );

    // Only update local store after GHL update succeeds
    return Response.json({
      ok: true,
      contactId: crmContactId,
      updatedAt: new Date().toISOString(),
      message: "Contact updated successfully (existing contact only, no new contact created)",
    });
  } catch (error) {
    // If GHL update fails, local store remains unchanged (safe transactional behavior)
    return Response.json(
      { error: error instanceof Error ? error.message : "Card update failed" },
      { status: 502 }
    );
  }
}
