import { storage } from "@/lib/storage";
import { Scrapbook } from "@/components/scrapbook";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <Scrapbook initialBook={await storage.readBook()} />;
}
