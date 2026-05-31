import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bolão da Copa 2026",
  description: "Bolão privado entre amigos para a Copa do Mundo FIFA 2026",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={openSans.variable}>
      <body className="bg-fundo font-sans text-[#111111] antialiased">
        {children}
      </body>
    </html>
  );
}
