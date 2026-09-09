import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request){
  const {searchParams}=new URL(req.url);
  const token=searchParams.get("token");
  if(!token) return NextResponse.json({error:"Falta token"},{status:400});
  const svc=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!);
  const {data: invite}=await svc.from("share_invites").select("*").eq("token", token).maybeSingle();
  if(!invite) return NextResponse.json({error:"Link no válido"},{status:404});
  const {data: members}=await svc.from("team_members").select("*").eq("owner_id", invite.owner_id).order("created_at");
  if(!members) return NextResponse.json({error:"Sin miembros"},{status:404});
  let visible=members;
  if(invite.role==="own") visible=members.filter((m:any)=>m.email?.toLowerCase()===invite.email.toLowerCase());
  return NextResponse.json({invite, members: visible, allMembers: members});
}
