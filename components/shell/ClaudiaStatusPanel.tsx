export function ClaudiaStatusPanel() {
  return (
    <section className="nexus-card" aria-labelledby="claudia-status-title">
      <h2 className="nexus-card-title" id="claudia-status-title">
        Claudia connection
      </h2>
      <p className="nexus-card-subtitle">
        Nexus connects to Claudia through the private Console Connector (outbound only). No inbound
        tunnel or direct Claudia Core access exists in this shell.
      </p>
      <p className="nexus-status-pill" style={{ marginTop: "0.75rem" }}>
        Connector not implemented
      </p>
    </section>
  );
}
