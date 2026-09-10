import { createClient } from "@supabase/supabase-js";

export default async function PublicPage({params}:{params: Promise<{slug:string}>}){
  const {slug}=await params;
  const svc=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!);
  let link:any=null;
  let bySlug=await svc.from("public_links").select("*").eq("slug", slug).maybeSingle();
  if(bySlug.data) link=bySlug.data;
  else {
    const byToken=await svc.from("public_links").select("*").eq("token", slug).maybeSingle();
    if(byToken.data) link=byToken.data;
  }
  if(!link) return <div className="min-h-screen grid place-items-center bg-[#fafafa] p-6"><div className="bg-white border rounded-2xl p-8 max-w-md w-full text-center">Link no encontrado</div></div>;
  const {data: members}=await svc.from("team_members").select("*").eq("owner_id", link.owner_id).order("created_at");
  const start=new Date().toISOString().slice(0,10);
  const dates=Array.from({length:7},(_,i)=>{const d=new Date(); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10)});
  function fmt(d:string){ const [y,m,day]=d.split("-"); return `${day}/${m}`; }
  const DAY=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      <header className="sticky top-0 bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3">
        <img src="/logo-horizontal.png" alt="TuTurnito" className="h-8 w-auto"/>
        <span className="ml-2 text-xs bg-[#02B681]/10 text-[#02B681] px-2 py-1 rounded-full border">Público · {members?.length||0} personas</span>
        <span className="ml-auto text-xs text-zinc-500">/{slug}</span>
      </header>
      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 py-6 flex-1">
        <div className="bg-white border rounded-xl p-4 mb-4 text-center">
          <h1 className="text-lg font-bold">Horarios compartidos</h1>
          <p className="text-sm text-zinc-500">Vista pública — solo lectura</p>
        </div>
        <div className="hidden sm:block bg-white rounded-xl border overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead><tr className="bg-zinc-50 border-b"><th className="sticky left-0 bg-zinc-50 p-3 text-left min-w-[200px] border-r">Persona</th>{dates.map(d=>{const wd=new Date(d).getDay(); return <th key={d} className="p-3 text-center min-w-[130px] border-r"><div className="text-xs text-zinc-500">{DAY[wd]}</div><div className="font-semibold">{fmt(d)}</div></th>})}</tr></thead>
              <tbody>
                {(members||[]).map((p:any)=>(
                  <tr key={p.id} className="border-b">
                    <td className="sticky left-0 bg-white p-3 border-r"><div className="flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center text-xs font-bold">{p.name.slice(0,2).toUpperCase()}</div><div><div className="text-sm font-semibold">{p.name}</div><div className="text-xs text-zinc-500">{p.email}</div></div></div></td>
                    {dates.map(iso=>{
                      const s=p.shifts?.[iso];
                      const isFranco=s===null;
                      const arr=Array.isArray(s)?s:s?[s]:null;
                      return <td key={iso} className="p-2 border-r text-center h-[68px]">{isFranco?<div className="bg-red-50 border border-red-200 text-red-600 rounded-lg py-2 text-xs font-bold">Franco</div>:arr?<div className="bg-[#02B681] text-white rounded-lg py-2 text-xs font-semibold">{arr.map((x:any,i:number)=><div key={i}>{x.from}—{x.to}</div>)}</div>:<div className="border border-dashed rounded-lg py-4 text-xs text-zinc-400">—</div>}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sm:hidden space-y-3 mt-3">
          {(members||[]).map((p:any)=>(
            <div key={p.id} className="bg-white rounded-xl border overflow-hidden">
              <div className="px-3 py-2 border-b bg-zinc-50/50 flex items-center gap-2"><div className="h-8 w-8 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center text-xs font-bold">{p.name.slice(0,2).toUpperCase()}</div><div><div className="text-sm font-semibold">{p.name}</div><div className="text-xs text-zinc-500">{p.email}</div></div></div>
              <div className="p-2 grid grid-cols-3 gap-2">
                {dates.map(iso=>{
                  const s=p.shifts?.[iso]; const isFranco=s===null; const arr=Array.isArray(s)?s:s?[s]:null;
                  return <div key={iso} className="rounded-lg border p-1.5 flex flex-col items-center gap-1 min-h-[70px] bg-white"><div className="text-[10px] font-bold text-zinc-500">{DAY[new Date(iso).getDay()]}</div><div className="text-[11px] font-semibold">{fmt(iso)}</div>{isFranco?<div className="w-full flex-1 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-bold grid place-items-center">FRANCO</div>:arr?<div className="w-full flex-1 rounded bg-[#02B681] text-white text-[11px] font-semibold grid place-items-center">{arr.map((x:any,i:number)=><span key={i}>{x.from}—{x.to}</span>)}</div>:<div className="w-full flex-1 rounded border border-dashed text-zinc-400 text-xs grid place-items-center">—</div>}</div>
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · público</footer>
    </div>
  );
}
