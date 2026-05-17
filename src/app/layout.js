import "./globals.css";

export const metadata = {
  title: "HoshimiStation — 번역 협업 관리",
  description: "아이돌리프라이드 번역 협업 관리 도구",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
