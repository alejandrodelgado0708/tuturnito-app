"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams } from "next/navigation";
import * as XLSX from "xlsx";

type Single={from:string,to:string, sector?:string};
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

  const canUpload=invite?.can_upload!==false;

  async function updateShift(pid:string, date:string, shift:any){
    const res=await fetch("/api/share-update",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({token, memberId: pid, date, shift})});
    if(!res.ok){ const j=await res.json(); alert(j.error); return; }
    setMembers(prev=>prev.map(p=> p.id===pid? {...p, shifts:{...p.shifts, [date]: shift===undefined? undefined : shift} } as any : p));
    if(shift===undefined){
      setMembers(prev=>prev.map(p=>{ if(p.id!==pid) return p; const c={...p.shifts}; delete c[date]; return {...p, shifts:c}; }));
    }
  }
  function handleSave(){
    if(!editing) return;
    const arr:Single[]=[];
    if(editFrom||editTo) arr.push({from:editFrom,to:editTo});
    if(editFrom2||editTo2) arr.push({from:editFrom2,to:editTo2});
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
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={async(e)=>{
            const f=e.target.files?.[0]; if(!f) return;
            alert("Importar por link: sube el archivo y se asignará a tu usuario ("+invite.email+")");
            e.target.value="";
          }}/>
          <button disabled={!canUpload} onClick={()=>fileRef.current?.click()} className={`text-xs sm:text-sm px-4 py-2 rounded-lg border font-medium ${!canUpload?"bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed":"bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"}`}>Importar</button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 py-4 flex-1">
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
                          : n ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className={`w-full rounded-lg px-2 py-2 text-xs font-semibold flex flex-col items-center gap-0.5 ${canUpload?"bg-[#02B681] text-white":"bg-zinc-300 text-zinc-500"}`}>{n.map((s,i)=><span key={i}>{s.from}—{s.to}</span>)} {n.length===2&&<span className="text-[8px] opacity-70">cortado</span>}</button>
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
                      : n ? <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full flex-1 rounded bg-[#02B681] text-white text-[11px] font-semibold p-1">{n.map((s,i)=><span key={i}>{s.from}—{s.to}</span>)}</button>
                      : <button disabled={!canUpload} onClick={()=>canUpload&&openEdit(person.id,iso)} className="w-full flex-1 rounded border border-dashed text-zinc-400 text-xs">+</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · link {token.slice(0,8)}</footer>
    </div>
  );
}
