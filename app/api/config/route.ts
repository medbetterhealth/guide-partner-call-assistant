import { env } from "cloudflare:workers";

export async function GET() {
  return Response.json({
    calendarUrl: env.GHL_CALENDAR_URL || "",
    pathwayUrl: env.PARTNERSHIP_PATHWAY_URL || "",
    guideVideoUrl: env.GUIDE_VIDEO_URL || "",
    guideFlyerUrl: env.GUIDE_FLYER_URL || "",
  });
}
