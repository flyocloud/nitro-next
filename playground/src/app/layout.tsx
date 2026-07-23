import { FlyoProvider, flyo } from "@/flyo.config";
import { type ReactNode } from 'react';
import { Header } from './header';
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
            {/* This playground is single-language — no <NitroLanguageSwitcher/>.
                On a multilingual site it would live here; see the README's
                "Language switcher" section. */}
          </footer>
        </body>
      </html>
    </FlyoProvider>
  );
}
