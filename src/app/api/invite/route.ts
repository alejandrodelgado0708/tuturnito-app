import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { email, name, role } = await req.json().catch(() => ({}));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SB_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Copiala desde Supabase Dashboard > Project Settings > API > Secret keys (service_role) y reinicia npm run dev.",
      },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceKey);

  const token = crypto.randomUUID();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || new URL(req.url).origin;
  const inviteLink = `${siteUrl}/share/${token}`;

  const { data: userData } = await supabase.auth.getUser();
  let ownerId: string | null = null;
  try {
    const cookieHeader = (await import("next/headers")).cookies();
    const { createServerClient } = await import("@supabase/ssr");
    const cs = await cookieHeader;
    const sc = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll(){ return cs.getAll(); }, setAll(){} }});
    const { data } = await sc.auth.getUser();
    ownerId = data.user?.id || null;
  } catch {}

  try {
    await supabase.from("share_invites").insert({ token, email: email.toLowerCase(), name, role: role || "own", owner_id: ownerId });
  } catch {}

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/callback`,
    data: { name, role: role || "own", share_token: token, share_link: inviteLink },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, user: data.user?.id, token, inviteLink });
}
