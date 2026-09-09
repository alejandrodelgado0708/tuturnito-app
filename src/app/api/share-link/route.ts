import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function getUser(req?: Request){
  const cs = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {cookies:{getAll(){return cs.getAll()}, setAll(){}}});
  let {data:{user}} = await supabase.auth.getUser();
  if(!user && req){
    const tok=req.headers.get("authorization")?.replace("Bearer ","");
    if(tok){ const {data}=await supabase.auth.getUser(tok); user=data.user; }
  }
  return user;
}

export async function GET(req: Request){
  const user=await getUser(req);
  if(!user) return NextResponse.json({error:"No auth"},{status:401});
  const {searchParams}=new URL(req.url);
  const email=searchParams.get("email")?.toLowerCase();
  const id=searchParams.get("id");
  if(!email && !id) return NextResponse.json({error:"Falta email/id"},{status:400});
  const svc=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!);
  let member:any=null;
  if(id){
    const {data}=await svc.from("team_members").select("*").eq("id",id).single();
    member=data;
  } else if(email){
    const {data}=await svc.from("team_members").select("*").ilike("email",email).eq("owner_id", user.id).maybeSingle();
    member=data;
    if(!member){
      const {data: d2}=await svc.from("team_members").select("*").ilike("email",email).maybeSingle();
      member=d2;
    }
  }
  if(!member) return NextResponse.json({error:"Persona no encontrada"},{status:404});
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:new URL(req.url).origin);
  let invite:any=null;
  const {data: list}=await svc.from("share_invites").select("*").eq("email", member.email.toLowerCase()).eq("owner_id", member.owner_id).order("created_at",{ascending:false}).limit(1);
  const existing=list?.[0];
  if(existing){
    invite=existing;
    if(invite.role!==member.role || (member.can_upload!==undefined && invite.can_upload!==member.can_upload)){
      const upd:any={role: member.role||"own"};
      if(member.can_upload!==undefined) upd.can_upload=member.can_upload;
      let {error:e2}=await svc.from("share_invites").update(upd).eq("id", invite.id);
      if(e2 && e2.message.includes("can_upload")){
        delete upd.can_upload;
        await svc.from("share_invites").update(upd).eq("email", member.email.toLowerCase()).eq("owner_id", member.owner_id);
      } else if(!e2){
        await svc.from("share_invites").update(upd).eq("email", member.email.toLowerCase()).eq("owner_id", member.owner_id);
      }
      invite.role=member.role;
      invite.can_upload=member.can_upload;
    }
  } else {
    const token=crypto.randomUUID();
    const payload:any={token, email:member.email.toLowerCase(), name:member.name, role:member.role||"own", owner_id: member.owner_id};
    if(member.can_upload!==undefined) payload.can_upload=member.can_upload;
    let {data: ins, error}=await svc.from("share_invites").insert(payload).select().single();
    if(error && error.message.includes("can_upload")){
      delete payload.can_upload;
      const r2=await svc.from("share_invites").insert(payload).select().single();
      ins=r2.data; error=r2.error;
    }
    if(error) return NextResponse.json({error:error.message},{status:400});
    invite=ins;
  }
  const link=`${siteUrl}/share/${invite.token}`;
  return NextResponse.json({link, token: invite.token});
}
