import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const title =
  "JobGenius - We Handle Your Job Search So You Can Focus on Interviews";
const description =
  "Stop applying to jobs. JobGenius pairs AI with a dedicated human account manager to run your entire job search — applications, recruiter outreach, and interview prep — so you only show up when it matters.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jobgenius.com"),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "JobGenius",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "JobGenius",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "JobGenius",
  url: "https://www.jobgenius.com",
  description,
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
