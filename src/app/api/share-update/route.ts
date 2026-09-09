import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request){
  const body=await req.json().catch(()=>({}));
  const {token, memberId, date, shift, shifts, name}=body;
  if(!token) return NextResponse.json({error:"Falta token"},{status:400});
  const svc=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!);
  const {data: invite}=await svc.from("share_invites").select("*").eq("token", token).maybeSingle();
  if(!invite) return NextResponse.json({error:"Link no válido"},{status:404});
  if(invite.can_upload===false) return NextResponse.json({error:"No tenés permiso para subir horarios"},{status:403});
  if(invite.role==="own"){
    const {data: me}=await svc.from("team_members").select("id").eq("email", invite.email.toLowerCase()).eq("owner_id", invite.owner_id).maybeSingle();
    if(me && me.id!==memberId) return NextResponse.json({error:"Solo podés editar tu horario"},{status:403});
  }
  if(shifts!==undefined){
    const {error}=await svc.from("team_members").update({shifts}).eq("id", memberId);
    if(error) return NextResponse.json({error:error.message},{status:400});
  } else if(date!==undefined){
    const {data: member}=await svc.from("team_members").select("shifts").eq("id", memberId).single();
    const cur=(member as any)?.shifts||{};
    const next={...cur};
    if(shift===null || shift===undefined){
      if(shift===null) next[date]=null;
      else delete next[date];
    } else {
      next[date]=shift;
    }
    const {error}=await svc.from("team_members").update({shifts: next}).eq("id", memberId);
    if(error) return NextResponse.json({error:error.message},{status:400});
  } else if(name!==undefined){
    const {error}=await svc.from("team_members").update({name}).eq("id", memberId);
    if(error) return NextResponse.json({error:error.message},{status:400});
  }
  return NextResponse.json({ok:true});
}
