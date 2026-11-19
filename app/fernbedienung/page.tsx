import type { Metadata } from "next";
import { RemotePage } from "@/components/remote/RemotePage";

export const metadata: Metadata = { title: "Fernbedienung · Sonic Stage" };

export default function Page() {
  return <RemotePage />;
}
