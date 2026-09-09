import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
  return createClient(url, key);
}

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const svc = service();
  const email = user.email?.toLowerCase() || "";

  let ownerId: string | null = user.id;

  const { data: ownTeam } = await svc.from("team_members").select("id").eq("owner_id", user.id).limit(1);
  if (!ownTeam || ownTeam.length === 0) {
    const { data: asMember } = await svc.from("team_members").select("owner_id, role").ilike("email", email).limit(1).maybeSingle();
    if (asMember) ownerId = asMember.owner_id;
  }

  const { data, error } = await svc.from("team_members").select("*").eq("owner_id", ownerId!).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const me = data.find((m: any) => m.email?.toLowerCase() === email);
  if (me?.role === "own") return NextResponse.json(data.filter((m: any) => m.id === me.id));

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name, email, role, shifts } = body;
  if (!name || !email) return NextResponse.json({ error: "Falta nombre/email" }, { status: 400 });
  const svc = service();
  const { data, error } = await svc.from("team_members").insert({ owner_id: user.id, name: name.trim(), email: email.toLowerCase().trim(), role: role || "own", shifts: shifts || {} }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, name, shifts } = body;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const svc = service();
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (shifts !== undefined) updates.shifts = shifts;
  const { data, error } = await svc.from("team_members").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const svc = service();
  const { error } = await svc.from("team_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
