import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers/providers';
import './globals.css';

// ─── Font Configuration ──────────────────────────────────────────────────────
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  preload: false, // Loaded on demand (code blocks, MRN display)
});

// ─── Metadata ────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    template: '%s | Medivault',
    default: 'Medivault — Medical Records Management System',
  },
  description:
    'Secure, HIPAA-compliant electronic medical records management with biometric user identification.',
  keywords: [
    'EMR',
    'EHR',
    'medical records',
    'healthcare',
    'user management',
    'biometric identification',
    'HIPAA',
  ],
  authors: [{ name: 'Medivault' }],
  applicationName: 'Medivault',
  robots: {
    index: false, // Medical app — no public indexing
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  openGraph: {
    type: 'website',
    title: 'Medivault — MRMS',
    description: 'Secure Electronic Medical Records Management System',
    siteName: 'Medivault',
  },
  icons: {
    icon: [
      { url: '/medivault-logo.png', type: 'image/png', sizes: '420x341' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#1e3a8a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevent unintended zoom on touch forms
};

// ─── Root Layout ─────────────────────────────────────────────────────────────
interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning // Required by next-themes for dark mode
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Preconnect to external resources */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Prevent flash of un-styled content for theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('medivault-theme') || 'system';
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
                if (isDark) document.documentElement.classList.add('dark');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          storageKey="medivault-theme"
          disableTransitionOnChange
        >
          <Providers>
            {/* Main content */}
            {children}

            {/* Global toast notifications */}
            <Toaster
              position="top-right"
              richColors
              expand={false}
              duration={4000}
              closeButton
              toastOptions={{
                classNames: {
                  toast: 'font-sans text-sm',
                  title: 'font-semibold',
                  description: 'text-muted-foreground',
                },
              }}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
