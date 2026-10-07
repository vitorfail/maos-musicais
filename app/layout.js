import "./globals.css";

export const metadata = { title: "Órgão de Mãos", description: "Toque acordes de órgão com gestos das mãos" };
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
