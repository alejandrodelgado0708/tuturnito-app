import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
  return createClient(url, key);
}

async function getUser(req?: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} },
  });
  let { data: { user } } = await supabase.auth.getUser();
  if (!user && req) {
    const auth = req.headers.get("authorization");
    const token = auth?.replace("Bearer ", "");
    if (token) {
      const { data: d2 } = await supabase.auth.getUser(token);
      user = d2.user;
    }
  }
  return user;
}

export async function GET(req: Request) {
  const user = await getUser(req);
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
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { name, email, role, shifts, can_upload } = body;
  if (!name || !email) return NextResponse.json({ error: "Falta nombre/email" }, { status: 400 });
  const svc = service();
  let payload:any={ owner_id: user.id, name: name.trim(), email: email.toLowerCase().trim(), role: role || "own", shifts: shifts || {}, can_upload: can_upload ?? true };
  let { data, error } = await svc.from("team_members").insert(payload).select().single();
  if(error && error.message.includes("can_upload")){
    delete payload.can_upload;
    const r2=await svc.from("team_members").insert(payload).select().single();
    data=r2.data; error=r2.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id, name, shifts, role, can_upload } = body;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const svc = service();
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (shifts !== undefined) updates.shifts = shifts;
  if (role !== undefined) updates.role = role;
  if (can_upload !== undefined) updates.can_upload = can_upload;
  let { data, error } = await svc.from("team_members").update(updates).eq("id", id).select().single();
  if(error && error.message.includes("can_upload")){
    delete updates.can_upload;
    const r2=await svc.from("team_members").update(updates).eq("id", id).select().single();
    data=r2.data; error=r2.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if(data){
    try{
      const upd:any={};
      if(role!==undefined) upd.role=role;
      if(can_upload!==undefined) upd.can_upload=can_upload;
      if(Object.keys(upd).length) await svc.from("share_invites").update(upd).eq("email", (data as any).email.toLowerCase()).eq("owner_id", (data as any).owner_id);
    }catch{}
  }
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "No auth" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  const svc = service();
  const { error } = await svc.from("team_members").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
