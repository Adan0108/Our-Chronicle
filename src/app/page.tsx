import { storage } from "@/lib/storage";
import { Scrapbook } from "@/components/scrapbook";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const backup = params.backup;
  const action = params.restored;
  const initialNotice =
    (action === "import" || action === "reset") &&
    typeof backup === "string" &&
    /^our-chronicle-[a-zA-Z0-9-]+\.zip$/.test(backup)
      ? `${action === "import" ? "Your book was imported." : "The sample book has been restored."} A safety backup is saved at storage/backups/${backup}. Use Import Book to restore it.`
      : "";
  return (
    <Scrapbook
      initialBook={await storage.readBook()}
      initialNotice={initialNotice}
    />
  );
}
