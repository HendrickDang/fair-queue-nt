import { FAULT_LABEL, type FaultKind } from "@/lib/ui/fault";

/** One line icon per kind of repair, drawn on a 24 x 24 grid. */
const PATHS: Record<FaultKind, string[]> = {
  plumbing: ["M3 10h10a4 4 0 0 1 4 4v1", "M8 10V6", "M5.5 6h5", "M17 18c.9 1.2.9 2.4 0 3-.9-.6-.9-1.8 0-3z"],
  electrical: ["M13 2.5 5.5 13.5H11l-1 8 7.5-11H12z"],
  structural: ["M3 11.5 12 4l9 7.5", "M6 9.5V20h12V9.5", "M12.5 9 11 12l2.5 2-1.5 3"],
  cooling: ["M12 3v18", "M4.2 7.5l15.6 9", "M19.8 7.5 4.2 16.5", "M9.5 4.5 12 7l2.5-2.5", "M9.5 19.5 12 17l2.5 2.5"],
  water_quality: [
    "M12 3.5c3.4 4.3 5.8 7.2 5.8 10.2a5.8 5.8 0 0 1-11.6 0c0-3 2.4-5.9 5.8-10.2z",
    "M9 14.5c1-.9 2 .9 3 0s2 .9 3 0",
  ],
  sanitation: ["M7 3.5h5v7H7z", "M7 10.5h11c0 3.5-2.2 5.5-5 5.5H9.5", "M9.5 16 9 20.5h5.5L14 16"],
  security: ["M6 11h12v9.5H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3", "M12 14.5V17"],
  kitchen: ["M5 3.5h14v17H5z", "M5 9h14", "M8.2 6.2h.1", "M12 6.2h.1", "M15.8 6.2h.1", "M8.5 12.5h7V17h-7z"],
  bathroom: [
    "M5.5 20.5V7a3.2 3.2 0 0 1 6.4 0",
    "M9 9.5h6",
    "M10 12.5v1.2",
    "M12 12.5v3",
    "M14 12.5v1.2",
    "M11 17v1.2",
    "M13 18v1.2",
  ],
  medical: ["M4.5 4.5h15v15h-15z", "M12 8v8", "M8 12h8"],
  accessibility: ["M10.5 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", "M10.5 8v5.5h5l2 5", "M8.2 11.5a5 5 0 1 0 6.8 6.3"],
  pest: [
    "M12 8.5c2.3 0 4 2.2 4 5s-1.7 5.5-4 5.5-4-2.7-4-5.5 1.7-5 4-5z",
    "M9.8 8.8a2.3 2.3 0 0 1 4.4 0",
    "M10 5.5 9 3.5",
    "M14 5.5l1-2",
    "M8 12 5 10.5",
    "M8 14.5H4.5",
    "M8.3 17l-2.8 1.5",
    "M16 12l3-1.5",
    "M16 14.5h3.5",
    "M15.7 17l2.8 1.5",
  ],
  other: [
    "M15 5a4 4 0 0 0-3.9 5.1L4.5 16.7a2 2 0 1 0 2.8 2.8l6.6-6.6A4 4 0 0 0 19 9l-2.5 2.5-2-.5-.5-2L16.5 6.5A4 4 0 0 0 15 5z",
  ],
};

interface Props {
  kind: FaultKind;
  size?: number;
  /** Position, when the icon is placed inside another SVG. */
  x?: number;
  y?: number;
  color?: string;
  strokeWidth?: number;
  /** Set false when a label sits right beside the icon. */
  labelled?: boolean;
}

export default function FaultIcon({ kind, size = 16, x, y, color = "currentColor", strokeWidth = 1.8, labelled = true }: Props) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? FAULT_LABEL[kind] : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {PATHS[kind].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
