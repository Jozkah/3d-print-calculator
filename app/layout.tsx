import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { AccentToggle } from "@/components/accent-toggle"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" })

export const metadata: Metadata = {
  title: "3D Print Cost Calculator",
  description: "Self-hostable cost & quote calculator for 3D printing, laser cutting and engraving",
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}>
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var a=localStorage.getItem("accent");if(a&&a!=="green")document.documentElement.setAttribute("data-accent",a)}catch(e){}',
          }}
        />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          <ThemeToggle />
          <AccentToggle />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
