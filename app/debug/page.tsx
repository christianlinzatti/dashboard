import type { Metadata } from "next";
import { DebugViewer } from "@/components/debug/DebugViewer";

export const metadata: Metadata = { title: "Debug – Sonic Stage" };

export default function Page() {
  return <DebugViewer />;
}
