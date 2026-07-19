// src/storage/supabaseClient.js
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

import "../config/loadEnv.js";
import { resolveSupabaseConfig } from "./supabaseSync.js";

export function createScannerSupabaseClient(options = {}) {
  const config = options.config || resolveSupabaseConfig(options.env || process.env);

  if (!config.configured) {
    return {
      client: null,
      config,
      status: "MISSING_CONFIG",
      reason: "SUPABASE_URL and a Supabase key are required.",
    };
  }

  return {
    client: createSupabaseJsClient(config.url, config.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          "x-application-name": "crypto-launch-intelligence",
        },
      },
    }),
    config,
    status: config.serverWriteCapable ? "SERVER_READY" : "PUBLIC_READ_ONLY",
    reason: config.serverWriteCapable
      ? "Server-write Supabase client is configured."
      : "Publishable/anon Supabase client is configured for read/dashboard use only.",
  };
}
