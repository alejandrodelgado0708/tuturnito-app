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
function normTime(t:string){
  let s=t.trim().replace(/[ʵ’ʼʽʻ′´`]/g,":").replace(/\s+/g," ").toLowerCase();
  s=s.replace(/\s*a\s*/g,"-").replace(/\s*\/\/\s*/g,"/").replace(/\s*\/\s*/g,"/");
  return s;
}
function parseCell(raw:string): any {
  const r=raw.trim();
  if(!r || r==="—" || r==="-") return undefined;
  const up=r.toUpperCase();
  if(up==="FRANCO") return null;
  if(["BANFIELD","PLANTA","ALSINA","ALTO AVELLANEDA","CAPAC.","CAPACITACION","AUSENTE","ENF","SUSPENDIDO","FULL","DIA","DEL","COMERCIO","EMPLEADO","REUNION"].includes(up)) return {from:r, to:""};
  const n=normTime(r);
  if(n.includes("/")){
    const parts=n.split("/").map((p:string)=>p.trim()).filter(Boolean);
    const arr=parts.map((p:string)=>{
      const [a,b]=p.split("-").map((x:string)=>x.trim());
      const fa=a.includes(":")?a:(a?`${a.padStart(2,"0")}:00`:"");
      const fb=b?.includes(":")?b:(b?`${b.padStart(2,"0")}:00`:"");
      return {from:fa, to:fb};
    }).filter((x:any)=>x.from||x.to);
    if(!arr.length) return undefined;
    return arr.length===1?arr[0]:arr;
  }
  if(n.includes("-")){
    const [a,b]=n.split("-").map((x:string)=>x.trim());
    const fa=a.includes(":")?a:(a?`${a.padStart(2,"0")}:00`:"");
    const fb=b?.includes(":")?b:(b?`${b.padStart(2,"0")}:00`:"");
    if(!fa&&!fb) return undefined;
    return {from:fa, to:fb};
  }
  return {from:r, to:""};
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
  async function handleImportShare(e: React.ChangeEvent<HTMLInputElement>){
    const f=(e.target as HTMLInputElement).files?.[0]; if(!f) return;
    if(!canUpload){ alert("No tenés permiso para subir horarios"); return; }
    const isPdf=f.name.toLowerCase().endsWith(".pdf")||f.type==="application/pdf";
    const isImg=/\.(jpg|jpeg|png|webp)$/i.test(f.name)||f.type.startsWith("image/");
    let rows:{excelName:string, shifts:Record<string,any>}[]=[];
    let dateCols:string[]=[];
    if(isImg){
      const prep=async (file:File):Promise<HTMLCanvasElement>=>{
        const url=URL.createObjectURL(file);
        const img=await new Promise<HTMLImageElement>((res,rej)=>{const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url;});
        const canvas=document.createElement("canvas");
        const scale=Math.min(2.5,1600/img.width);
        canvas.width=img.width*scale; canvas.height=img.height*scale;
        const ctx=canvas.getContext("2d")!;
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const d=ctx.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<d.data.length;i+=4){ const g=0.299*d.data[i]+0.587*d.data[i+1]+0.114*d.data[i+2]; const v=Math.min(255,Math.max(0,(g-128)*1.3+128)); d.data[i]=d.data[i+1]=d.data[i+2]=v; }
        ctx.putImageData(d,0,0); URL.revokeObjectURL(url); return canvas;
      };
      const canvas=await prep(f);
      const Tesseract:any=await import("tesseract.js");
      const {data}=await Tesseract.recognize(canvas,"spa",{tessedit_pageseg_mode:6} as any);
      const text=data.text||"";
      const lines=text.split("\n").map((l:string)=>l.trim()).filter(Boolean);
      for(const l of lines){ const m=l.match(/\d+\/\d+/g); if(m && m.length>=5){ dateCols=m.slice(0,7); break; } }
      if(!dateCols.length) dateCols=Array.from({length:7},(_,i)=>`${i+7}/9`);
      for(const line of lines){
        if(!line||line.toUpperCase().includes("COLABORADOR")||line.toUpperCase().includes("FECHA")) continue;
        const m=line.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/);
        if(!m) continue;
        const name=m[1].trim(); const rest=line.slice(line.indexOf(name)+name.length).trim();
        const cells=(rest.match(/Franco|REUNION|\d{1,2}\s*a\s*\d{1,2}/gi)||[]).slice(0,7);
        while(cells.length<7) cells.push("");
        const shifts:Record<string,any>={};
        dateCols.slice(0,7).forEach((d,i)=>{ const raw=cells[i]||""; const p=parseCell(raw); if(p!==undefined){ const iso=(()=>{const [day,mon]=d.split("/").map((x:string)=>x.padStart(2,"0")); return `${new Date().getFullYear()}-${mon}-${day}`;})(); shifts[iso]=p; }});
        if(Object.keys(shifts).length) rows.push({excelName:name, shifts});
      }
    } else if(isPdf){
      const buf=await f.arrayBuffer();
      const pdfjs:any=await import("pdfjs-dist");
      if(pdfjs.GlobalWorkerOptions) try{ pdfjs.GlobalWorkerOptions.workerSrc=`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`; }catch{}
      const pdf=await pdfjs.getDocument({data:buf}).promise;
      let allRows:any[]=[]; let allDates:string[]=[];
      for(let p=1;p<=Math.min(pdf.numPages,5);p++){
        const page=await pdf.getPage(p);
        const txt=await page.getTextContent();
        const items=(txt.items as any[]).map((it:any)=>({str:it.str,x:it.transform[4],y:it.transform[5]})).filter((it:any)=>it.str.trim());
        const rowsMap=new Map<number,any[]>();
        for(const it of items){ const y=Math.round(it.y/5)*5; if(!rowsMap.has(y)) rowsMap.set(y,[]); rowsMap.get(y)!.push(it); }
        const rws=[...rowsMap.entries()].sort((a,b)=>b[0]-a[0]).map(([_,v])=>v.sort((a:any,b:any)=>a.x-b.x));
        let headerIdx=-1; let dCols:string[]=[];
        for(let i=0;i<rws.length;i++){
          const line=rws[i].map((c:any)=>c.str).join(" ").toUpperCase();
          if(line.includes("COLABOR")||line.includes("EMPLEA")){
            headerIdx=i;
            const nxt=rws[i+1]?.map((c:any)=>c.str).join(" ")||"";
            const fm=nxt.match(/\d+\/\d+/g);
            if(fm) dCols=fm; else { const nums=rws[i].map((c:any)=>c.str).join(" ").match(/\b\d{1,2}\b/g)||[]; dCols=nums.filter((n:string)=>parseInt(n)>=1&&parseInt(n)<=31).slice(0,7); }
            if(dCols.length) allDates=[...new Set([...allDates,...dCols])];
            break;
          }
        }
        if(headerIdx===-1||!dCols.length) continue;
        const hxs=rws[headerIdx].map((c:any)=>c.x);
        for(let r=headerIdx+2;r<rws.length;r++){
          const line=rws[r].map((c:any)=>c.str).join(" ").trim();
          if(!line||line.toUpperCase().includes("CANTIDAD")) break;
          if(["LUNES","MARTES","FECHA"].some(k=>line.toUpperCase().startsWith(k))) continue;
          const name=rws[r].slice(0,2).map((c:any)=>c.str).join(" ").trim();
          if(name.length<3) continue;
          const cells:string[]=[];
          for(let ci=1;ci<hxs.length&&ci<=7;ci++){ const hx=hxs[ci]; const cand=rws[r].filter((c:any)=>Math.abs(c.x-hx)<60).map((c:any)=>c.str).join(" ").trim(); cells.push(cand); }
          const shifts:Record<string,any>={};
          dCols.forEach((d,i)=>{ const raw=cells[i]||""; const p=parseCell(raw); if(p!==undefined){ const iso=d.includes("/")?(()=>{const [day,mon]=d.split("/").map((x:string)=>x.padStart(2,"0")); return `${new Date().getFullYear()}-${mon}-${day}`;})():`2025-09-${d.padStart(2,"0")}`; shifts[iso]=p; }});
          if(Object.keys(shifts).length) allRows.push({excelName:name.split(" ").slice(0,2).join(" "), shifts});
        }
      }
      const merged=new Map<string,any>();
      for(const r of allRows){ const k=r.excelName.toLowerCase(); if(!merged.has(k)) merged.set(k,{excelName:r.excelName, shifts:{}}); Object.assign(merged.get(k)!.shifts, r.shifts); }
      rows=[...merged.values()];
      dateCols=allDates;
    } else {
      const data=await f.arrayBuffer();
      const wb=XLSX.read(data,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json<any[]>(ws,{header:1, defval:""});
      if(json.length<2){ (e.target as HTMLInputElement).value=""; return; }
      const header=json[0] as string[];
      const dCols=header.slice(1);
      const pDates=dCols.map((h:any)=>{ const s=String(h).trim(); if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d=new Date(s); if(!isNaN(d.getTime())) return toISO(d); return s; });
      dateCols=pDates;
      for(const r of (json.slice(1) as any[]).filter((r:any)=>String(r[0]).trim())){
        const shifts:Record<string,any>={};
        dCols.forEach((_:any,i:number)=>{ const raw=String(r[i+1]??"").trim(); const p=parseCell(raw); if(p!==undefined) shifts[pDates[i]]=p; });
        rows.push({excelName:String(r[0]).trim(), shifts});
      }
    }
    if(!rows.length){ alert("No se detectaron filas para importar"); (e.target as HTMLInputElement).value=""; return; }
    const target=members.find((m:any)=>m.email.toLowerCase()===invite.email.toLowerCase()) || members[0];
    if(!target){ alert("No se encontró tu usuario para asignar"); return; }
    let toUse:any=null;
    if(rows.length===1) toUse=rows[0];
    else {
      const match=rows.find(r=>r.excelName.toLowerCase()===invite.email.split("@")[0].toLowerCase() || r.excelName.toLowerCase()===target.name.toLowerCase());
      toUse=match||rows[0];
    }
    const merged={...target.shifts, ...toUse.shifts};
    const res=await fetch("/api/share-update",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({token, memberId: target.id, shifts: merged})});
    if(!res.ok){ const j=await res.json(); alert(j.error||"Error al importar"); return; }
    await load();
    (e.target as HTMLInputElement).value="";
    alert("Importado correctamente para "+target.name);
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
