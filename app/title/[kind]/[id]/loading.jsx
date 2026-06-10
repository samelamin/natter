// Shown immediately while getDetails() resolves (it can take a few seconds cold),
// so a visitor who clicked a shared link never stares at a blank page.
export default function Loading() {
  return (
    <main className="title-page">
      <div className="title-hero nat-skel" style={{ height: 440 }} />
      <section className="title-body">
        <div className="nat-skel" style={{ height: 96, borderRadius: 8, marginTop: 18 }} />
        <div className="nat-skel" style={{ height: 48, borderRadius: 8, marginTop: 14, width: '60%' }} />
      </section>
    </main>
  );
}
