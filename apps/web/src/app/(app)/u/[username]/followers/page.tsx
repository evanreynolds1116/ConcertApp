import type { Metadata } from "next";
import { FollowListPage } from "../follow-list-page";

export const metadata: Metadata = { title: "Followers · Music Junkie" };

export default async function Page({ params }: PageProps<"/u/[username]/followers">) {
  return <FollowListPage username={(await params).username} kind="followers" />;
}
