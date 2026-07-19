import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

import "../config/loadEnv.js";

function text(value = "") {
  return String(value || "").trim();
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

export function resolveBackendSupabaseConfig(env = process.env) {
  const url = text(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const secretKey = text(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
  const publishableKey = text(env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const key = secretKey || publishableKey;
  const serverWriteCapable = Boolean(secretKey);

  return {
    enabled: boolEnv(env.SUPABASE_ENABLED, Boolean(url && key)),
    configured: Boolean(url && key),
    url,
    key,
    keyType: secretKey ? "server_secret" : publishableKey ? "publishable_read_only" : "missing",
    serverWriteCapable,
    jwksUrl: text(env.SUPABASE_JWKS_URL),
    reason: !url
      ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is missing."
      : !key
        ? "No Supabase key is configured."
        : serverWriteCapable
          ? "Backend Supabase client can write with a server key."
          : "Only a publishable key is configured; storage adapter will use read-only/fallback mode.",
  };
}

export function createBackendSupabaseClient(options = {}) {
  const config = options.config || resolveBackendSupabaseConfig(options.env || process.env);
  if (!config.enabled || !config.configured) {
    return {
      client: null,
      status: "NOT_CONFIGURED",
      config,
      reason: config.reason,
    };
  }

  const client = createSupabaseJsClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-application-name": "crypto-launch-intelligence",
      },
    },
  });

  return {
    client,
    status: config.serverWriteCapable ? "SERVER_WRITE_READY" : "PUBLIC_READ_ONLY",
    config,
    reason: config.reason,
  };
}

export function summarizeBackendSupabaseConfig(env = process.env) {
  const config = resolveBackendSupabaseConfig(env);
  return {
    enabled: config.enabled,
    configured: config.configured,
    hasUrl: Boolean(config.url),
    hasKey: Boolean(config.key),
    keyType: config.keyType,
    serverWriteCapable: config.serverWriteCapable,
    hasJwksUrl: Boolean(config.jwksUrl),
    reason: config.reason,
  };
}
