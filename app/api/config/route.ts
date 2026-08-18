import { env } from "cloudflare:workers";

type HighLevelCalendar = {
  id?: string;
  isActive?: boolean;
  name?: string;
  slug?: string;
  widgetSlug?: string;
};

const HIGHLEVEL_API = "https://services.leadconnectorhq.com";
const HIGHLEVEL_BOOKING_WIDGET = "https://api.leadconnectorhq.com/widget/booking";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function drErikScore(calendar: HighLevelCalendar) {
  const name = normalize(calendar.name || "");
  const searchable = normalize(
    `${calendar.name || ""} ${calendar.slug || ""} ${calendar.widgetSlug || ""}`,
  );

  if (name === "dr erik") return 100;
  if (name.includes("dr erik")) return 90;
  if (searchable.includes("dr erik")) return 80;
  if (searchable.includes("erik")) return 60;
  return 0;
}

async function getDrErikCalendar() {
  const configuredUrl = env.GHL_CALENDAR_URL?.trim();
  if (configuredUrl) {
    return { name: "Dr. Erik", url: configuredUrl };
  }

  const locationId = env.GHL_LOCATION_ID?.trim();
  const token = env.GHL_PRIVATE_TOKEN?.trim();
  if (!locationId || !token) return null;

  const response = await fetch(
    `${HIGHLEVEL_API}/calendars/?locationId=${encodeURIComponent(locationId)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        Version: "v3",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`HighLevel calendar lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as { calendars?: HighLevelCalendar[] };
  const activeCalendars = (payload.calendars || []).filter(
    (calendar) => calendar.isActive !== false && calendar.id,
  );
  const ranked = activeCalendars
    .map((calendar) => ({ calendar, score: drErikScore(calendar) }))
    .sort((a, b) => b.score - a.score);

  const match = ranked[0]?.score ? ranked[0].calendar : activeCalendars.length === 1 ? activeCalendars[0] : null;
  if (!match?.id) return null;

  return {
    name: match.name || "Dr. Erik",
    url: `${HIGHLEVEL_BOOKING_WIDGET}/${encodeURIComponent(match.id)}`,
  };
}

export async function GET() {
  let calendar: Awaited<ReturnType<typeof getDrErikCalendar>> = null;
  let calendarStatus = "connected";

  try {
    calendar = await getDrErikCalendar();
    if (!calendar) calendarStatus = "not_found";
  } catch {
    calendarStatus = "unavailable";
  }

  return Response.json(
    {
      calendarUrl: calendar?.url || "",
      calendarName: calendar?.name || "",
      calendarStatus,
      pathwayUrl: env.PARTNERSHIP_PATHWAY_URL || "",
      guideVideoUrl: env.GUIDE_VIDEO_URL || "",
      guideFlyerUrl: env.GUIDE_FLYER_URL || "",
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
