import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";

type LatLng = [number, number];

interface TravelRouteMapProps {
  geometry?: unknown;
  originCoords?: unknown;
  destinationCoords?: unknown;
  originLabel?: string;
  destinationLabel?: string;
  distanceKm?: number | string | null;
  durationMins?: number | string | null;
  className?: string;
}

function asPoint(value: unknown): LatLng | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lat = Number(value[0]);
  const lon = Number(value[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lat, lon];
}

function asGeometry(value: unknown): LatLng[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asPoint)
    .filter((point): point is LatLng => Boolean(point));
}

function createMarkerIcon(kind: "origin" | "destination") {
  return L.divIcon({
    className: "",
    html: `<span class="pb-travel-marker pb-travel-marker-${kind}" aria-hidden="true"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function formatDistance(distanceKm?: number | string | null) {
  const value = Number(distanceKm);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${value.toFixed(value >= 10 ? 0 : 1)} km`;
}

function formatDuration(durationMins?: number | string | null) {
  const value = Number(durationMins);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value)} min`;
}

export function TravelRouteMap({
  geometry,
  originCoords,
  destinationCoords,
  originLabel,
  destinationLabel,
  distanceKm,
  durationMins,
  className = "",
}: TravelRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const origin = useMemo(() => asPoint(originCoords), [originCoords]);
  const destination = useMemo(() => asPoint(destinationCoords), [destinationCoords]);
  const routeGeometry = useMemo(() => asGeometry(geometry), [geometry]);
  const shouldDrawRoute = routeGeometry.length >= 3;
  const boundsPoints = useMemo(
    () => shouldDrawRoute
      ? routeGeometry
      : [origin, destination].filter((point): point is LatLng => Boolean(point)),
    [destination, origin, routeGeometry, shouldDrawRoute],
  );
  const hasMapData = Boolean(origin || destination || routeGeometry.length >= 2);
  const hasRouteLabels = Boolean(originLabel || destinationLabel);
  const distanceLabel = formatDistance(distanceKm);
  const durationLabel = formatDuration(durationMins);

  useEffect(() => {
    if (!containerRef.current || !hasMapData) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [hasMapData]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !hasMapData) return;

    layer.clearLayers();
    const rootStyle = getComputedStyle(document.documentElement);
    const routeColor = rootStyle.getPropertyValue("--primary").trim() || "#e86f51";

    if (shouldDrawRoute) {
      L.polyline(routeGeometry, {
        color: routeColor,
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);
    }

    if (origin) {
      L.marker(origin, {
        icon: createMarkerIcon("origin"),
        title: originLabel || "Pickup",
      }).addTo(layer);
    }

    if (destination) {
      L.marker(destination, {
        icon: createMarkerIcon("destination"),
        title: destinationLabel || "Destination",
      }).addTo(layer);
    }

    if (boundsPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPoints).pad(0.24), { animate: false });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14, { animate: false });
    }

    window.setTimeout(() => map.invalidateSize(false), 80);
  }, [boundsPoints, destination, destinationLabel, hasMapData, origin, originLabel, routeGeometry, shouldDrawRoute]);

  if (!hasMapData) {
    return (
      <div className={`flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-raised/35 p-5 text-center ${className}`}>
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground">
          <MapPin className="h-4 w-4" />
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">
          {hasRouteLabels ? "Route selected" : "Select pickup and destination"}
        </p>
        {hasRouteLabels ? (
          <p className="mt-1 max-w-[20rem] text-xs font-medium leading-relaxed text-foreground">
            {originLabel || "Pickup"} to {destinationLabel || "Destination"}
          </p>
        ) : null}
        <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
          {hasRouteLabels
            ? "Run an estimate once to attach road geometry and draw the mapped path."
            : "The route preview appears after PocketBuddy resolves the places."}
        </p>
      </div>
    );
  }

  return (
    <div className={`relative min-h-[220px] overflow-hidden rounded-xl border border-border bg-surface-raised ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
        {distanceLabel ? (
          <span className="rounded-full border border-border bg-surface/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
            {distanceLabel}
          </span>
        ) : null}
        {durationLabel ? (
          <span className="rounded-full border border-border bg-surface/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm">
            {durationLabel}
          </span>
        ) : null}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="truncate">{originLabel || "Pickup"}</span>
          <span className="text-border">-&gt;</span>
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="truncate">{destinationLabel || "Destination"}</span>
        </div>
      </div>
    </div>
  );
}
