import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`dv-button ${className}`} {...props} />;
}
export function Card({ children }: PropsWithChildren) {
  return <section className="dv-card">{children}</section>;
}
export function StatusBadge({
  children,
  tone = "positive",
}: PropsWithChildren<{ tone?: "positive" | "warning" | "neutral" }>) {
  return <span className={`dv-badge dv-badge--${tone}`}>{children}</span>;
}
