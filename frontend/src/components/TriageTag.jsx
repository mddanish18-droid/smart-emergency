const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);


export default function TriageTag({ severity, children }) {
  return (
    <article className="tag">
      <div className={"tag-band " + (severity === "critical" ? "" : severity)}>
        <small>Priority</small>
        <strong>{cap(severity)}</strong>
      </div>
      <div className="tag-body">{children}</div>
    </article>
  );
}
