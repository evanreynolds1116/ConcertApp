import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";

/** The "Profile" tab: your own profile page. */
export default async function MyProfilePage() {
  const { profile } = await requireViewer();
  redirect(`/u/${profile.username}`);
}
