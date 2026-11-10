import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Sos from "./pages/Sos.jsx";
import Dispatch from "./pages/Dispatch.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/sos" element={<Sos />} />
      <Route path="/dispatch" element={<Dispatch />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
