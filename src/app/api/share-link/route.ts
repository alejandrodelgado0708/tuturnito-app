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
  const {data: existing}=await svc.from("share_invites").select("*").eq("email", member.email.toLowerCase()).eq("owner_id", member.owner_id).maybeSingle();
  if(existing){
    invite=existing;
  } else {
    const token=crypto.randomUUID();
    const {data: ins, error}=await svc.from("share_invites").insert({token, email:member.email.toLowerCase(), name:member.name, role:member.role||"own", owner_id: member.owner_id}).select().single();
    if(error) return NextResponse.json({error:error.message},{status:400});
    invite=ins;
  }
  const link=`${siteUrl}/share/${invite.token}`;
  return NextResponse.json({link, token: invite.token});
}
