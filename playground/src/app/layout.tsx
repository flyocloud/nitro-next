import { Flyo } from "@/flyo.config";
import type { ReactNode } from 'react';
import { Header } from './header';
import { useConfigApi } from "@flyo/nitro-next";

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {

  const config = await useConfigApi();

  return (
    <Flyo>
      <html lang="en">
        <body>
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