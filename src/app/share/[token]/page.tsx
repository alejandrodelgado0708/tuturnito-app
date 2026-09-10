"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { readSchedule } from "@/lib/read-schedule";
import { nameKey, mergeImports, type ImportRow, type ShiftPart } from "@/lib/schedule-import";
import { SectorDot, SectorLegend } from "@/components/sector-dot";

type Single=ShiftPart;
type Shift=Single|Single[]|null;
function normalize(s:any):Single[]|null|undefined{
  if(s===undefined) return undefined;
  if(s===null) return null;
  if(Array.isArray(s)) return s.length?s:undefined;
  if(s.from!==undefined) return [s];
  return undefined;
}
const DAY_NAMES=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
function toISO(d:Date){return d.toISOString().slice(0,10)}
function addDays(d:Date,n:number){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function parseISO(s:string){const [y,m,dd]=s.split("-").map(Number);return new Date(y,m-1,dd)}
function fmtDate(d:Date){return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`}
function isWeekend(iso:string){const d=parseISO(iso);return d.getDay()===0||d.getDay()===6}
function formatTimeInput(v:string){
  const d=v.replace(/\D/g,"").slice(0,4);
  if(!d) return "";
  if(d.length<=2) return d;
  if(d.length===3) return `0${d[0]}:${d.slice(1)}`;
  return d.slice(0,2)+":"+d.slice(2);
}
export default function SharePage(){
  const params=useParams() as any;
  const token=params?.token as string;
  const [invite,setInvite]=useState<any>(null);
  const [members,setMembers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [start,setStart]=useState(()=>toISO(new Date()));
  const [days,setDays]=useState(7);
  const [editing,setEditing]=useState<{pid:string,date:string}|null>(null);
  const [editFrom,setEditFrom]=useState(""); const [editTo,setEditTo]=useState(""); const [editFrom2,setEditFrom2]=useState(""); const [editTo2,setEditTo2]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);
  const [importOpen,setImportOpen]=useState(false);
  const [importRows,setImportRows]=useState<(ImportRow & {targetId:string})[]>([]);
  const [importDates,setImportDates]=useState<string[]>([]);
  const [importLoading,setImportLoading]=useState(false);
  const [importReading,setImportReading]=useState(false);
  const [importWarnings,setImportWarnings]=useState<string[]>([]);
  const [importError,setImportError]=useState<string|null>(null);

  const dates=useMemo(()=>Array.from({length:days},(_,i)=>toISO(addDays(parseISO(start),i))),[start,days]);

  async function load(){
    setLoading(true);
    const res=await fetch(`/api/share-data?token=${token}`);
    const j=await res.json();
    if(!res.ok){ setError(j.error||"Error"); setLoading(false); return; }
    setInvite(j.invite); setMembers(j.members);
    setLoading(false);
  }
  useEffect(()=>{ if(token) load(); },[token]);

  const canUpload=!!invite && invite.can_upload!==false;
  const importTarget=members.find(m=>nameKey(m.email ?? "")===nameKey(invite?.email ?? ""));

  async function updateShift(pid:string, date:string, shift:any){
    if(!canUpload) return;
    const res=await fetch("/api/share-update",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({token, memberId: pid, date, shift})});
    if(!res.ok){ const j=await res.json(); alert(j.error); return; }
    setMembers(prev=>prev.map(p=> p.id===pid? {...p, shifts:{...p.shifts, [date]: shift===undefined? undefined : shift} } as any : p));
    if(shift===undefined){
      setMembers(prev=>prev.map(p=>{ if(p.id!==pid) return p; const c={...p.shifts}; delete c[date]; return {...p, shifts:c}; }));
    }
  }
  function handleSave(){
    if(!editing || !canUpload) return;
    const previous=normalize(members.find(p=>p.id===editing.pid)?.shifts[editing.date]);
    const sector=Array.isArray(previous)?previous[0]?.sector:undefined;
    const arr:Single[]=[];
    if(editFrom||editTo) arr.push({from:editFrom,to:editTo,...(sector?{sector}:{})});
    if(editFrom2||editTo2) arr.push({from:editFrom2,to:editTo2,...(sector?{sector}:{})});
    let v:any=undefined;
    if(arr.length===0) v=undefined;
    else if(arr.length===1) v=arr[0];
    else v=arr;
    updateShift(editing.pid, editing.date, v);
    setEditing(null);
  }
  function openEdit(pid:string, date:string){
    const s=members.find((p:any)=>p.id===pid)?.shifts[date];
    const n=normalize(s);
    if(Array.isArray(n)){
      setEditFrom(n[0]?.from||""); setEditTo(n[0]?.to||""); setEditFrom2(n[1]?.from||""); setEditTo2(n[1]?.to||"");
    } else { setEditFrom(""); setEditTo(""); setEditFrom2(""); setEditTo2(""); }
    setEditing({pid,date});
  }
  async function confirmImportShare(){
    if(!canUpload || !importTarget || importLoading) return;
    const selected=importRows.filter(row=>row.targetId===importTarget.id);
    if(!selected.length) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const combined=mergeImports(selected.map(row=>({rows:[{excelName:importTarget.name,shifts:row.shifts}],dates:Object.keys(row.shifts),warnings:[]})));
      const res=await fetch("/api/share-update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,memberId:importTarget.id,shifts:{...importTarget.shifts,...combined.rows[0].shifts}})});
      if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error||"No se pudieron guardar los horarios.");}
      const first=combined.dates[0],last=combined.dates.at(-1);
      if(first && last){setStart(first);setDays(Math.round((Date.parse(last)-Date.parse(first))/86400000)+1);}
      setImportOpen(false);
      await load();
    } catch(error) {
      setImportError(error instanceof Error?error.message:"No se pudieron guardar los horarios.");
    } finally {setImportLoading(false);}
  }
  async function handleImportShare(e: React.ChangeEvent<HTMLInputElement>){
    const input=e.currentTarget;
    const file=input.files?.[0];
    if(!file) return;
    setImportError(null);
    setImportWarnings([]);
    if(!canUpload){setImportError("No tenés permiso para subir horarios.");input.value="";return;}
    if(!importTarget){setImportError("No se encontró la persona asociada a tu enlace. Contactá al administrador.");input.value="";return;}
    setImportReading(true);
    try {
      const result=await readSchedule(file,Number(start.slice(0,4)),Number(start.slice(5,7)));
      if(!result.rows.length) throw new Error("No se detectaron horarios con fechas válidas. " + result.warnings.join(" "));
      setImportRows(result.rows.map(row=>({
        ...row,
        targetId:result.rows.length===1 || nameKey(row.excelName)===nameKey(importTarget.name) || nameKey(row.excelName)===nameKey(importTarget.email) ? importTarget.id : "skip",
      })));
      setImportDates(result.dates);
      setImportWarnings(result.warnings);
      setImportOpen(true);
    } catch(error) {
      setImportError(error instanceof Error?error.message:"No se pudo leer el documento.");
    } finally {setImportReading(false);input.value="";}
  }

  if(loading) return <div className="min-h-screen grid place-items-center bg-zinc-50 p-6">Cargando...</div>;
  if(error) return <div className="min-h-screen grid place-items-center bg-zinc-50 p-6"><div className="bg-white border border-zinc-200 rounded-2xl p-8 max-w-md w-full text-center">{error}</div></div>;
  if(!invite) return null;

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <img src="/logo-horizontal.png" alt="TuTurnito" className="h-7 sm:h-8 w-auto" />
        <span className="hidden sm:inline-flex ml-2 text-xs bg-[#02B681]/10 text-[#02B681] px-2 py-1 rounded-full border border-[#02B681]/20">{members.length} personas · {days} días</span>
        <span className={`ml-auto text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full truncate max-w-[150px] sm:max-w-none ${invite.can_upload===false?"bg-amber-100 text-amber-700 border border-amber-200":"bg-zinc-900 text-white"}`}>{invite.role==="all"?"Ve todos":"Solo tu horario"} · {invite.email} {invite.can_upload===false?"· Solo ver":""}</span>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 py-4 flex flex-wrap gap-3 items-end bg-white border border-zinc-200 rounded-xl shadow-sm mt-4">
        <div className="flex gap-2 items-end">
          <label className="flex flex-col gap-1"><span className="text-xs font-medium text-zinc-600">Inicio</span><input type="date" value={start} onChange={e=>setStart(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white"/></label>
          <div className="flex gap-1">{[7,14,30].map(n=><button key={n} onClick={()=>setDays(n)} className={`px-3 py-2 rounded-lg text-sm border ${days===n?"bg-[#02B681] text-white border-[#02B681]":"bg-white border-zinc-200"}`}>{n}d</button>)}</div>
          <button onClick={()=>setStart(toISO(new Date()))} className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm">Hoy</button>
        </div>
        <div className="ml-auto flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleImportShare}/>
          <button disabled={!canUpload || importReading || importLoading} onClick={()=>fileRef.current?.click()} className={`text-xs sm:text-sm px-4 py-2 rounded-lg border font-medium ${!canUpload?"bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed":"bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>{importReading ? "Leyendo documento..." : "Importar Excel/PDF/Imagen"}</button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 py-4 flex-1">
        {importError && !importOpen && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{importError}</p>}
        {!canUpload && <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">Solo lectura — no tenés permiso para subir horarios. Contactá al administrador.</div>}

        <div className="hidden sm:block bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm mt-[10px]">
          <div className="overflow-auto">
            <table className="w-full text-[15px] border-collapse min-w-[900px]">
              <thead><tr className="bg-zinc-50 border-b border-zinc-200"><th className="sticky left-0 z-10 bg-zinc-50 text-left p-3.5 font-semibold text-zinc-700 min-w-[220px] border-r">Persona</th>{dates.map(iso=>{const d=parseISO(iso); const isWE=isWeekend(iso); return <th key={iso} className={`p-3 text-center min-w-[148px] border-r ${isWE?"bg-[#02B681]/10":""}`}><div className={`text-xs ${isWE?"text-[#02B681]":"text-zinc-500"}`}>{DAY_NAMES[d.getDay()]}</div><div className="font-semibold">{fmtDate(d)}</div></th>})}</tr></thead>
              <tbody>
                {members.map((person:any)=>(
                  <tr key={person.id} className="border-b border-zinc-100">
                    <td className="sticky left-0 z-10 bg-white p-3 border-r border-zinc-200"><div className="flex items-center gap-2"><div className="h-9 w-9 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-semibold text-xs">{person.name.slice(0,2).toUpperCase()}</div><div><div className="text-sm font-semibold truncate">{person.name}</div><div className="text-[11px] text-zinc-500 truncate">{person.email}</div></div></div></td>
                    {dates.map(iso=>{
                      const hasShift=person.shifts && iso in person.shifts;
                      const shift=hasShift?person.shifts[iso]:undefined;
                      const isFranco=hasShift && shift===null;
                      const n=normalize(shift);
                      const editingHere=editing?.pid===person.id && editing?.date===iso;
                      return (
                        <td key={iso} className="p-2.5 border-r border-zinc-100 text-center align-middle h-[88px]">
                          {editingHere ? (
                            <div className="relative z-10 flex flex-col gap-1.5 bg-white p-2 rounded-xl border-2 border-[#02B681] shadow-lg min-w-[170px]">
                              <div className="flex gap-1"><input type="text" placeholder="HH:MM" value={editFrom} onChange={e=>setEditFrom(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs"/><input type="text" placeholder="HH:MM" value={editTo} onChange={e=>setEditTo(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs"/></div>
                              <div className="flex gap-1"><input type="text" placeholder="HH:MM" value={editFrom2} onChange={e=>setEditFrom2(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs"/><input type="text" placeholder="HH:MM" value={editTo2} onChange={e=>setEditTo2(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs"/></div>
                              <div className="flex gap-1 pt-1"><button onClick={handleSave} className="flex-1 bg-[#02B681] text-white rounded-lg text-xs py-2 font-semibold">Guardar</button><button onClick={()=>setEditing(null)} className="px-3 border border-zinc-200 bg-white rounded-lg text-xs py-2">×</button></div>
                              <button onClick={()=>{updateShift(person.id,iso,null); setEditing(null);}} className="w-full bg-red-50 border border-red-200 rounded-lg text-xs py-2 font-bold text-red-600">Franco</button>
                              <button onClick={()=>{updateShift(person.id,iso,undefined); setEditing(null);}} className="w-full text-[11px] text-zinc-500">Limpiar</button>
                            </div>
                          ) : isFranco ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full h-[68px] rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">Franco</button>
                          : n ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className={`w-full rounded-lg px-2 py-2 text-xs font-semibold flex flex-col items-center gap-0.5 ${canUpload?"bg-[#02B681] text-white":"bg-zinc-300 text-zinc-500"}`}>{n.map((s,i)=><span key={i} className="flex items-center justify-center"><SectorDot sector={s.sector}/>{s.from}—{s.to}</span>)} {n.length===2&&<span className="text-[8px] opacity-70">cortado</span>}</button>
                          : <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className={`w-full h-[68px] rounded-lg border text-xs grid place-items-center ${canUpload?"border-dashed border-zinc-300 text-zinc-400":"bg-zinc-100 border-zinc-200 text-zinc-400"}`}>+</button>
                          }
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <SectorLegend/>
        <div className="sm:hidden space-y-3 mt-[10px]">
          {members.map((person:any)=>(
            <div key={person.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-3 py-2.5 border-b flex items-center gap-2 bg-zinc-50/50"><div className="h-8 w-8 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-bold text-xs">{person.name.slice(0,2).toUpperCase()}</div><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{person.name}</div><div className="text-[11px] text-zinc-500 truncate">{person.email}</div></div></div>
              <div className="p-2 grid grid-cols-3 gap-2">
                {dates.map(iso=>{
                  const hasShift=person.shifts && iso in person.shifts;
                  const shift=hasShift?person.shifts[iso]:undefined;
                  const isFranco=hasShift && shift===null;
                  const n=normalize(shift);
                  const d=parseISO(iso);
                  const editingHere=editing?.pid===person.id && editing?.date===iso;
                  return (
                    <div key={iso} className="rounded-lg border p-1.5 flex flex-col items-center gap-1 min-h-[86px] bg-white border-zinc-200">
                      <div className="text-[10px] font-bold text-zinc-500">{DAY_NAMES[d.getDay()]}</div><div className="text-[11px] font-semibold">{fmtDate(d)}</div>
                      {editingHere ? <div className="w-full flex flex-col gap-1"><input placeholder="HH:MM" value={editFrom} onChange={e=>setEditFrom(formatTimeInput(e.target.value))} className="w-full border rounded px-1 py-1 text-xs"/><input placeholder="HH:MM" value={editTo} onChange={e=>setEditTo(formatTimeInput(e.target.value))} className="w-full border rounded px-1 py-1 text-xs"/><button onClick={handleSave} className="bg-[#02B681] text-white rounded text-xs py-1">Guardar</button></div>
                      : isFranco ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full flex-1 rounded bg-red-100 border border-red-200 text-red-700 text-xs font-bold">FRANCO</button>
                      : n ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full flex-1 rounded bg-[#02B681] text-white text-[11px] font-semibold p-1">{n.map((s,i)=><span key={i} className="flex items-center justify-center"><SectorDot sector={s.sector}/>{s.from}—{s.to}</span>)}</button>
                      : <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full flex-1 rounded border border-dashed text-zinc-400 text-xs">+</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={()=>!importLoading&&setImportOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-zinc-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-3 border-b"><h2 className="text-lg font-bold">Importar — Asignar</h2><p className="text-sm text-zinc-500">Elegí la fila que corresponde a {importTarget?.name}. Solo se guardarán horarios en tu usuario.</p><p className="text-xs text-zinc-400">Fechas: {importDates.join(", ")}</p></div>
            <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
              <SectorLegend/>
              {importError && <p role="alert" className="text-sm text-red-700">{importError}</p>}
              {importWarnings.length>0 && <ul role="status" className="list-disc pl-5 text-sm text-amber-800">{importWarnings.map(w=><li key={w}>{w}</li>)}</ul>}
              {importRows.map((row,idx)=>(
                <div key={idx} className="border rounded-xl p-3 bg-zinc-50/50">
                  <div className="text-sm font-semibold">{row.excelName} · {Object.keys(row.shifts).length} días</div>
                  <select aria-label={`Importar fila de ${row.excelName}`} disabled={importLoading} value={row.targetId} onChange={e=>setImportRows(r=>r.map((x,i)=>i===idx?{...x,targetId:e.target.value}:x))} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="skip">— No importar —</option>
                    {importTarget && <option value={importTarget.id}>Mi horario: {importTarget.name}</option>}
                  </select>
                  <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">Ver horarios detectados</summary><dl className="mt-2 grid grid-cols-2 gap-2">{Object.entries(row.shifts).sort(([a],[b])=>a.localeCompare(b)).map(([date,shift])=><div key={date} className="rounded border bg-white p-2"><dt className="font-semibold">{date}</dt><dd>{shift===null?"Franco":(Array.isArray(shift)?shift:[shift]).map((part,i)=><div key={i}><SectorDot sector={part.sector}/>{part.from}{part.to?"–"+part.to:""}</div>)}</dd></div>)}</dl></details>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t flex gap-2 justify-end">
              <button onClick={()=>!importLoading&&setImportOpen(false)} className="px-4 py-2 rounded-lg border bg-white text-sm">Cancelar</button>
              <button onClick={confirmImportShare} disabled={importLoading || !canUpload || !importRows.some(row=>row.targetId===importTarget?.id)} className="px-5 py-2 rounded-lg bg-[#02B681] text-white text-sm font-semibold disabled:opacity-50">{importLoading?"Importando...":"Confirmar ("+importRows.filter((r:any)=>r.targetId!=="skip").length+")"}</button>
            </div>
          </div>
        </div>
      )}

      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · link {token.slice(0,8)}</footer>
    </div>
  );
}
