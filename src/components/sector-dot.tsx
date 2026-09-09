import { SECTORS, type Sector } from "@/lib/shift-sectors";

export function SectorDot({ sector }: { sector?: Sector }) {
  if (!sector || !Object.hasOwn(SECTORS, sector)) return null;
  const info = SECTORS[sector];
  return <span role="img" aria-label={`Sector: ${info.label}`} title={info.label} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/25 align-middle mr-1" style={{ backgroundColor: info.color }} />;
}

export function SectorLegend() {
  return <div className="flex flex-wrap gap-3 text-xs text-zinc-600">{(Object.keys(SECTORS) as Sector[]).map(sector => <span key={sector}><SectorDot sector={sector} />{SECTORS[sector].label}</span>)}</div>;
}
