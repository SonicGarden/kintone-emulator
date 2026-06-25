import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useMatches,
} from "react-router";
import type { LinksFunction } from "react-router";

import "./tailwind.css";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

type JsItem =
  | { type: "URL"; url: string }
  | { type: "FILE"; file: { fileKey: string; name: string } };

type RouteDataWithCustomize = {
  customizeJs?: JsItem[];
  session?: string | null;
};

function useCustomizeScripts(): string[] {
  const matches = useMatches();
  return matches.flatMap((match) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (match as any).data as RouteDataWithCustomize | null;
    if (!data?.customizeJs?.length) return [];
    const prefix = data.session ? `${data.session}/` : "";
    return data.customizeJs.map((item) =>
      item.type === "URL"
        ? item.url
        : `/${prefix}k/v1/file.json?fileKey=${item.file.fileKey}`
    );
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const customizeScripts = useCustomizeScripts();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script src="/kintone.js" />
        {customizeScripts.map((src) => (
          <script key={src} src={src} />
        ))}
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
