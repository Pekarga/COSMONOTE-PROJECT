import { hasClaude } from "@/lib/config";

export function GET() {
  return Response.json({ claude: hasClaude() });
}
