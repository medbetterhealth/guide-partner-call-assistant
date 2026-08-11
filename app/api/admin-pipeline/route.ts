import { env } from "cloudflare:workers";

const API = "https://services.leadconnectorhq.com";
const PIPELINE_NAME = "GUIDE Partner Call Assistant";
const DESIRED_STAGES = [
  { name: "New Lead", sources: ["New Lead"] },
  { name: "Outreach Made", sources: ["Outreach Made", "Outreach Attempted"] },
  {
    name: "Decision Maker Identified – Email Sent",
    sources: ["Decision Maker Identified – Email Sent", "Email Sent"],
  },
  {
    name: "Decision Maker Contacted – Email Sent",
    sources: ["Decision Maker Contacted – Email Sent"],
  },
  { name: "Not Interested", sources: ["Not Interested"] },
  { name: "Meeting Scheduled", sources: ["Meeting Scheduled"] },
  { name: "Meeting Held", sources: ["Meeting Held"] },
  {
    name: "Onboarding Documents Signed",
    sources: ["Onboarding Documents Signed", "Partner Onboarding"],
  },
  { name: "Submitted to Medicare", sources: ["Submitted to Medicare"] },
  { name: "Partner Training", sources: ["Partner Training"] },
  { name: "Medicare Approved", sources: ["Medicare Approved"] },
  { name: "Partner Onboarding Call", sources: ["Partner Onboarding Call"] },
  { name: "Active Partner", sources: ["Active Partner"] },
] as const;

const REQUIRED_EXISTING_SOURCES = [
  "New Lead",
  "Outreach Attempted",
  "Email Sent",
  "Meeting Scheduled",
  "Partner Onboarding",
  "Active Partner",
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
    throw new Error(
      Array.isArray(detail)
        ? detail.join(", ")
        : detail || `HighLevel request failed (${response.status})`,
    );
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

function otherPipelineSignature(pipelines: Pipeline[], targetId: string) {
  return pipelines
    .filter((pipeline) => pipeline.id !== targetId)
    .map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      stages: pipeline.stages.map((stage) => ({ id: stage.id, name: stage.name })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function opportunitySignature(opportunities: Opportunity[]) {
  return opportunities
    .map((item) => ({ id: item.id, pipelineStageId: item.pipelineStageId }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { pipeline, pipelines } = await getTargetPipeline();
    const opportunities = await getTargetOpportunities(pipeline.id).catch(() => []);
    return Response.json({
      target: publicPipeline(pipeline),
      otherPipelines: otherPipelineSignature(pipelines, pipeline.id),
      opportunities: opportunities.map((item) => ({
        id: item.id,
        name: item.name,
        pipelineStageId: item.pipelineStageId,
        status: item.status,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Inspection failed" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const before = await getTargetPipeline();
    const currentStages = before.pipeline.stages || [];
    const currentNames = new Set(currentStages.map((stage) => stage.name));
    const alreadyUpdated = DESIRED_STAGES.every((stage) => currentNames.has(stage.name));
    if (!alreadyUpdated) {
      const missingRequired = REQUIRED_EXISTING_SOURCES.filter((name) => !currentNames.has(name));
      if (missingRequired.length) {
        throw new Error(`Cannot safely retain existing stage IDs for: ${missingRequired.join(", ")}`);
      }
    }

    const opportunitiesBefore = await getTargetOpportunities(before.pipeline.id);
    const otherPipelinesBefore = otherPipelineSignature(before.pipelines, before.pipeline.id);
    const desired = DESIRED_STAGES.map((definition, position) => {
      const source = definition.sources
        .map((name) => currentStages.find((stage) => stage.name === name))
        .find(Boolean);
      return { definition, position, source };
    });

    await ghl(`/opportunities/pipelines/${encodeURIComponent(before.pipeline.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: PIPELINE_NAME,
        stages: desired.map((item) => ({
          ...(item.source ? { id: item.source.id } : {}),
          name: item.definition.name,
          position: item.position,
          showInFunnel: item.source?.showInFunnel ?? true,
          showInPieChart: item.source?.showInPieChart ?? true,
        })),
      }),
    });

    const after = await getTargetPipeline();
    const names = after.pipeline.stages
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((stage) => stage.name);
    const expected = DESIRED_STAGES.map((stage) => stage.name);
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Verification failed. Current stages: ${names.join(", ")}`);
    }

    const opportunitiesAfter = await getTargetOpportunities(after.pipeline.id);
    if (
      JSON.stringify(opportunitySignature(opportunitiesBefore)) !==
      JSON.stringify(opportunitySignature(opportunitiesAfter))
    ) {
      throw new Error("Opportunity preservation verification failed");
    }
    if (
      JSON.stringify(otherPipelinesBefore) !==
      JSON.stringify(otherPipelineSignature(after.pipelines, after.pipeline.id))
    ) {
      throw new Error("Another HighLevel pipeline changed unexpectedly");
    }

    return Response.json({
      ok: true,
      target: publicPipeline(after.pipeline),
      preservedOpportunityCount: opportunitiesAfter.length,
      otherPipelineCount: otherPipelinesBefore.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Migration failed" },
      { status: 502 },
    );
  }
}
