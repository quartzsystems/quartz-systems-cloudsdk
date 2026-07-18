"use client";

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

/// Underlined tab bar in the Quartz design system.
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--qz-border)]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={[
              "px-4 py-[10px] text-[13px] font-medium cursor-pointer bg-transparent border-0 border-b-2 -mb-px transition-colors",
              on
                ? "border-[var(--qz-accent)] text-[var(--qz-fg-1)]"
                : "border-transparent text-[var(--qz-fg-3)] hover:text-[var(--qz-fg-1)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
