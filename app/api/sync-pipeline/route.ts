import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";

type Stage = { id: string; name: string };
type Pipeline = { id: string; name: string; stages: Stage[] };
type Opportunity = { id: string; pipelineStageId: string };
type StoredDeal = {
  crmOpportunityId?: string;
  stage?: string;
  updatedAt?: string;
  history?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function normalize(value: string) {
  return String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const STAGE_KEYS = new Map<string, string>([
  ["new lead", "new_lead"],
  ["gatekeeper only - no decision maker information", "gatekeeper_only"],
  ["outreach made", "gatekeeper_only"],
  ["follow-up needed", "gatekeeper_only"],
  ["decision maker identified - email provided", "decision_maker_identified_email_sent"],
  ["decision maker identified - email sent", "decision_maker_identified_email_sent"],
  ["email sent", "decision_maker_identified_email_sent"],
  ["decision maker reached - appointment not scheduled", "decision_maker_appointment_not_scheduled"],
  ["decision maker contacted", "decision_maker_appointment_not_scheduled"],
  ["decision maker contacted - email sent", "decision_maker_appointment_not_scheduled"],
  ["decision maker reached - appointment scheduled", "decision_maker_appointment_scheduled"],
  ["not interested", "not_interested"],
  ["meeting scheduled", "meeting_scheduled"],
  ["meeting held", "meeting_held"],
  ["onboarding documents signed", "onboarding_documents_signed"],
  ["partner onboarding", "onboarding_documents_signed"],
  ["submitted to medicare", "submitted_to_medicare"],
  ["partner training", "partner_training"],
  ["medicare approved", "medicare_approved"],
  ["partner onboarding call", "partner_onboarding_call"],
  ["active partner", "active_partner"],
]);

async function ensureTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guide_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function ghl(path: string) {
  const response = await fetch(API + path, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
      Version: "2021-07-28",
    },
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = (data as { message?: string | string[] }).message;
    throw new Error(Array.isArray(detail) ? detail.join(", ") : detail || `HighLevel request failed (${response.status})`);
  }
  return data;
}

export async function POST() {
  try {
    await ensureTable();
    const pipelineData = await ghl(`/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`);
    const pipelines = (pipelineData.pipelines || []) as Pipeline[];
    const pipeline = pipelines.find((item) => item.name === PIPELINE_NAME);
    if (!pipeline) throw new Error(`${PIPELINE_NAME} pipeline was not found`);

    const query = new URLSearchParams({
      location_id: env.GHL_LOCATION_ID,
      pipeline_id: pipeline.id,
      limit: "100",
    });
    const opportunityData = await ghl(`/opportunities/search?${query.toString()}`);
    const opportunities = (opportunityData.opportunities || []) as Opportunity[];
    const stageKeyById = new Map(
      pipeline.stages
        .map((stage) => [stage.id, STAGE_KEYS.get(normalize(stage.name))] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );
    const opportunityStage = new Map(
      opportunities
        .map((opportunity) => [opportunity.id, stageKeyById.get(opportunity.pipelineStageId)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
    );

    const rows = await env.DB.prepare("SELECT key, value FROM guide_store WHERE key LIKE 'deals:%'").all<{ key: string; value: string }>();
    let updated = 0;
    for (const row of rows.results) {
      let deal: StoredDeal;
      try {
        deal = JSON.parse(row.value) as StoredDeal;
      } catch {
        continue;
      }
      const opportunityId = String(deal.crmOpportunityId || "");
      const nextStage = opportunityStage.get(opportunityId);
      if (!nextStage || nextStage === deal.stage) continue;

      const now = new Date().toISOString();
      deal.stage = nextStage;
      deal.updatedAt = now;
      deal.history = Array.isArray(deal.history) ? deal.history : [];
      deal.history.push({
        ts: now,
        stage: nextStage,
        note: "Pipeline stage synchronized from GoHighLevel.",
      });
      await env.DB.prepare(`UPDATE guide_store SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?`)
        .bind(JSON.stringify(deal), row.key)
        .run();
      updated += 1;
    }

    return Response.json({ ok: true, checked: rows.results.length, updated });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Pipeline synchronization failed" },
      { status: 502 },
    );
  }
}
