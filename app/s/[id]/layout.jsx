// Shared-set pages are ephemeral artifacts — crawlable for unfurl bots but
// not indexed by search engines.
export const metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function ShareSetLayout({ children }) {
  return children;
}
