import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { AuthProvider } from '@/components/AuthProvider';
import faviconDark from '@/assets/favicon-dark.png';
import faviconLight from '@/assets/favicon-light.png';
import './globals.css';

// The logo's dark letters vanish on a dark tab, so dark browsers get a light-letter copy. Both are transparent.
export const metadata = {
  title: 'Product Analytics',
  icons: {
    icon: [
      { url: faviconLight.src, type: 'image/png', media: '(prefers-color-scheme: light)' },
      { url: faviconDark.src, type: 'image/png', media: '(prefers-color-scheme: dark)' },
    ],
  },
};

// Runs before first paint so there is no flash of the wrong theme.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('pt-theme');if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
