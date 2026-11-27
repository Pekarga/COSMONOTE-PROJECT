"use client";
import { useRef, useState, type ReactNode } from "react";

export const ACCEPT = ".pdf,.docx,.odt,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

/** Zone où glisser des fichiers, ou cliquer pour les choisir. */
export function DropZone(props: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  compact?: boolean;
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className={`dropzone ${props.compact ? "dropzone-compact" : ""} ${over ? "over" : ""} ${props.disabled ? "disabled" : ""} ${props.className ?? ""}`}
      role="button"
      tabIndex={0}
      data-dropzone
      onClick={() => !props.disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !props.disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (props.disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) props.onFiles(props.multiple === false ? files.slice(0, 1) : files);
      }}
    >
      {props.icon && <span className="dropzone-icon">{props.icon}</span>}
      <span className="dropzone-text">
        <strong>{props.title}</strong>
        {props.hint && <span className="dropzone-hint">{props.hint}</span>}
      </span>
      <input
        ref={input}
        type="file"
        hidden
        multiple={props.multiple !== false}
        accept={props.accept ?? ACCEPT}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) props.onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
