import { createFileRoute } from "@tanstack/react-router";

// Webhook endpoint for the PocketBuddy companion Android app.
// Parses UPI notifications and inserts transactions on behalf of users.
// Authenticates by pairing_code in the body (per-user secret set during onboarding).

interface IngestBody {
  user_id?: string;
  pairing_code?: string;
  device_name?: string;
  source?: string;
  type?: string;
  body?: string;
  timestamp?: string;
}

function parseUpiBody(text: string): { amount: number | null; merchant: string | null } {
  const amountMatch =
    text.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:[.,][0-9]+)?)/i) ??
    text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:rupees|rs)/i);
  const amount = amountMatch ? Math.round(parseFloat(amountMatch[1].replace(",", "")) * 100) : null;

  let merchant: string | null = null;
  const toMatch =
    text.match(/(?:paid|debited)[^a-z0-9]*(?:₹|Rs\.?|INR)?\s*[0-9.,]+\s*(?:to|at)\s+([A-Za-z0-9_ .&\-/]+?)(?:\s+(?:on|via|from|for|UPI|Ref|Bal|—)|$|\.)/i) ??
    text.match(/(?:to|at)\s+([A-Z][A-Z0-9_\- ]{3,40})/);
  if (toMatch) merchant = toMatch[1].trim().replace(/\s+/g, "_").slice(0, 80);

  // UPI/MerchantId pattern
  const upiMatch = text.match(/UPI\/([A-Z0-9_\-]+)/i);
  if (!merchant && upiMatch) merchant = upiMatch[1];

  return { amount, merchant };
}

export const Route = createFileRoute("/api/public/ingest-notification")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        };
        let body: IngestBody;
        try {
          body = (await request.json()) as IngestBody;
        } catch {
          return new Response(JSON.stringify({ status: "bad_json" }), { status: 400, headers: cors });
        }

        if (!body.user_id || !body.body) {
          return new Response(JSON.stringify({ status: "missing_fields" }), { status: 400, headers: cors });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: profile, error: pErr } = await supabaseAdmin
          .from("profiles")
          .select("id, pairing_code, companion_paired")
          .eq("id", body.user_id)
          .maybeSingle();

        if (pErr || !profile) {
          return new Response(JSON.stringify({ status: "user_not_found" }), { status: 404, headers: cors });
        }
        if (profile.pairing_code && body.pairing_code && profile.pairing_code !== body.pairing_code) {
          return new Response(JSON.stringify({ status: "invalid_pairing_code" }), { status: 401, headers: cors });
        }

        const deviceName = body.device_name ?? "Unknown Device";
        const src = body.source ?? "UPI";

        // Insert pending log
        const { data: logRow } = await supabaseAdmin
          .from("companion_sync_log")
          .insert({
            user_id: body.user_id,
            device_name: deviceName,
            notification_source: src,
            raw_body: body.body,
            processing_status: "pending",
          })
          .select()
          .single();

        const { amount, merchant } = parseUpiBody(body.body);

        if (!amount || !merchant) {
          if (logRow) {
            await supabaseAdmin
              .from("companion_sync_log")
              .update({ processing_status: "failed" })
              .eq("id", logRow.id);
          }
          return new Response(JSON.stringify({ status: "parse_failed" }), { status: 200, headers: cors });
        }

        // Look up merchant directory
        const { data: md } = await supabaseAdmin
          .from("merchant_directory")
          .select("display_name, category")
          .eq("raw_string", merchant)
          .maybeSingle();

        const txnSource = body.type === "sms" ? "companion_sms" : "companion_notification";

        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: body.user_id,
            amount,
            raw_merchant_string: merchant,
            mapped_merchant_name: md?.display_name ?? null,
            category: md?.category ?? null,
            is_mapped: !!md,
            source: txnSource,
            raw_notification_body: body.body,
          })
          .select()
          .single();

        if (logRow) {
          await supabaseAdmin
            .from("companion_sync_log")
            .update({
              processing_status: "parsed",
              parsed_amount: amount,
              parsed_merchant: merchant,
            })
            .eq("id", logRow.id);
        }

        await supabaseAdmin
          .from("profiles")
          .update({
            companion_paired: true,
            companion_device_name: deviceName,
            companion_last_sync: new Date().toISOString(),
          })
          .eq("id", body.user_id);

        return new Response(
          JSON.stringify({ status: "ok", transaction_id: txn?.id ?? null }),
          { status: 200, headers: cors },
        );
      },
    },
  },
});
