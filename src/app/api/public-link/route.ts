import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

async function getUser(){
  const cs=await cookies();
  const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {cookies:{getAll(){return cs.getAll()}, setAll(){}}});
  const {data:{user}}=await supabase.auth.getUser();
  return user;
}
function svc(){ return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!); }

export async function GET(){
  const user=await getUser();
  if(!user) return NextResponse.json({error:"No auth"},{status:401});
  const {data}=await svc().from("public_links").select("*").eq("owner_id", user.id).maybeSingle();
  return NextResponse.json(data||null);
}
export async function POST(req:Request){
  const user=await getUser();
  if(!user) return NextResponse.json({error:"No auth"},{status:401});
  const body=await req.json().catch(()=>({}));
  let slug=(body.slug||"").toLowerCase().trim().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,30);
  const s=svc();
  const {data: existing}=await s.from("public_links").select("*").eq("owner_id", user.id).maybeSingle();
  if(existing){
    if(slug && slug!==existing.slug){
      const {data: taken}=await s.from("public_links").select("id").eq("slug", slug).maybeSingle();
      if(taken) return NextResponse.json({error:"Ese nombre ya está en uso"},{status:400});
      const {data, error}=await s.from("public_links").update({slug}).eq("owner_id", user.id).select().single();
      if(error) return NextResponse.json({error:error.message},{status:400});
      return NextResponse.json(data);
    }
    return NextResponse.json(existing);
  }
  if(!slug) slug=null;
  else {
    const {data: taken}=await s.from("public_links").select("id").eq("slug", slug).maybeSingle();
    if(taken) return NextResponse.json({error:"Ese nombre ya está en uso"},{status:400});
  }
  const token=Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6);
  const {data, error}=await s.from("public_links").insert({owner_id: user.id, slug: slug||null, token}).select().single();
  if(error) return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json(data);
}
export async function DELETE(){
  const user=await getUser();
  if(!user) return NextResponse.json({error:"No auth"},{status:401});
  await svc().from("public_links").delete().eq("owner_id", user.id);
  return NextResponse.json({ok:true});
}
