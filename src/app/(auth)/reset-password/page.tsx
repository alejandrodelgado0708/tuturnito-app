"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else router.push("/login");
  }

  return (
    <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
      <h1 className="text-xl font-bold text-zinc-900">Nueva contraseña</h1>
      <p className="text-sm text-zinc-500 mt-1">Ingresa tu nueva contraseña</p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">Nueva contraseña</span>
          <input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#02B681] bg-white text-zinc-900 placeholder:text-zinc-400"/>
        </label>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button disabled={loading} className="mt-2 bg-[#02B681] hover:bg-[#02996f] disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
          {loading ? "Guardando..." : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}
