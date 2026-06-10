import "./globals.css";

export const metadata = {
  title: "Natter — Voice-first film & TV recommendations",
  description: "Describe what you want to watch, and Natter finds real films & TV shows for you.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
