"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setResendMsg(""); setLoading(true);
    const supabase = createClient();
    const { error, data } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setLoading(false);
    if (error) setError(error.message);
    else {
      if(data.user && !data.user.identities?.length) setError("Ese email ya está registrado. Usa Iniciar sesión o Reenviar confirmación.");
      else setSuccess(true);
    }
  }
  async function resend(){
    setResending(true); setResendMsg(""); setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email, options:{ emailRedirectTo: `${window.location.origin}/auth/callback`} });
    setResending(false);
    if(error) setError(error.message);
    else setResendMsg("Correo reenviado. Revisa spam y espera 1-2 min.");
  }

  if (success) {
    return (
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm text-center">
        <Image src="/logo.png" alt="TuTurnito" width={120} height={120} className="mx-auto h-20 w-auto object-contain mb-4" />
        <div className="h-12 w-12 rounded-full bg-[#02B681]/10 grid place-items-center mx-auto mb-3 text-xl">✉️</div>
        <h1 className="text-xl font-bold text-zinc-900">¡Revisa tu email!</h1>
        <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
          Te enviamos un correo a <b className="text-zinc-900">{email}</b> con un enlace para confirmar tu cuenta.
        </p>
        <p className="text-xs text-zinc-500 mt-3 bg-[#02B681]/10 border border-[#02B681]/20 rounded-lg p-3">
          💚 Bienvenido a <b>TuTurnito</b> — la forma más simple de gestionar tus horarios rotativos. Haz clic en el botón verde del email para activar tu cuenta y comenzar.
        </p>
        <p className="text-xs text-zinc-400 mt-3">¿No lo ves? Revisa spam o espera un minuto. Supabase limita a 3-4 envíos/hora por email.</p>
        {resendMsg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">{resendMsg}</p>}
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">{error}</p>}
        <button onClick={resend} disabled={resending} className="mt-3 w-full border border-zinc-200 bg-white hover:bg-zinc-50 rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{resending?"Reenviando...":"Reenviar correo"}</button>
        <Link href="/login" className="mt-3 inline-block w-full bg-[#02B681] hover:bg-[#02996f] text-white rounded-lg py-2.5 text-sm font-medium">Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
      <h1 className="text-xl font-bold text-zinc-900">Crear cuenta</h1>
      <p className="text-sm text-zinc-500 mt-1">Empieza a gestionar tus turnos</p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">Email</span>
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#02B681] bg-white text-zinc-900 placeholder:text-zinc-400"/>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700">Contraseña</span>
          <input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#02B681] bg-white text-zinc-900 placeholder:text-zinc-400"/>
        </label>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button disabled={loading} className="mt-2 bg-[#02B681] hover:bg-[#02996f] disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium">
          {loading ? "Creando..." : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-4 text-sm text-center text-zinc-500">¿Ya tienes cuenta? <Link href="/login" className="text-[#02B681] font-medium hover:underline">Iniciar sesión</Link></p>
    </div>
  );
}
