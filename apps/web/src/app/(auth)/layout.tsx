import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-6 text-center text-2xl font-semibold tracking-tight">
          Procure<span className="text-brand">X</span>
        </p>
        {children}
      </div>
    </main>
  );
}
