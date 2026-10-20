import Image from "next/image";
import Link from "next/link";
import logo from "@tudomacae/design-foundations/logo.svg";

export function SiteBrand() {
  return (
    <Link
      href="/"
      aria-label="Tudo Macaé — página inicial"
      className="
        min-w-0 shrink rounded-sm
        focus-visible:outline-2 focus-visible:outline-offset-4
      "
    >
      <Image
        className="
          block h-auto w-24
          min-[380px]:w-30
          sm:w-36
          lg:w-44
        "
        src={logo}
        unoptimized
        width={200}
        height={85}
        alt="Tudo Macaé"
        loading="eager"
      />
    </Link>
  );
}
