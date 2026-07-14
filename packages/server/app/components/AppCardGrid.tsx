import type { AppRow } from "@sonicgarden/kintone-emulator/db/apps";
import { Link } from "react-router";

type Props = {
  apps: AppRow[];
  session: string | null;
};

export function AppCardGrid({ apps, session }: Props) {
  const appUrl = (appId: number) => `/${session ? `${session}/` : ""}k/${appId}/`;

  if (apps.length === 0) {
    return <p className="text-gray-500">アプリがありません</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {apps.map((app) => (
        <Link
          key={app.id}
          to={appUrl(app.id)}
          className="bg-white rounded border border-gray-200 p-4 hover:shadow-sm transition-shadow block"
        >
          <div className="text-base font-medium text-gray-800 truncate">{app.name}</div>
          <div className="text-xs text-gray-400 mt-1">アプリID: {app.id}</div>
        </Link>
      ))}
    </div>
  );
}
