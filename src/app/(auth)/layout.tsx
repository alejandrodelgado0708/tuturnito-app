import Image from "next/image";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4 py-10">
      <Image src="/logo.png" alt="TuTurnito" width={320} height={320} className="mb-8 h-32 sm:h-40 w-auto object-contain" priority />
      {children}
    </div>
  );
}
