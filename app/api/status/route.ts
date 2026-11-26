import { hasClaude, hasDeepgram } from "@/lib/config";

export function GET() {
  return Response.json({ claude: hasClaude(), deepgram: hasDeepgram() });
}
