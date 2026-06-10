import "./globals.css";

const TITLE = "Natter — Voice-first film & TV recommendations";
const DESCRIPTION =
  "Describe what you want to watch, and Natter finds real films & TV shows for you.";

export const metadata = {
  metadataBase: new URL("https://natter.cc"),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Natter",
  openGraph: {
    type: "website",
    siteName: "Natter",
    url: "https://natter.cc",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
