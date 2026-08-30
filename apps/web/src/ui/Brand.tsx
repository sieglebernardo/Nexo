type BrandProps = Readonly<{
  className?: string;
  compact?: boolean;
}>;

export function Brand({ className = "", compact = false }: BrandProps) {
  return (
    <div className={`brand ${compact ? "is-compact" : ""} ${className}`.trim()}>
      <img alt="" className="brand-sphere" height="36" src="/favicon.png" width="36" />
      {!compact && (
        <span className="brand-wordmark">
          <span>Com</span> Nexo
        </span>
      )}
    </div>
  );
}
