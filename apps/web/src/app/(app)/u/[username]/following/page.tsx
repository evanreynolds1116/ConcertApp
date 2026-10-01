import type { Metadata } from "next";
import { FollowListPage } from "../follow-list-page";

export const metadata: Metadata = { title: "Following · Music Junkie" };

export default async function Page({ params }: PageProps<"/u/[username]/following">) {
  return <FollowListPage username={(await params).username} kind="following" />;
}
