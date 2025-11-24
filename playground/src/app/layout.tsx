import { Flyo } from "@/flyo.config";
import { getConfig } from "@flyo/nitro-next/server";
import type { ReactNode } from 'react';
import { Header } from './header';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {

  const cfg = await getConfig();

  console.log('serverside config', cfg)

  return (
    <Flyo>
      <html lang="en">
        <body>
          <div className="min-h-screen">
            <Header />
            <main className="container mx-auto p-4">
              {children}
            </main>
          </div>
        </body>
      </html>
    </Flyo>
  );
}