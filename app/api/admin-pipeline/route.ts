import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";
const DESIRED_STAGES = [
  { name: "Outreach Attempted", sources: ["Outreach Attempted"] },
  { name: "New Lead", sources: ["New Lead"] },
  { name: "Email Sent", sources: ["Email Sent", "Contacted"] },
  { name: "Meeting Scheduled", sources: ["Meeting Scheduled", "Meeting Booked"] },
  { name: "Partner Onboarding", sources: ["Partner Onboarding", "Partnership Pathway Pending"] },
  { name: "Active Partner", sources: ["Active Partner", "Active Referral Partner"] },
] as const;

type Stage = {
  id: string;
  name: string;
  position?: number;
  showInFunnel?: boolean;
  showInPieChart?: boolean;
};

type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

type Opportunity = {
  id: string;
  name: string;
  pipelineStageId: string;
  status?: string;
  monetaryValue?: number;
  assignedTo?: string;
};

function authorized(request: Request) {
  const secret = env.PIPELINE_MIGRATION_KEY?.trim();
  return Boolean(secret && request.headers.get("Authorization") === `Bearer ${secret}`);
}

async function ghl(path: string, init: RequestInit = {}, version = "v3") {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.GHL_PRIVATE_TOKEN}`,
      "Content-Type": "application/json",
      Version: version,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = (data as { message?: string | string[] }).message;
    throw new Error(Array.isArray(detail) ? detail.join(", ") : detail || `HighLevel request failed (${response.status})`);
  }
  return data as Record<string, unknown>;
}

async function getPipelines() {
  const data = await ghl(
    `/opportunities/pipelines?locationId=${encodeURIComponent(env.GHL_LOCATION_ID)}`,
    {},
    "2021-07-28",
  );
  return (data.pipelines || []) as Pipeline[];
}

async function getTargetPipeline() {
  const pipelines = await getPipelines();
  const matches = pipelines.filter((pipeline) => pipeline.name === PIPELINE_NAME);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${PIPELINE_NAME} pipeline; found ${matches.length}`);
  }
  return { pipeline: matches[0], pipelines };
}

async function getTargetOpportunities(pipelineId: string) {
  const query = new URLSearchParams({
    location_id: env.GHL_LOCATION_ID,
    pipeline_id: pipelineId,
    limit: "100",
  });
  const data = await ghl(`/opportunities/search?${query.toString()}`, {}, "2021-07-28");
  return (data.opportunities || []) as Opportunity[];
}

function destinationName(stageName: string) {
  if (["Contacted", "Qualified", "Email Sent"].includes(stageName)) return "Email Sent";
  if (["Meeting Booked", "Meeting Held", "Meeting Scheduled"].includes(stageName)) return "Meeting Scheduled";
  if ([
    "Partnership Pathway Pending",
    "Partnership Pathway Completed",
    "Contract Pending",
    "Contract Signed",
    "Submitted to Medicare",
    "Medicare Approved",
    "Partner Onboarding",
  ].includes(stageName)) return "Partner Onboarding";
  if (["Active Referral Partner", "Active Partner"].includes(stageName)) return "Active Partner";
  if (stageName === "New Lead") return "New Lead";
  return "Outreach Attempted";
}

function publicPipeline(pipeline: Pipeline) {
  return {
    id: pipeline.id,
    name: pipeline.name,
    stages: pipeline.stages
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((stage) => ({ id: stage.id, name: stage.name, position: stage.position })),
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { pipeline, pipelines } = await getTargetPipeline();
    const opportunities = await getTargetOpportunities(pipeline.id).catch(() => []);
    return Response.json({
      target: publicPipeline(pipeline),
      otherPipelines: pipelines.filter((item) => item.id !== pipeline.id).map((item) => ({ id: item.id, name: item.name })),
      opportunities: opportunities.map((item) => ({
        id: item.id,
        name: item.name,
        pipelineStageId: item.pipelineStageId,
        status: item.status,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Inspection failed" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { pipeline } = await getTargetPipeline();
    const currentStages = pipeline.stages || [];
    const desired = DESIRED_STAGES.map((definition, position) => {
      const source = definition.sources
        .map((name) => currentStages.find((stage) => stage.name === name))
        .find(Boolean);
      return { definition, position, source };
    });

    const missingSources = desired.filter((item) => !item.source).map((item) => item.definition.name);
    if (missingSources.length) {
      throw new Error(`Cannot safely retain stage IDs for: ${missingSources.join(", ")}`);
    }

    const destinationIds = new Map(desired.map((item) => [item.definition.name, item.source!.id]));
    const stageNamesById = new Map(currentStages.map((stage) => [stage.id, stage.name]));
    const opportunities = await getTargetOpportunities(pipeline.id);
    const movedOpportunities: Array<{ id: string; from: string; to: string }> = [];

    for (const opportunity of opportunities) {
      const from = stageNamesById.get(opportunity.pipelineStageId) || "Unknown";
      const to = destinationName(from);
      const pipelineStageId = destinationIds.get(to);
      if (!pipelineStageId || pipelineStageId === opportunity.pipelineStageId) continue;

      await ghl(`/opportunities/${encodeURIComponent(opportunity.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          pipelineId: pipeline.id,
          pipelineStageId,
          name: opportunity.name,
          status: opportunity.status || "open",
          monetaryValue: opportunity.monetaryValue,
          assignedTo: opportunity.assignedTo || undefined,
        }),
      });
      movedOpportunities.push({ id: opportunity.id, from, to });
    }

    await ghl(`/opportunities/pipelines/${encodeURIComponent(pipeline.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: PIPELINE_NAME,
        stages: desired.map((item) => ({
          id: item.source!.id,
          name: item.definition.name,
          position: item.position,
          showInFunnel: item.source!.showInFunnel ?? true,
          showInPieChart: item.source!.showInPieChart ?? true,
        })),
      }),
    });

    const { pipeline: verified } = await getTargetPipeline();
    const names = verified.stages
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((stage) => stage.name);
    const expected = DESIRED_STAGES.map((stage) => stage.name);
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Verification failed. Current stages: ${names.join(", ")}`);
    }

    return Response.json({ ok: true, target: publicPipeline(verified), movedOpportunities });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Migration failed" }, { status: 502 });
  }
}
