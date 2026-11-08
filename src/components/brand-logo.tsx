import Image from "next/image";

export function BrandLogo({
  size = 56,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.jpg"
      alt="KLEF 13"
      width={size}
      height={size}
      priority={priority}
      className="brand-logo"
    />
  );
}
