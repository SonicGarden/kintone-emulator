import type { ReactNode } from "react";
import { Link } from "react-router";

type Props = {
  session: string | null;
  logoHref?: string;
  children?: ReactNode;
};

export function SiteHeader({ session, logoHref = "/k/", children }: Props) {
  return (
    <header className="bg-white border-b border-gray-300 px-6 py-3 flex items-center gap-4">
      <Link to={logoHref} className="text-lg font-semibold text-gray-800 hover:underline">
        kintone
      </Link>
      {session && <span className="text-sm text-gray-500">session: {session}</span>}
      {children}
    </header>
  );
}
