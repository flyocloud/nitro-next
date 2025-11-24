'use client';

import { useConfig } from "@flyo/nitro-next/client";
import Link from "next/link";

export function Header() {

  console.log('\n\n[CLIENT HEADER COMPONENT]\n\n')
  
  // use the config context which only works in client components
  const config = useConfig();

  const navContainer = config?.containers?.nav || []
  const navItems = Array.isArray(navContainer) ? [] : (navContainer.items || []);

  return (
    <header className="bg-blue-600 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Flyo Nitro Next: {config?.nitro?.domain || 'Loading...'}
        </h1>
        <nav>
          <ul className="flex gap-6">
            {navItems.map((item: any, index: number) => (
              <li key={index}>
                <Link 
                  href={item.href} 
                  target={item.target}
                  className="hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
