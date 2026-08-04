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
  if (!response.ok) throw new Error((data as { message?: string }).message || `HighLevel request failed (${response.status})`);
  return data as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const deal = await request.json() as Record<string, string>;
    if (!deal.agency || (!deal.phone && !deal.email) || !deal.stageName) {
      return Response.json({ error: "Agency, phone or email, and stage are required" }, { status: 400 });
    }

    const names = (deal.contact || "").trim().split(/\s+/).filter(Boolean);
    const contactResult = await ghl("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        firstName: names[0] || deal.agency,
        lastName: names.slice(1).join(" "),
        companyName: deal.agency,
        phone: deal.phone || undefined,
        email: deal.email || undefined,
        source: "GUIDE Partner Call Assistant",
      }),
    });
    const contact = (contactResult.contact || contactResult) as { id?: string };
    if (!contact.id) throw new Error("HighLevel did not return a contact ID");

    const pipelineResult = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineResult.pipelines || []) as Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    if (!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);
    const stage = pipeline.stages.find((item) => item.name === deal.stageName);
    if (!stage) throw new Error(`${deal.stageName} stage was not found in HighLevel`);

    await ghl("/opportunities/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: env.GHL_LOCATION_ID,
        contactId: contact.id,
        pipelineId: pipeline.id,
        pipelineStageId: stage.id,
        name: `${deal.agency} — GUIDE Partnership`,
        status: ["Not Interested", "Disqualified"].includes(deal.stageName) ? "lost" : "open",
      }),
    });

    return Response.json({ ok: true, stage: stage.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Stage update failed" }, { status: 502 });
  }
}
