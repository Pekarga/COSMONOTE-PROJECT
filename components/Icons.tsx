type P = { size?: number };
const base = (size = 18) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});
export const MicIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg>
);
export const StopIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
);
export const PauseIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M9 5v14M15 5v14" /></svg>
);
export const UploadIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
);
export const SearchIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const SparkIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>
);
export const PenIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
export const TrashIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
);
export const CopyIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const SendIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" /></svg>
);
export const PlayIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M7 4v16l13-8Z" fill="currentColor" /></svg>
);
export const ScanIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5" /></svg>
);
export const GearIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const BackIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
);
export const MoreIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>
);
export const CloseIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const SpeakerIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
);
export const ShareIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
);
export const PlusIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
);
export const CameraIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="13" r="4" /></svg>
);
