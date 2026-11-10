import { Link } from "react-router-dom";

export default function Brand({ suffix = "" }) {
  return (
    <Link className="brand" to="/">
      <span />
      RapidRelay{suffix}
    </Link>
  );
}
