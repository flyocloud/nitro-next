import { FlyoProvider, flyo } from "@/flyo.config";
import { Suspense, type ReactNode } from 'react';
import { Header } from './header';
import { LanguageSwitcher } from './language-switcher';
import { NitroDebugInfo } from "@flyo/nitro-next/server";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {

  const config = await flyo.getNitroConfig();

  return (
    <FlyoProvider>
      <html lang="en">
        <body>
          <NitroDebugInfo flyo={flyo} />
          <Header config={config} />
          <div className="min-h-screen">
            <main className="container mx-auto p-4">
              {children}
            </main>
          </div>
          <footer className="container mx-auto p-4">
            {/* Shared chrome. The switcher reads the links the active route
                published; Suspense lets the layout stream while it waits. */}
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
          </footer>
        </body>
      </html>
    </FlyoProvider>
  );
}