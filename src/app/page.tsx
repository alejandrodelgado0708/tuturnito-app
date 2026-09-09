"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { nameKey } from "@/lib/schedule-import";
import { SectorDot, SectorLegend } from "@/components/sector-dot";
import { readSchedule } from "@/lib/read-schedule";

type Single = { from: string; to: string; sector?: import("@/lib/shift-sectors").Sector };
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
function formatTimeInput(v:string){
  const d=v.replace(/\D/g,"").slice(0,4);
  if(!d) return "";
  if(d.length<=2) return d;
  if(d.length===3) return `0${d[0]}:${d.slice(1)}`;
  return d.slice(0,2)+":"+d.slice(2);
}
function blurTime(v:string){
  if(!v) return "";
  if(v.includes(":")){
    const [h,m]=v.split(":");
    return `${h.padStart(2,"0")}:${(m||"00").padEnd(2,"0").slice(0,2)}`;
  }
  return formatTimeInput(v+":00".slice(v.length));
}

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

  const [importReading, setImportReading] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<{excelName:string, shifts:Record<string,Shift>, targetId:string}[]>([]);
  const [importDates, setImportDates] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);

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

  async function authHeader(): Promise<Record<string,string>>{
    try{
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if(session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
    }catch{}
    return {};
  }
  const [copiedId, setCopiedId] = useState<string | null>(null);
  async function apiFetch(url:string, opts: RequestInit = {}){
    const h = await authHeader();
    const headers = { "Content-Type": "application/json", ...(opts.headers as any), ...h } as any;
    return fetch(url, { ...opts, headers });
  }
  async function copyLink(person: Person){
    try{
      const res=await apiFetch(`/api/share-link?id=${person.id}`);
      const j=await res.json();
      if(!res.ok) throw new Error(j.error||"Error");
      await navigator.clipboard.writeText(j.link);
      setCopiedId(person.id);
      setTimeout(()=>setCopiedId(null), 2000);
    }catch(e:any){ alert(e.message); }
  }
  async function fetchMembers(){
    setLoading(true);
    try{
      const res = await apiFetch("/api/members");
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
    await apiFetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: pid, shifts: newShifts})});
  }
  function handleSave(){
    if(!editing) return;
    const previous = normalize(people.find(p=>p.id===editing.pid)?.shifts[editing.date]);
    const sector = Array.isArray(previous) ? previous[0]?.sector : undefined;
    const arr: Single[]=[];
    if(editFrom || editTo) arr.push({from:editFrom, to:editTo, ...(sector ? {sector} : {})});
    if(editFrom2 || editTo2) arr.push({from:editFrom2, to:editTo2, ...(sector ? {sector} : {})});
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
      const res = await apiFetch("/api/members",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:n, email:e, role:inviteRole})});
      const j = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(j.error || "No se pudo crear");
      const inv = await apiFetch("/api/invite",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email:e, name:n, role:inviteRole})});
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
    await apiFetch(`/api/members?id=${id}`,{method:"DELETE"});
  }
  async function renamePerson(id:string, name:string){
    const n=name.trim(); if(!n) return;
    setPeople(p=>p.map(x=>x.id===id?{...x,name:n}:x));
    await apiFetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, name:n})});
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
      await apiFetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: drag.pid, shifts: {...src.shifts, [drag.date]:targetVal, [targetDate]:moving}})});
    } else {
      const srcShifts={...src.shifts}; delete (srcShifts as any)[drag.date];
      const dstShifts={...dst.shifts, [targetDate]:moving};
      setPeople(prev=> prev.map(p=>{
        if(p.id===drag.pid) return {...p, shifts: srcShifts};
        if(p.id===targetPid) return {...p, shifts: dstShifts};
        return p;
      }));
      await apiFetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: drag.pid, shifts: srcShifts})});
      await apiFetch("/api/members",{method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id: targetPid, shifts: dstShifts})});
    }
    setDrag(null);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>){
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setImportReading(true);
    setImportErrorMsg(null);
    setImportWarnings([]);
    try {
      const result = await readSchedule(file, Number(start.slice(0, 4)), Number(start.slice(5, 7)));
      if (!result.rows.length) throw new Error("No se detectaron horarios con fechas válidas. Verificá que se vean el mes, Fecha, Colaborador y los horarios. " + result.warnings.join(" "));
      setImportRows(result.rows.map(row => {
        const matches = people.filter(person => nameKey(person.name) === nameKey(row.excelName) || nameKey(person.email ?? "") === nameKey(row.excelName));
        return { ...row, targetId: matches.length === 1 ? matches[0].id : "new" };
      }));
      setImportDates(result.dates);
      setImportWarnings(result.warnings);
      setImportOpen(true);
    } catch (error) {
      setImportErrorMsg(error instanceof Error ? error.message : "No se pudo leer el documento.");
    } finally {
      setImportReading(false);
      input.value = "";
    }
  }
  async function confirmImport(){
    setImportLoading(true);
    const toImport = importRows.filter(r=>r.targetId!=="skip");
    for(const row of toImport){
      if(row.targetId==="new"){
        const email = `${row.excelName.toLowerCase().replace(/\s+/g,".")}@import.local`;
        await apiFetch("/api/members",{method:"POST", body: JSON.stringify({name: row.excelName, email, role:"own", shifts: row.shifts})});
      } else {
        const person = people.find(p=>p.id===row.targetId);
        if(!person) continue;
        const merged = {...person.shifts, ...row.shifts};
        await apiFetch("/api/members",{method:"PATCH", body: JSON.stringify({id: row.targetId, shifts: merged})});
      }
      }
    setImportLoading(false);
    setImportOpen(false);
    await fetchMembers();
    const firstValid=importDates.find(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
    if(firstValid){
      const lastValid = importDates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).at(-1)!;
      setStart(firstValid);
      setDays(Math.round((Date.parse(lastValid) - Date.parse(firstValid)) / 86400000) + 1);
    }
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
    const header=["Nombre",...dates];
    const ex1=["Ana García", ...dates.map((_,i)=> i===2?"Franco": i===6?"08:00-12:00 / 14:00-18:00" : "08:00-16:00")];
    const ex2=["Carlos Pérez", ...dates.map((_,i)=> i===1?"Franco": i===4?"Franco":"14:00-22:00")];
    const ws=XLSX.utils.aoa_to_sheet([header, ex1, ex2, Array(header.length).fill("")]);
    ws["!cols"]=[{wch:20}, ...dates.map(()=>({wch:13}))];
    const ws2=XLSX.utils.aoa_to_sheet([
      ["Instrucciones Tuturnito"],
      ["1. Columna A = Nombre de la persona"],
      ["2. Columnas siguientes = fechas en formato YYYY-MM-DD (ej: "+dates[0]+")"],
      ["3. Celdas: 08:00-16:00 | 08:00-12:00 / 14:00-18:00 (cortado) | Franco | vacío"],
      ["4. Guarda e importa con Importar Excel/PDF/Imagen"],
      ["5. Luego asigna a quién derivar cada fila"],
    ]);
    ws2["!cols"]=[{wch:60}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Plantilla");
    XLSX.utils.book_append_sheet(wb,ws2,"Instrucciones");
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
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" onChange={handleImport} className="hidden"/>
            <button disabled={importReading} onClick={()=>fileRef.current?.click()} className="text-xs sm:text-sm px-4 py-2 rounded-lg bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 font-medium">{importReading ? "Leyendo documento..." : "Importar Excel/PDF/Imagen"}</button>
            <button onClick={handleExport} className="text-xs sm:text-sm px-4 py-2 rounded-lg bg-[#02B681] text-white hover:bg-[#02996f] font-medium">Exportar</button>
            {userEmail && <span className="hidden lg:inline text-xs text-zinc-500 max-w-[150px] truncate">{userEmail}</span>}
            <button onClick={async()=>{ const s=createClient(); await s.auth.signOut(); router.push("/login"); }} className="text-xs sm:text-sm px-3 py-2 rounded-lg border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200">Salir</button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-4 flex flex-wrap gap-3 items-end bg-white border border-zinc-200 rounded-xl shadow-sm mt-4">
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
        <div className="hidden sm:block bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm mt-[10px]">
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
                        <button onClick={()=>copyLink(person)} title="Copiar link sin registro" className={`shrink-0 p-1.5 rounded-lg border text-xs ${copiedId===person.id?"bg-green-100 border-green-300 text-green-700":"bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"} hidden sm:inline-flex`}>{copiedId===person.id?"✓":"🔗"}</button>
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
                                <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editFrom} onChange={e=>setEditFrom(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                                <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editTo} onChange={e=>setEditTo(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="flex-1 h-px bg-zinc-200"/>cortado<span className="flex-1 h-px bg-zinc-200"/></div>
                              <div className="flex gap-1">
                                <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editFrom2} onChange={e=>setEditFrom2(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
                                <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editTo2} onChange={e=>setEditTo2(formatTimeInput(e.target.value))} className="w-full border-2 border-zinc-200 rounded-lg px-1.5 py-1.5 text-xs bg-white text-zinc-900 focus:border-[#02B681] focus:outline-none"/>
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
                                <div key={i} className="flex items-center gap-1"><SectorDot sector={s.sector}/>{s.from || "--:--"}<span className="opacity-60">—</span>{s.to || "--:--"}</div>
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
          <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-wrap gap-3 text-xs text-zinc-600 items-center">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#02B681] inline-block"/> Turno</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-zinc-300 inline-block"/> Libre — clic para editar</span>
            <span className="hidden sm:inline-flex items-center gap-1 text-zinc-300">·</span>
            <SectorLegend />
            <span className="ml-auto hidden sm:inline">Arrastra un turno a otra celda para moverlo · Clic para editar horas</span>
          </div>
        </div>

        <div className="sm:hidden space-y-3 mt-[10px]">
          {visiblePeople.map(person=>(
            <div key={person.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
              <div className="px-3 py-2.5 border-b border-zinc-100 flex items-center gap-2 bg-zinc-50/50">
                <div className="h-8 w-8 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-bold text-xs">{person.name.slice(0,2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{person.name}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{person.email}</div>
                </div>
                <button onClick={()=>copyLink(person)} className={`p-1.5 rounded-lg border text-xs ${copiedId===person.id?"bg-green-100 border-green-300 text-green-700":"bg-white border-zinc-200 text-zinc-500"}`}>{copiedId===person.id?"✓":"🔗"}</button>
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
                          <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editFrom} onChange={e=>setEditFrom(formatTimeInput(e.target.value))} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editTo} onChange={e=>setEditTo(formatTimeInput(e.target.value))} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          <div className="flex gap-1">
                            <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editFrom2} onChange={e=>setEditFrom2(formatTimeInput(e.target.value))} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                            <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength={5} value={editTo2} onChange={e=>setEditTo2(formatTimeInput(e.target.value))} className="w-full border border-zinc-200 rounded px-1 py-1 text-xs bg-white text-zinc-900"/>
                          </div>
                          <button onClick={handleSave} className="bg-[#02B681] text-white rounded text-xs py-1 font-semibold">Guardar</button>
                          <button onClick={()=>{updateShift(person.id,iso,null); setEditing(null);}} className="bg-red-50 border border-red-200 text-red-600 rounded text-xs py-1 font-bold">Franco</button>
                          <button onClick={()=>setEditing(null)} className="text-xs text-zinc-500">×</button>
                        </div>
                      ) : isFranco ? (
                        <button onClick={()=>openEdit(person.id,iso)} className="w-full flex-1 rounded bg-red-100 border-2 border-red-300 text-red-700 text-xs font-extrabold flex items-center justify-center tracking-wide min-h-[48px]">FRANCO</button>
                      ) : n ? (
                        <button onClick={()=>openEdit(person.id,iso)} className="w-full flex-1 rounded bg-[#02B681] text-white text-[11px] font-semibold flex flex-col items-center justify-center leading-tight p-1">
                          {n.map((s,i)=>(<span key={i}><SectorDot sector={s.sector}/>{s.from}—{s.to}</span>))}
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
          <div className="bg-white border border-zinc-200 rounded-lg p-3"><b>Importar:</b> Excel, PDF o imagen con mes, fechas y colaboradores. Admite bloques repetidos y turnos como &quot;08:00-16:00&quot;, &quot;8 a 12 / 16 a 20&quot; o &quot;FRANCO&quot;.</div>
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
                <button onClick={async()=>{ await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className={`px-4 py-2 rounded-lg text-sm font-semibold shrink-0 ${copied?"bg-green-600 text-white":"bg-[#02B681] text-white hover:bg-[#02996f]"}`}>{copied?"Copiado!":"Copiar"}</button>
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

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={()=>setImportOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-zinc-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-3 border-b border-zinc-100">
              <h2 className="text-lg font-bold text-zinc-900">Importar — Asignar horarios</h2>
              <SectorLegend/>
              <p className="text-sm text-zinc-600 mt-2">Revisá las fechas y los horarios antes de confirmar.</p>
              {importWarnings.length > 0 && <ul className="mt-2 max-h-32 overflow-auto text-sm text-amber-800 list-disc pl-5" role="status">{importWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
              <p className="text-sm text-zinc-500 mt-1">Detectadas {importRows.length} personas. Elige a quién derivar cada fila (o No importar).</p>
              <p className="text-xs text-zinc-400 mt-1">Fechas detectadas: {importDates.join(", ")}</p>
            </div>
            <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
              {importRows.map((row, idx)=>(
                <div key={idx} className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-zinc-900">{row.excelName}</span>
                    <span className="text-xs text-zinc-500">· {Object.keys(row.shifts).length} días</span>
                    <span className="ml-auto text-xs text-zinc-400 hidden sm:block">{Object.entries(row.shifts).slice(0,2).map(([d,s])=>d+":"+(s===null?"Franco":Array.isArray(s)?(s as any).map((x:any)=>x.from+"-"+x.to).join("/"):(s as any).from+"-"+(s as any).to)).join(" · ")}</span>
                  </div>
                  <label className="text-xs font-semibold text-zinc-700">Derivar a</label>
                  <select value={row.targetId} onChange={e=> setImportRows(r=> r.map((x,i)=> i===idx?{...x, targetId:e.target.value}:x))} className="mt-1 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white text-zinc-900">
                    <option value="skip">— No importar —</option>
                    <option value="new">+ Crear nuevo — {row.excelName}</option>
                    {people.map(p=>(
                      <option key={p.id} value={p.id}>{p.name} — {p.email} {p.name.toLowerCase()===row.excelName.toLowerCase()?"(sugerido)":""}</option>
                    ))}
                  </select>
                  <details className="mt-3 text-xs text-zinc-700">
                    <summary className="cursor-pointer font-semibold">Ver todos los horarios detectados</summary>
                    <dl className="mt-2 grid grid-cols-2 gap-2">
                      {Object.entries(row.shifts).sort(([a], [b])=>a.localeCompare(b)).map(([date, shift])=>(
                        <div key={date} className="rounded border border-zinc-200 bg-white p-2">
                          <dt className="font-semibold">{date}</dt>
                          <dd><SectorDot sector={shift === null ? undefined : (Array.isArray(shift) ? shift[0]?.sector : shift.sector)}/>{shift === null ? "Franco" : (Array.isArray(shift) ? shift : [shift]).map(s=>s.to ? `${s.from}–${s.to}` : s.from).join(" / ")}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex gap-2 justify-end">
              <button onClick={()=>setImportOpen(false)} className="px-4 py-2 rounded-lg border border-zinc-200 bg-white text-sm">Cancelar</button>
              <button onClick={confirmImport} disabled={importLoading} className="px-5 py-2 rounded-lg bg-[#02B681] text-white text-sm font-semibold hover:bg-[#02996f] disabled:opacity-50">{importLoading?"Importando...":"Confirmar ("+importRows.filter(r=>r.targetId!=="skip").length+")"}</button>
            </div>
          </div>
        </div>
      )}

      {importErrorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={()=>setImportErrorMsg(null)} className="absolute inset-0 bg-black/40 backdrop-blur-sm"/>
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg border border-zinc-200 overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-lg font-bold text-zinc-900">No se pudo leer</h2>
              <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap leading-relaxed">{importErrorMsg}</p>
              <p className="text-xs text-zinc-500 mt-3">Tip: recortá solo la tabla (sin bordes blancos), con buena luz y sin inclinación. También podés subir el Excel original si lo tenés.</p>
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end gap-2">
              <button onClick={()=>setImportErrorMsg(null)} className="px-5 py-2 rounded-lg bg-[#02B681] text-white text-sm font-semibold">Entendido</button>
              <label className="px-5 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-semibold cursor-pointer">Reintentar<input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden" onChange={(e)=>{ setImportErrorMsg(null); handleImport(e as any); }} /></label>
            </div>
          </div>
        </div>
      )}

      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · {new Date().getFullYear()}</footer>
    </div>
  );
}
