import type { Metadata } from "next";
import { AddConcert } from "./add-concert";

export const metadata: Metadata = { title: "Add a concert · Music Junkie" };

export default function AddConcertPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <AddConcert />
    </div>
  );
}
