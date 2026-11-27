function hour(d: Date) {
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
}

/** « Aujourd'hui · 10h24 », « Hier · 21h06 » ou « mer. 18 nov. · 15h12 ». */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Aujourd'hui · ${hour(d)}`;
  if (same(d, yesterday)) return `Hier · ${hour(d)}`;
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
  return `${day} · ${hour(d)}`;
}

/** « 42 min », « 1 h 04 », « moins d'1 min ». */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const m = Math.round(seconds / 60);
  if (m < 1) return "moins d'1 min";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
