"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

type Single = { from: string; to: string };
type Shift = Single | Single[] | null;
type Role = "own" | "all";
type Person = { id: string; name: string; email?: string; role?: Role; shifts: Record<string, Shift>; owner_id?: string };
function normalize(s: Shift | undefined): Single[] | null | undefined {
  if (s === undefined) return undefined;
  if (s === null) return null;
  if (Array.isArray(s)) return s.length ? s : undefined;
  if ((s as Single).from || (s as Single).to) return [s as Single];
  return undefined;
}

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DAY_FULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function parseISO(s: string) { const [y,m,dd]=s.split("-").map(Number); return new Date(y,m-1,dd); }
function fmtDate(d: Date) { return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; }
function isWeekend(iso:string){ const d=parseISO(iso); return d.getDay()===0||d.getDay()===6; }

export default function Home(){
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [start, setStart] = useState(()=> toISO(new Date()));
  const [days, setDays] = useState(7);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{pid:string; date:string}|null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editFrom2, setEditFrom2] = useState("");
  const [editTo2, setEditTo2] = useState("");
  const [drag, setDrag] = useState<{pid:string; date:string}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("own");
  const [inviteError, setInviteError] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const dates = useMemo(()=>{
    const s=parseISO(start);
    return Array.from({length:days},(_,i)=> toISO(addDays(s,i)));
  },[start,days]);

  const visiblePeople = useMemo(()=>{
    if(!userEmail) return people;
    const me = people.find(p=>p.email?.toLowerCase()===userEmail.toLowerCase());
    if(me?.role==="own") return people.filter(p=>p.id===me.id);
    return people;
  },[people,userEmail]);

  const isViewerOwn = useMemo(()=>{
    if(!userEmail) return false;
    const me = people.find(p=>p.email?.toLowerCase()===userEmail.toLowerCase());
    return me?.role==="own";
  },[people,userEmail]);

  async function fetchMembers(){
    setLoading(true);
    try{
      const res = await fetch("/api/members");
      if(res.ok){ const data = await res.json(); setPeople(Array.isArray(data)?data:[]); }
      else { const t=await res.text(); console.error(t); setPeople([]); }
    }catch{ setPeople([]); }
    setLoading(false);
  }

  useEffect(()=>{
    const supabase = createClient();
    supabase.auth.getUser().then(({data})=> setUserEmail(data.user?.email ?? null));
    fetchMembers();
  },[]);

  async function updateShift(pid:string, date:string, shift:Shift | undefined){
    const person = people.find(p=>p.id===pid);
    if(!person) return;
    const newShifts = {...person.shifts};
    if(shift===undefined) delete newShifts[date];
    else (newShifts as any)[date]=shift;
    setPeople(p=>p.map(per=> per.id===pid? {...per, shifts:newShifts}:per));
    await fetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: pid, shifts: newShifts})});
  }
  function handleSave(){
    if(!editing) return;
    const arr: Single[]=[];
    if(editFrom || editTo) arr.push({from:editFrom, to:editTo});
    if(editFrom2 || editTo2) arr.push({from:editFrom2, to:editTo2});
    let v: Shift | undefined;
    if(arr.length===0) v=undefined;
    else if(arr.length===1) v=arr[0];
    else v=arr;
    updateShift(editing.pid, editing.date, v);
    setEditing(null);
  }
  function openEdit(pid:string, date:string){
    const s=people.find(p=>p.id===pid)?.shifts[date];
    const n=normalize(s);
    if(Array.isArray(n)){
      setEditFrom(n[0]?.from ?? ""); setEditTo(n[0]?.to ?? "");
      setEditFrom2(n[1]?.from ?? ""); setEditTo2(n[1]?.to ?? "");
    } else {
      setEditFrom(""); setEditTo(""); setEditFrom2(""); setEditTo2("");
    }
    setEditing({pid,date});
  }

  async function handleInvite(){
    setInviteError("");
    const n=inviteName.trim();
    const e=inviteEmail.trim().toLowerCase();
    if(!n) return setInviteError("Ingresa el nombre");
    if(!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setInviteError("Email inválido");
    if(people.some(p=>p.email?.toLowerCase()===e)) return setInviteError("Ese email ya está invitado");
    setInviteSending(true);
    try{
      const res = await fetch("/api/members",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:n, email:e, role:inviteRole})});
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || "No se pudo crear");
      const inv = await fetch("/api/invite",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email:e, name:n, role:inviteRole})});
      const ij = await inv.json().catch(()=>({}));
      if(!inv.ok) console.warn(ij.error);
      await fetchMembers();
      setInviteName(""); setInviteEmail(""); setInviteRole("own"); setInviteOpen(false);
      if(ij.inviteLink){ setInviteLink(ij.inviteLink); setShowLinkModal(true); setCopied(false); }
    }catch(err:any){
      setInviteError(err.message || "Error al invitar");
    }finally{ setInviteSending(false); }
  }

  async function removePerson(id:string){
    setPeople(p=>p.filter(x=>x.id!==id));
    await fetch(`/api/members?id=${id}`,{method:"DELETE"});
  }
  async function renamePerson(id:string, name:string){
    const n=name.trim(); if(!n) return;
    setPeople(p=>p.map(x=>x.id===id?{...x,name:n}:x));
    await fetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, name:n})});
  }

  function onDragStart(pid:string, date:string){ setDrag({pid,date}); }
  async function onDrop(targetPid:string, targetDate:string){
    if(!drag) return;
    if(drag.pid===targetPid && drag.date===targetDate) return;
    const src = people.find(p=>p.id===drag.pid);
    const dst = people.find(p=>p.id===targetPid);
    if(!src || !dst) return;
    const moving = src.shifts[drag.date] ?? null;
    const targetVal = dst.shifts[targetDate] ?? null;
    if(drag.pid===targetPid){
      const c={...src.shifts}; c[drag.date]=targetVal; c[targetDate]=moving;
      setPeople(prev=> prev.map(p=> p.id===drag.pid? {...p, shifts:c}:p));
      await fetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: drag.pid, shifts: {...src.shifts, [drag.date]:targetVal, [targetDate]:moving}})});
    } else {
      const srcShifts={...src.shifts}; delete (srcShifts as any)[drag.date];
      const dstShifts={...dst.shifts, [targetDate]:moving};
      setPeople(prev=> prev.map(p=>{
        if(p.id===drag.pid) return {...p, shifts: srcShifts};
        if(p.id===targetPid) return {...p, shifts: dstShifts};
        return p;
      }));
      await fetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: drag.pid, shifts: srcShifts})});
      await fetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: targetPid, shifts: dstShifts})});
    }
    setDrag(null);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload = async (ev)=>{
      const data=ev.target?.result;
      const wb=XLSX.read(data,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json<(string|number)[]>(ws,{header:1, defval:""});
      if(json.length<2) return;
      const header=json[0] as string[];
      const dateCols=header.slice(1);
      const parsedDates=dateCols.map(h=>{
        const s=String(h).trim();
        if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d=new Date(s);
        if(!isNaN(d.getTime())) return toISO(d);
        return s;
      });
      for(const r of (json.slice(1) as string[][]).filter(r=> String(r[0]).trim())){
        const shifts:Record<string,Shift>={};
        dateCols.forEach((_,i)=>{
          const raw=String(r[i+1]??"").trim();
          if(!raw || raw.toLowerCase()==="franco" || raw.toLowerCase()==="libre" || raw==="-" || raw==="—") shifts[parsedDates[i]]=null;
          else if(raw.includes("/")){
            const parts=raw.split("/").map(s=>s.trim()).filter(Boolean);
            const arr=parts.map(p=>{
              const [a,b]=p.split("-").map(s=>s.trim());
              return {from:a||"", to:b||""};
            }).filter(x=>x.from||x.to);
            shifts[parsedDates[i]]= arr.length===1?arr[0]:arr;
          }
          else if(raw.includes("-")){
            const [a,b]=raw.split("-").map(s=>s.trim());
            shifts[parsedDates[i]]={from:a,to:b};
          } else shifts[parsedDates[i]]={from:raw,to:""};
        });
        await fetch("/api/members",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:String(r[0]).trim(), email: `${String(r[0]).trim().toLowerCase().replace(/\s+/g,".")}@import.local`, role:"own"})}).catch(()=>{});
      }
      await fetchMembers();
      const firstValid=parsedDates.find(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
      if(firstValid){ setStart(firstValid); setDays(parsedDates.length); }
    };
    reader.readAsArrayBuffer(f);
    e.target.value="";
  }

  function handleExport(){
    const header=["Nombre", ...dates];
    const rows=visiblePeople.map(p=>[p.name, ...dates.map(d=>{
      const s=p.shifts[d]; if(s===null) return "Franco"; if(!s) return ""; 
      const arr = Array.isArray(s) ? s : [s];
      return arr.map(x=>`${x.from}-${x.to}`).join(" / ");
    })]);
    const ws=XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"]=[{wch:20}, ...dates.map(()=>({wch:13}))];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Turnos");
    XLSX.writeFile(wb,`tuturnito-${start}.xlsx`);
  }
  function downloadTemplate(){
    const tplDates=Array.from({length:7},(_,i)=> toISO(addDays(new Date(),i)));
    const ws=XLSX.utils.aoa_to_sheet([["Nombre",...tplDates],["Ejemplo Ana","08:00-16:00","14:00-22:00","LIBRE","","","08:00-12:00",""]]);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Plantilla");
    XLSX.writeFile(wb,"plantilla-tuturnito.xlsx");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-200">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-horizontal.png" alt="TuTurnito" className="h-9 w-auto object-contain" />
            <span className="hidden sm:inline-flex ml-2 text-xs bg-[#02B681]/10 text-[#02B681] px-2 py-1 rounded-full border border-[#02B681]/20"> {visiblePeople.length} personas · {days} días</span>
            {isViewerOwn && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full border border-amber-200">Solo tu horario</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={downloadTemplate} className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-700">Plantilla</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden"/>
            <button onClick={()=>fileRef.current?.click()} className="text-xs sm:text-sm px-4 py-2 rounded-lg bg-zinc-900 text-white border border-zinc-900 hover:bg-zinc-800 font-medium">Importar Excel</button>
            <button onClick={handleExport} className="text-xs sm:text-sm px-4 py-2 rounded-lg bg-[#02B681] text-white hover:bg-[#02996f] font-medium">Exportar</button>
            {userEmail && <span className="hidden lg:inline text-xs text-zinc-500 max-w-[150px] truncate">{userEmail}</span>}
            <button onClick={async()=>{ const s=createClient(); await s.auth.signOut(); router.push("/login"); }} className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200">Salir</button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-4 flex flex-wrap gap-3 items-end">
        <div className="flex gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Inicio</span>
            <input type="date" value={start} onChange={e=>setStart(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white text-zinc-900 placeholder:text-zinc-400"/>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-600">Rango</span>
            <div className="flex gap-1">
              {[7,14,30].map(n=>(
                <button key={n} onClick={()=>setDays(n)} className={`px-3 py-2 rounded-lg text-sm border ${days===n?"bg-[#02B681] text-white border-[#02B681]":"bg-white border-zinc-200"}`}>{n}d</button>
              ))}
            </div>
          </div>
          <button onClick={()=>setStart(toISO(new Date()))} className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm">Hoy</button>
          <div className="hidden sm:flex gap-1 ml-2">
            <button onClick={()=>setStart(toISO(addDays(parseISO(start),-days)))} className="h-9 w-9 grid place-items-center border border-zinc-200 rounded-lg bg-white text-zinc-900 placeholder:text-zinc-400">‹</button>
            <button onClick={()=>setStart(toISO(addDays(parseISO(start),days)))} className="h-9 w-9 grid place-items-center border border-zinc-200 rounded-lg bg-white text-zinc-900 placeholder:text-zinc-400">›</button>
          </div>
        </div>

        <div className="flex gap-2 items-end ml-auto">
          <button onClick={()=>setInviteOpen(true)} className="px-5 py-2.5 rounded-lg bg-[#02B681] text-white text-sm font-semibold hover:bg-[#02996f] shadow-sm">+ Agregar persona</button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 pb-8 flex-1">
        {loading ? <div className="p-12 text-center text-zinc-500">Cargando tablero...</div> : (
        <>
        <div className="hidden sm:block bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
          <div className="overflow-auto">
            <table className="w-full text-[15px] border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="sticky left-0 z-10 bg-zinc-50 text-left p-2 sm:p-3.5 font-semibold text-zinc-700 min-w-[140px] sm:min-w-[220px] border-r border-zinc-200 text-[12px] sm:text-[14px]">Persona</th>
                  {dates.map(iso=>{
                    const d=parseISO(iso);
                    const isWE=d.getDay()===0||d.getDay()===6;
                    const isToday=iso===toISO(new Date());
                    return (
                      <th key={iso} className={`p-2 sm:p-3 text-center min-w-[110px] sm:min-w-[148px] border-r border-zinc-100 last:border-0 ${isWE?"bg-[#02B681]/10":""} ${isToday?"bg-amber-50":""}`}>
                        <div className={`text-xs ${isWE?"text-[#02B681]":"text-zinc-500"}`}>{DAY_NAMES[d.getDay()]}</div>
                        <div className={`font-semibold ${isToday?"text-amber-700":"text-zinc-900"}`}>{fmtDate(d)}</div>
                        <div className="text-[11px] text-zinc-400 font-normal">{DAY_FULL[d.getDay()]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visiblePeople.map(person=>(
                  <tr key={person.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                    <td className="sticky left-0 z-10 bg-white p-2 sm:p-3 border-r border-zinc-200">
                      <div className="flex items-center gap-1.5 sm:gap-2.5 group">
                        <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-semibold text-[11px] sm:text-xs shrink-0">{person.name.slice(0,2).toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <input defaultValue={person.name} onBlur={e=>renamePerson(person.id,e.target.value)} className="font-medium text-[12px] sm:text-[14px] text-zinc-800 bg-transparent border border-transparent hover:border-zinc-200 focus:border-[#02B681]/40 focus:outline-none rounded px-1 sm:px-1.5 py-0.5 w-full truncate"/>
                          {person.email && <div className="text-[10px] sm:text-[11px] text-zinc-500 px-1 sm:px-1.5 truncate">{person.email}</div>}
                          {person.role && <span className={`inline-block ml-1 sm:ml-1.5 mt-1 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full border font-medium ${person.role==="all"?"bg-[#02B681]/10 text-[#02B681] border-[#02B681]/20":"bg-zinc-100 text-zinc-600 border-zinc-200"}`}>{person.role==="all"?"Ve todos":"Solo su horario"}</span>}
                        </div>
                        {!isViewerOwn && <button onClick={()=>removePerson(person.id)} className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 px-1 shrink-0">×</button>}
                      </div>
                    </td>
                    {dates.map(iso=>{
                      const hasShift = iso in person.shifts;
                      const shift = hasShift ? person.shifts[iso] : undefined;
                      const isFranco = hasShift && shift === null;
                      const editingHere=editing?.pid===person.id && editing?.date===iso;
                      const weekend=isWeekend(iso);
                      return (
                        <td key={iso} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(person.id, iso)}
                          className={`p-1.5 sm:p-2.5 border-r border-zinc-100 last:border-0 text-center align-middle h-[72px] sm:h-[88px] ${weekend?"bg-[#02B681]/[0.03]":""} ${drag?.pid===person.id&&drag?.date===iso?"opacity-40":""}`}>
                          {editingHere ? (
                            <div className="relative z-10 flex flex-col gap-1.5 bg-white p-2 rounded-xl border-2 border-[#02B681] shadow-lg min-w-[170px]">
                              <div className="text-[11px] font-bold text-zinc-700">Horario</div>
                              <div className="flex gap-1">
                                <input type="time" value={editFrom} onChange={e=>setEditFrom(e.target.value)} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                                <input type="time" value={editTo} onChange={e=>setEditTo(e.target.value)} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="flex-1 h-px bg-zinc-200"/>cortado<span className="flex-1 h-px bg-zinc-200"/></div>
                              <div className="flex gap-1">
                                <input type="time" value={editFrom2} onChange={e=>setEditFrom2(e.target.value)} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                                <input type="time" value={editTo2} onChange={e=>setEditTo2(e.target.value)} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                              </div>
                              <div className="flex gap-1 pt-1">
                                <button onClick={handleSave} className="flex-1 bg-[#02B681] text-white rounded-lg text-xs py-2 font-semibold hover:bg-[#02996f]">Guardar</button>
                                <button onClick={()=>setEditing(null)} className="px-3 border border-zinc-200 bg-white rounded-lg text-xs py-2 hover:bg-zinc-50">×</button>
                              </div>
                              <button onClick={()=>{updateShift(person.id,iso,null); setEditing(null);}} className="w-full bg-red-50 border border-red-200 rounded-lg text-xs py-2 font-bold text-red-600 hover:bg-red-100">Franco</button>
                              <button onClick={()=>{updateShift(person.id,iso,undefined); setEditing(null);}} className="w-full text-[11px] text-zinc-500 hover:text-zinc-700">Limpiar</button>
                            </div>
                          ) : isFranco ? (
                            <button onClick={()=>openEdit(person.id,iso)} className="w-full h-[56px] sm:h-[68px] rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 text-[11px] sm:text-xs font-bold grid place-items-center">Franco</button>
                          ) : (()=>{ const n=normalize(shift as Shift); if(!n) return (
                            <button onClick={()=>openEdit(person.id,iso)} draggable={false}
                              className="w-full h-[56px] sm:h-[68px] rounded-lg border border-dashed border-zinc-200 hover:border-[#02B681]/40 hover:bg-[#02B681]/10 text-zinc-400 hover:text-[#02B681] text-xs grid place-items-center font-medium">
                              +
                            </button>
                          ); return (
                            <div draggable={!isViewerOwn || visiblePeople.length===1} onDragStart={()=>onDragStart(person.id,iso)} onClick={()=>openEdit(person.id,iso)}
                              className="cursor-grab active:cursor-grabbing select-none bg-[#02B681] text-white rounded-lg px-1 sm:px-2 py-1.5 sm:py-2 text-[11px] sm:text-[12px] font-semibold shadow-sm hover:bg-[#02996f] flex flex-col items-center leading-tight gap-0.5">
                              {n.map((s,i)=>(
                                <div key={i} className="flex items-center gap-1">{s.from || "--:--"}<span className="opacity-60">—</span>{s.to || "--:--"}</div>
                              ))}
                              {n.length===2 && <span className="text-[9px] opacity-70 -mt-0.5">cortado</span>}
                            </div>
                          );})()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {visiblePeople.length===0 && (
                  <tr><td colSpan={dates.length+1} className="p-12 text-center text-zinc-500">Sin personas. Agrega una invitación. {people.length>0 && isViewerOwn ? "Solo ves tu horario." : ""}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-wrap gap-2 text-xs text-zinc-600">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#02B681] inline-block"/> Turno</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-zinc-300 inline-block"/> Libre — clic para editar</span>
            <span className="ml-auto">Arrastra un turno a otra celda para moverlo · Clic para editar horas</span>
          </div>
        </div>

        <div className="sm:hidden space-y-3">
          {visiblePeople.map(person=>(
            <div key={person.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
              <div className="px-3 py-2.5 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                <div className="h-8 w-8 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-bold text-xs">{person.name.slice(0,2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{person.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{person.email}</div>
                </div>
                {!isViewerOwn && <button onClick={()=>removePerson(person.id)} className="text-zinc-400 px-2">×</button>}
              </div>
              <div className="p-2 grid grid-cols-3 gap-2">
                {dates.map(iso=>{
                  const hasShift = iso in person.shifts;
                  const shift = hasShift ? person.shifts[iso] : undefined;
                  const isFranco = hasShift && shift === null;
                  const n = normalize(shift as Shift);
                  const d=parseISO(iso);
                  const isWE=d.getDay()===0||d.getDay()===6;
                  const editingHere=editing?.pid===person.id && editing?.date===iso;
                  return (
                    <div key={iso} className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 min-h-[86px] ${isWE?"bg-[#02B681]/5 border-[#02B681]/20":"bg-white border-zinc-200"} ${editingHere?"ring-2 ring-[#02B681]":""}`}>
                      <div className={`text-[10px] font-bold ${isWE?"text-[#02B681]":"text-zinc-500"}`}>{DAY_NAMES[d.getDay()]}</div>
                      <div className="text-[11px] font-semibold text-zinc-900">{fmtDate(d)}</div>
                      {editingHere ? (
                        <div className="w-full flex flex-col gap-1">
                          <input type="time" value={editFrom} onChange={e=>setEditFrom(e.target.value)} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          <input type="time" value={editTo} onChange={e=>setEditTo(e.target.value)} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          <div className="flex gap-1">
                            <input type="time" value={editFrom2} onChange={e=>setEditFrom2(e.target.value)} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                            <input type="time" value={editTo2} onChange={e=>setEditTo2(e.target.value)} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          </div>
                          <button onClick={handleSave} className="bg-[#02B681] text-white rounded text-xs py-1 font-semibold">Guardar</button>
                          <button onClick={()=>{updateShift(person.id,iso,null); setEditing(null);}} className="bg-red-50 border border-red-200 text-red-600 rounded text-xs py-1 font-bold">Franco</button>
                          <button onClick={()=>setEditing(null)} className="text-xs text-zinc-500">×</button>
                        </div>
                      ) : isFranco ? (
                        <button onClick={()=>openEdit(person.id,iso)} className="w-full flex-1 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-bold grid place-items-center">Franco</button>
                      ) : n ? (
                        <button onClick={()=>openEdit(person.id,iso)} className="w-full flex-1 rounded bg-[#02B681] text-white text-[11px] font-semibold flex flex-col items-center justify-center leading-tight p-1">
                          {n.map((s,i)=>(<span key={i}>{s.from}—{s.to}</span>))}
                          {n.length===2 && <span className="text-[8px] opacity-70">cortado</span>}
                        </button>
                      ) : (
                        <button onClick={()=>openEdit(person.id,iso)} className="w-full flex-1 rounded border border-dashed border-zinc-300 text-zinc-400 text-xs grid place-items-center">+</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {visiblePeople.length===0 && <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">Sin personas. Agrega una invitación.</div>}
        </div>
        </>
        )}

        <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs text-zinc-600">
          <div className="bg-white border border-zinc-200 rounded-lg p-3"><b>Importar:</b> Excel con columna A = Nombre, columnas siguientes = fechas (YYYY-MM-DD) y celdas con &quot;08:00-16:00&quot; o &quot;LIBRE&quot;.</div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3"><b>Manual:</b> Invita por email y elige si ve solo su horario o todos.</div>
          <div className="bg-white border border-zinc-200 rounded-lg p-3"><b>Drag & drop:</b> Arrastra el bloque verde a otro día/persona para reasignar.</div>
        </div>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={()=>setInviteOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-lg font-bold text-zinc-900">Invitar persona</h2>
              <p className="text-sm text-zinc-500 mt-1">Se agregará al tablero y podrá ver sus horarios según el permiso.</p>
            </div>
            <div className="px-6 py-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-700">Nombre</span>
                <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Ej: Ana García" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#02B681]/30 focus:border-[#02B681]"/>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-700">Email</span>
                <input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="ana@empresa.com" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#02B681]/30 focus:border-[#02B681]"/>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-zinc-700">Permiso</span>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>setInviteRole("own")} className={`p-3 rounded-xl border text-left ${inviteRole==="own"?"bg-[#02B681]/10 border-[#02B681] ring-1 ring-[#02B681]/20":"bg-white border-zinc-200 hover:border-zinc-300"}`}>
                    <div className={`text-sm font-semibold ${inviteRole==="own"?"text-[#02B681]":"text-zinc-800"}`}>Solo su horario</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Ve únicamente su fila</div>
                  </button>
                  <button onClick={()=>setInviteRole("all")} className={`p-3 rounded-xl border text-left ${inviteRole==="all"?"bg-[#02B681]/10 border-[#02B681] ring-1 ring-[#02B681]/20":"bg-white border-zinc-200 hover:border-zinc-300"}`}>
                    <div className={`text-sm font-semibold ${inviteRole==="all"?"text-[#02B681]":"text-zinc-800"}`}>Ver todos</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Ve el tablero completo</div>
                  </button>
                </div>
              </div>
              {inviteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>}
              <p className="text-xs text-zinc-400">Se creará en Supabase y se enviará mail + link sin registro (/share/...).</p>
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex gap-2 justify-end">
              <button onClick={()=>setInviteOpen(false)} className="px-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50">Cancelar</button>
              <button onClick={handleInvite} disabled={inviteSending} className="px-5 py-2 rounded-lg bg-[#02B681] text-white text-sm font-semibold hover:bg-[#02996f] disabled:opacity-50">{inviteSending?"Enviando...":"Invitar"}</button>
            </div>
          </div>
        </div>
      )}

      {showLinkModal && inviteLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={()=>setShowLinkModal(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="h-12 w-12 rounded-full bg-green-100 text-green-600 grid place-items-center mx-auto text-xl">✓</div>
              <h2 className="text-lg font-bold text-zinc-900 mt-3">¡Invitación enviada!</h2>
              <p className="text-sm text-zinc-500 mt-1">Comparte este link. Funciona <b>sin registro</b>.</p>
            </div>
            <div className="px-6 py-4">
              <div className="flex gap-2">
                <input readOnly value={inviteLink} className="flex-1 border border-zinc-200 rounded-lg px-3 py-2.5 text-xs bg-zinc-50 text-zinc-700 focus:outline-none"/>
                <button onClick={async()=>{ await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className={`px-4 py-2 rounded-lg text-sm font-semibold shrink-0 ${copied?"bg-green-600 text-white":"bg-zinc-900 text-white hover:bg-zinc-800"}`}>{copied?"Copiado!":"Copiar"}</button>
              </div>
              <div className="mt-3 flex gap-2">
                <a href={inviteLink} target="_blank" className="flex-1 text-center px-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm hover:bg-zinc-50">Abrir link</a>
                <button onClick={()=>setShowLinkModal(false)} className="flex-1 bg-[#02B681] text-white rounded-lg py-2 text-sm font-semibold hover:bg-[#02996f]">Listo</button>
              </div>
              <p className="text-xs text-zinc-400 mt-3 text-center">También se envió por email.</p>
            </div>
          </div>
        </div>
      )}

      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · {new Date().getFullYear()}</footer>
    </div>
  );
}
