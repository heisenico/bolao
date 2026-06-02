import * as React from "react";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-[filter,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-95",
  secondary: "bg-surface-muted text-ink border border-border hover:brightness-95",
  danger:
    "bg-surface text-danger border border-danger hover:bg-danger hover:text-white",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
