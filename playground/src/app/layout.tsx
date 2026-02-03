import { Flyo } from "@/flyo.config";
import type { ReactNode } from 'react';
import { Header } from './header';
import { getNitroConfig, NitroDebugInfo } from "@flyo/nitro-next/server";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {

  const config = await getNitroConfig();

  return (
    <Flyo>
      <html lang="en">
        <body>
          <NitroDebugInfo config={config} />
          <Header config={config} />
          <div className="min-h-screen">
            <main className="container mx-auto p-4">
              {children}
            </main>
          </div>
        </body>
      </html>
    </Flyo>
  );
}