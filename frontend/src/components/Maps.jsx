import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

const COLORS = { critical: "#c2414b", medium: "#e9a400", low: "#2b9a68" };
const hospitalIcon = L.divIcon({ className: "", html: '<div class="mk" style="background:#16202a"></div>', iconSize: [22, 22] });
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTR = "© OpenStreetMap";

function FitBounds({ points, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(), 150);
    
  }, [trigger]);
  return null;
}

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [target, map]);
  return null;
}


export function PatientMap({ me, hospital }) {
  const hp = [hospital.lat, hospital.lng];
  return (
    <MapContainer className="map" center={me} zoom={13} scrollWheelZoom={false}>
      <TileLayer url={TILES} attribution={ATTR} />
      <CircleMarker center={me} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#1f5fd1", fillOpacity: 1 }}>
        <Tooltip>You</Tooltip>
      </CircleMarker>
      <Marker position={hp} icon={hospitalIcon}>
        <Tooltip>{hospital.name}</Tooltip>
      </Marker>
      <Polyline positions={[me, hp]} pathOptions={{ color: "#16202a", weight: 4, dashArray: "2 8", lineCap: "round" }} />
      <FitBounds points={[me, hp]} trigger={hospital.id} />
    </MapContainer>
  );
}


export function DispatchMap({ incidents, selectedId, onSelect }) {
  const open = incidents.filter((i) => i.status !== "closed");
  const selected = open.find((i) => i.id === selectedId);
  return (
    <MapContainer className="dash-map" center={[28.6, 77.35]} zoom={11}>
      <TileLayer url={TILES} attribution={ATTR} />
      {open.map((i) => (
        <CircleMarker
          key={i.id}
          center={[i.lat, i.lng]}
          radius={i.id === selectedId ? 13 : 9}
          pathOptions={{ color: "#fff", weight: 3, fillColor: COLORS[i.severity], fillOpacity: 1 }}
          eventHandlers={{ click: () => onSelect(i.id) }}
        />
      ))}
      {selected && (
        <>
          <Marker position={[selected.hospital.lat, selected.hospital.lng]} icon={hospitalIcon}>
            <Tooltip>{selected.hospital.name}</Tooltip>
          </Marker>
          <Polyline
            positions={[[selected.lat, selected.lng], [selected.hospital.lat, selected.hospital.lng]]}
            pathOptions={{ color: "#16202a", weight: 4, dashArray: "2 8", lineCap: "round" }}
          />
        </>
      )}
      {!selected && <FitBounds points={open.map((i) => [i.lat, i.lng])} trigger={open.length} />}
      <FlyTo target={selected ? [selected.lat, selected.lng] : null} />
    </MapContainer>
  );
}
