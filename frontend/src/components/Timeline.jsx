import { STATUS_ORDER, STATUS_LABEL } from "../lib/api.js";

export default function Timeline({ status }) {
  const idx = status === "closed" ? STATUS_ORDER.length : STATUS_ORDER.indexOf(status);
  return (
    <ol className="timeline">
      {STATUS_ORDER.map((s, i) => (
        <li key={s} className={i < idx ? "done" : i === idx ? "now" : ""}>
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ol>
  );
}
