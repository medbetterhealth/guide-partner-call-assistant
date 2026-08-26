import { env } from "cloudflare:workers";

type DealRecord = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  pending: "Sent",
  scheduled: "Sent",
  sent: "Sent",
  accepted: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  read: "Opened",
  clicked: "Clicked",
  failed: "Failed",
  undelivered: "Failed",
  permanent_fail: "Failed",
  temporary_fail: "Failed",
};

const STATUS_RANK: Record<string, number> = {
  "Not sent": 0,
  "No Email": 0,
  "Pending automation": 1,
  Sent: 1,
  Failed: 1,
  Delivered: 2,
  Opened: 3,
  Clicked: 4,
};

function text(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function eventTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  const parsed = new Date(text(value, 100));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function nextStatus(current: string, incoming: string) {
  if (incoming === "Failed" && (STATUS_RANK[current] || 0) >= STATUS_RANK.Delivered) return current;
  return (STATUS_RANK[incoming] || 0) >= (STATUS_RANK[current] || 0) ? incoming : current;
}

export async function POST(request: Request) {
  try {
    const configuredSecret = text(env.GHL_EMAIL_WEBHOOK_SECRET, 500);
    const suppliedSecret = text(request.headers.get("x-guide-webhook-secret"), 500);
    if (!configuredSecret || !safeEqual(configuredSecret, suppliedSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    const nested = body.webhookPayload && typeof body.webhookPayload === "object"
      ? body.webhookPayload as Record<string, unknown>
      : body;
    const contactId = text(body.contactId || nested.contactId, 100);
    const rawStatus = text(body.status || body.event || nested.status || nested.event, 100).toLowerCase().replace(/[\s-]+/g, "_");
    const status = STATUS_LABELS[rawStatus];
    const timestamp = eventTimestamp(body.timestamp || nested.timestamp || body.dateAdded || nested.dateAdded);

    if (!contactId || !/^[A-Za-z0-9_-]+$/.test(contactId)) {
      return Response.json({ error: "A valid contactId is required" }, { status: 400 });
    }
    if (!status) {
      return Response.json({ error: "Unsupported email status" }, { status: 400 });
    }

    const rows = await env.DB.prepare("SELECT key, value FROM guide_store WHERE key LIKE 'deals:%'").all<{ key: string; value: string }>();
    const updates = [];
    for (const row of rows.results) {
      let deal: DealRecord;
      try {
        deal = JSON.parse(row.value) as DealRecord;
      } catch {
        continue;
      }
      if (text(deal.crmContactId, 100) !== contactId) continue;

      const previousStatus = text(deal.emailStatus, 100) || "Not sent";
      deal.emailStatus = nextStatus(previousStatus, status);
      deal.updatedAt = timestamp;
      if (status === "Sent" && !deal.emailSentAt) deal.emailSentAt = timestamp;
      if (status === "Delivered" && !deal.emailDeliveredAt) deal.emailDeliveredAt = timestamp;
      if (status === "Opened") {
        if (!deal.emailOpenedAt) deal.emailOpenedAt = timestamp;
        deal.emailLastOpenedAt = timestamp;
        deal.emailOpenCount = Number(deal.emailOpenCount || 0) + 1;
      }
      if (status === "Clicked") {
        if (!deal.emailDeliveredAt) deal.emailDeliveredAt = timestamp;
        if (!deal.emailOpenedAt) deal.emailOpenedAt = timestamp;
        deal.emailLastClickedAt = timestamp;
        deal.emailClickedAt = deal.emailClickedAt || timestamp;
        deal.emailClickCount = Number(deal.emailClickCount || 0) + 1;
      }
      const history = Array.isArray(deal.history) ? deal.history as Array<Record<string, unknown>> : [];
      history.push({ ts: timestamp, stage: deal.stage, note: `Email status updated automatically to ${status}.` });
      deal.history = history.slice(-250);
      updates.push(env.DB.prepare(
        "UPDATE guide_store SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
      ).bind(JSON.stringify(deal), row.key));
    }

    if (!updates.length) {
      return Response.json({ error: "No matching GUIDE lead was found" }, { status: 404 });
    }
    await env.DB.batch(updates);
    return Response.json({ ok: true, contactId, status, updated: updates.length });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Email status update failed",
    }, { status: 500 });
  }
}
