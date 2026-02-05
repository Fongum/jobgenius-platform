/**
 * Bootstrap script to create the first admin account.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/create-admin.ts <email> <password> [name]
 *
 * Or set environment variables directly:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/create-admin.ts <email> <password> [name]
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Try to load .env.local if env vars are missing
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local not found, rely on environment
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Set them in .env.local or pass them as environment variables.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAdmin() {
  const [email, password, name] = process.argv.slice(2);

  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email> <password> [name]");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  console.log(`Creating admin account for ${email}...`);

  // 1. Create Supabase auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      user_type: "am",
      name: name ?? email,
    },
  });

  if (authError) {
    console.error("Failed to create auth user:", authError.message);
    process.exit(1);
  }

  console.log(`Auth user created: ${authData.user.id}`);

  // 2. Check if an account_managers row already exists for this email
  const { data: existing } = await supabaseAdmin
    .from("account_managers")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) {
    // Update existing row
    const { error: updateError } = await supabaseAdmin
      .from("account_managers")
      .update({
        auth_id: authData.user.id,
        name: name ?? email,
        role: "admin",
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Failed to update account_managers row:", updateError.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      process.exit(1);
    }

    console.log(`Updated existing account_managers row (${existing.id}) with admin role.`);
  } else {
    // Insert new row
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("account_managers")
      .insert({
        email,
        name: name ?? email,
        auth_id: authData.user.id,
        role: "admin",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert account_managers row:", insertError.message);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      process.exit(1);
    }

    console.log(`Created account_managers row (${inserted.id}) with admin role.`);
  }

  console.log("\nAdmin account created successfully!");
  console.log(`  Email: ${email}`);
  console.log(`  Role:  admin`);
  console.log("\nYou can now sign in at /login");
}

createAdmin().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
