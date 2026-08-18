export default function Home() {
  return (
    <main className="app-shell">
      <iframe
        className="assistant-frame"
        src="/assistant.html"
        title="GUIDE Partner Call Assistant"
        allow="microphone; clipboard-write"
      />
    </main>
  );
}
