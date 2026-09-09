"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (error) setError(error.message);
    else setMsg("Te enviamos un email con el enlace para restablecer tu contraseña.");
  }

  return (
    <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
      <h1 className="text-xl font-bold text-zinc-900">Olvidé mi contraseña</h1>
      <p className="text-sm text-zinc-500 mt-1">Te enviaremos un enlace a tu email</p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">Email</span>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#02B681] bg-white text-zinc-900 placeholder:text-zinc-400"/>
        </label>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{msg}</p>}
        <button disabled={loading} className="mt-2 bg-[#02B681] hover:bg-[#02996f] disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
          {loading ? "Enviando..." : "Enviar enlace"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center"><Link href="/login" className="text-zinc-600 hover:underline">← Volver a login</Link></p>
    </div>
  );
}
