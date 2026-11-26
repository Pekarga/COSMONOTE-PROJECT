import { redirect } from "next/navigation";

// L'ancienne page « Nouvelle note » : tout se fait désormais depuis la liste.
export default function NewNoteRedirect() {
  redirect("/");
}
