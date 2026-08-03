import { env } from "cloudflare:workers";

async function ensureTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guide_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function GET(request: Request) {
  await ensureTable();
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const prefix = url.searchParams.get("prefix");
  if (key) {
    const row = await env.DB.prepare("SELECT value FROM guide_store WHERE key = ?").bind(key).first<{value:string}>();
    return Response.json({ key, value: row?.value ?? null });
  }
  const rows = await env.DB.prepare("SELECT key FROM guide_store WHERE key LIKE ? ORDER BY updated_at DESC").bind(`${prefix ?? ""}%`).all<{key:string}>();
  return Response.json({ keys: rows.results.map(row => row.key) });
}

export async function POST(request: Request) {
  await ensureTable();
  const body = await request.json() as {key?:string; value?:string};
  if (!body.key || typeof body.value !== "string") return Response.json({error:"key and value are required"},{status:400});
  await env.DB.prepare(`INSERT INTO guide_store (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).bind(body.key,body.value).run();
  return Response.json({key:body.key,value:body.value});
}

export async function DELETE(request: Request) {
  await ensureTable();
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return Response.json({error:"key is required"},{status:400});
  await env.DB.prepare("DELETE FROM guide_store WHERE key = ?").bind(key).run();
  return Response.json({key});
}
