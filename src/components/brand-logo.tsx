const BRAND_SRC = "/brand-klef13.jpg";

export function BrandLogo({
  size = 56,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- avoid stale /_next/image cache for brand mark
    <img
      src={BRAND_SRC}
      alt="KLEF 13"
      width={size}
      height={size}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className="brand-logo"
    />
  );
}
