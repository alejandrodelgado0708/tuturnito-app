import { createClient } from "@supabase/supabase-js";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function parseISO(s: string) { const [y,m,dd]=s.split("-").map(Number); return new Date(y,m-1,dd); }
function fmtDate(d: Date) { return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`; }

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || anon;
  const supabase = createClient(url, service);

  let invite: any = null;
  try {
    const { data } = await supabase.from("share_invites").select("*").eq("token", token).single();
    invite = data;
  } catch {}

  if (!invite) {
    return (
      <div className="min-h-screen grid place-items-center bg-zinc-50 p-6">
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <h1 className="text-lg font-bold text-zinc-900">Link no válido</h1>
          <p className="text-sm text-zinc-600 mt-2">El link de invitación no existe o expiró.</p>
          <a href="/login" className="mt-6 inline-block bg-[#02B681] text-white px-5 py-2.5 rounded-lg text-sm font-medium">Ir a TuTurnito</a>
        </div>
      </div>
    );
  }

  const role = invite.role as "own" | "all";
  const email = invite.email as string;
  const name = invite.name as string;
  const ownerId = invite.owner_id as string | null;

  let members: any[] = [];
  if (ownerId) {
    const { data } = await supabase.from("team_members").select("*").eq("owner_id", ownerId).order("created_at");
    members = data || [];
    if (role === "own") members = members.filter((m: any) => m.email?.toLowerCase() === email.toLowerCase());
  }

  const start = toISO(new Date());
  const dates = Array.from({ length: 7 }, (_, i) => toISO(addDays(parseISO(start), i)));

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <img src="/logo-horizontal.png" alt="TuTurnito" className="h-7 sm:h-8 w-auto" />
        <span className="hidden sm:inline-flex ml-2 text-xs bg-[#02B681]/10 text-[#02B681] px-2 py-1 rounded-full border border-[#02B681]/20"> {members.length} personas · 7 días</span>
        <span className="ml-auto text-[11px] sm:text-xs bg-zinc-900 text-white px-2 sm:px-2.5 py-1 rounded-full truncate max-w-[150px] sm:max-w-none">{role === "all" ? "Ve todos" : "Solo tu horario"} · {email}</span>
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-2 sm:px-6 py-4 sm:py-6 flex-1">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-bold">{name.slice(0,2).toUpperCase()}</div>
          <div>
            <div className="text-sm font-bold text-zinc-900">Hola {name} 👋</div>
            <div className="text-xs text-zinc-500">Acceso sin registro · {role === "all" ? "Ves todo el tablero" : "Ves solo tu horario"} · Link: /share/{token}</div>
          </div>
          <a href="/login" className="ml-auto text-xs px-3 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50">Crear cuenta</a>
        </div>

        {members.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center text-sm text-zinc-500">El tablero aún no tiene miembros o no tienes permiso para verlos.</div>
        ) : (
          <div className="bg-white sm:rounded-xl border-y sm:border border-zinc-200 overflow-hidden shadow-sm -mx-2 sm:mx-0">
            <div className="overflow-auto overscroll-x-contain touch-pan-x">
              <table className="w-full text-[13px] sm:text-[15px] border-collapse min-w-[640px] sm:min-w-[900px]">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="sticky left-0 z-10 bg-zinc-50 text-left p-3.5 font-semibold text-zinc-700 min-w-[220px] border-r border-zinc-200 text-[14px]">Persona</th>
                    {dates.map((iso) => {
                      const d = parseISO(iso);
                      const isWE = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th key={iso} className={`p-3 text-center min-w-[148px] border-r border-zinc-100 ${isWE ? "bg-[#02B681]/10" : ""}`}>
                          <div className={`text-xs ${isWE ? "text-[#02B681]" : "text-zinc-500"}`}>{DAY_NAMES[d.getDay()]}</div>
                          <div className="font-semibold text-zinc-900">{fmtDate(d)}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {members.map((person: any) => (
                    <tr key={person.id} className="border-b border-zinc-100">
                      <td className="sticky left-0 z-10 bg-white p-3 border-r border-zinc-200">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-[#02B681]/15 text-[#02B681] grid place-items-center font-semibold text-xs shrink-0">{person.name.slice(0,2).toUpperCase()}</div>
                          <div className="min-w-0">
                            <div className="font-medium text-[14px] text-zinc-800 truncate">{person.name}</div>
                            <div className="text-[11px] text-zinc-500 truncate">{person.email}</div>
                          </div>
                        </div>
                      </td>
                      {dates.map((iso) => {
                        const hasShift = person.shifts && iso in person.shifts;
                        const shift = hasShift ? person.shifts[iso] : undefined;
                        const isFranco = hasShift && shift === null;
                        const arr = Array.isArray(shift) ? shift : shift ? [shift] : null;
                        return (
                          <td key={iso} className="p-2.5 border-r border-zinc-100 text-center align-middle h-[88px]">
                            {isFranco ? (
                              <div className="w-full h-[68px] rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold grid place-items-center">Franco</div>
                            ) : arr ? (
                              <div className="bg-[#02B681] text-white rounded-lg px-2 py-2 text-[12px] font-semibold flex flex-col items-center gap-0.5 leading-tight">
                                {arr.map((s:any,i:number)=>(<div key={i} className="flex items-center gap-1">{s.from}<span className="opacity-60">—</span>{s.to}</div>))}
                                {arr.length===2 && <span className="text-[9px] opacity-70 -mt-0.5">cortado</span>}
                              </div>
                            ) : (
                              <div className="w-full h-[68px] rounded-lg border border-dashed border-zinc-200 text-zinc-400 text-xs grid place-items-center">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <footer className="py-4 text-center text-xs text-zinc-400">TuTurnito · acceso sin cuenta</footer>
    </div>
  );
}
