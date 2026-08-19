import { env } from "cloudflare:workers";

interface ExportedDeal {
  key: string;
  value: Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    // Ensure table exists
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS guide_store (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).bind().run();

    const body = await request.json() as {
      records?: ExportedDeal[];
      dry_run?: boolean;
    };

    if (!body.records || !Array.isArray(body.records)) {
      return Response.json(
        { error: "records array is required" },
        { status: 400 }
      );
    }

    const dryRun = body.dry_run === true;
    const results = {
      total_records: body.records.length,
      successful: 0,
      skipped: 0,
      errors: [] as string[],
      imported_keys: [] as string[],
      dry_run: dryRun,
      warnings: [
        "This import does NOT create new GHL contacts (uses existing crmContactId only)",
        "This import does NOT trigger email automations",
        "History field is fully preserved",
        "Timestamps and app-only fields are preserved",
      ],
    };

    for (const deal of body.records) {
      try {
        // Validate required fields
        if (!deal.key || typeof deal.key !== "string") {
          results.errors.push(`Record missing valid key: ${JSON.stringify(deal)}`);
          results.skipped++;
          continue;
        }

        if (!deal.value || typeof deal.value !== "object") {
          results.errors.push(`Record ${deal.key} missing value`);
          results.skipped++;
          continue;
        }

        // Validate critical fields exist
        const value = deal.value as Record<string, unknown>;
        if (!value.crmContactId && !value.agencyName) {
          results.errors.push(
            `Record ${deal.key} missing both crmContactId and agencyName`
          );
          results.skipped++;
          continue;
        }

        if (!dryRun) {
          // Insert or update record (preserves all fields)
          await env.DB.prepare(
            `INSERT INTO guide_store (key, value, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE
             SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
          )
            .bind(deal.key, JSON.stringify(value))
            .run();
        }

        results.imported_keys.push(deal.key);
        results.successful++;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        results.errors.push(`Failed to import ${deal.key}: ${errorMsg}`);
        results.skipped++;
      }
    }

    return Response.json(
      {
        ...results,
        summary: dryRun
          ? `DRY RUN: Would import ${results.successful} records`
          : `Successfully imported ${results.successful} records, skipped ${results.skipped}`,
        next_step: dryRun
          ? "Review results and call again with dry_run=false to actually import"
          : "Import complete. Records are now in guide_store",
      },
      { status: results.successful > 0 ? 200 : 400 }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
        import_status: "failed",
      },
      { status: 500 }
    );
  }
}
