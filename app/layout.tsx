import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#f2f3f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "MORI 角色工作室｜AI 角色卡与世界书",
    description: "把小说、人物设定和聊天记录整理为完整角色卡，并用不同 API 预设生成可导出的世界书。",
    applicationName: "MORI 角色工作室",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "MORI",
    },
    icons: {
      icon: [
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: origin,
      siteName: "MORI 角色工作室",
      title: "MORI 角色工作室｜把设定变成可长期扮演的角色",
      description: "AI 角色卡整理、世界书生成与多 API 预设连接。",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "MORI 角色工作室" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "MORI 角色工作室",
      description: "AI 角色卡整理、世界书生成与多 API 预设连接。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
