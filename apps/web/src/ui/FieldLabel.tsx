import type { ReactNode } from "react";

export function FieldLabel({
  children,
  required = false,
}: Readonly<{ children: ReactNode; required?: boolean }>) {
  return (
    <span className="field-label">
      {children}
      {required && (
        <span aria-hidden="true" className="required-mark">
          *
        </span>
      )}
    </span>
  );
}
