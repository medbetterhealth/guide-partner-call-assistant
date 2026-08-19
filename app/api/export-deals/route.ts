import { env } from "cloudflare:workers";

export async function GET() {
  try {
    // Ensure table exists
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guide_store (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();

    // Get all deal keys
    const result = await env.DB.prepare(
      "SELECT key FROM guide_store WHERE key LIKE ? ORDER BY updated_at DESC"
    ).bind("deals:%").all<{ key: string }>();

    const deals = [];

    // Fetch each deal record
    for (const row of result.results) {
      const dealResult = await env.DB.prepare(
        "SELECT value, updated_at FROM guide_store WHERE key = ?"
      ).bind(row.key).first<{ value: string; updated_at: string }>();

      if (dealResult?.value) {
        try {
          const parsedValue = JSON.parse(dealResult.value);
          deals.push({
            key: row.key,
            value: parsedValue,
            exported_at: new Date().toISOString(),
            updated_at: dealResult.updated_at,
          });
        } catch (e) {
          console.error(`Failed to parse deal ${row.key}:`, e);
          // Skip malformed records
        }
      }
    }

    // Create export bundle
    const exportBundle = {
      export_version: "1.0",
      exported_at: new Date().toISOString(),
      total_records: deals.length,
      records: deals,
      metadata: {
        source: "GUIDE Partner Call Assistant v27",
        environment: "production",
        database_type: "D1-SQLite",
        preserves: [
          "crmContactId",
          "crmOpportunityId",
          "counties",
          "history",
          "createdAt",
          "updatedAt",
          "assignedSalesperson",
          "all_other_fields"
        ],
        warnings: [
          "This export contains production data with sensitive contact information",
          "Imported records will NOT create duplicate GHL contacts (uses existing crmContactId)",
          "Email automations will NOT be triggered on import",
          "History field will be fully preserved"
        ]
      },
    };

    return Response.json(exportBundle, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="guide-deals-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
