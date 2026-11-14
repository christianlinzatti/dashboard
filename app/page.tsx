import { Dashboard } from "@/components/Dashboard";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const t = one(sp.t);
  return (
    <Dashboard
      demo={one(sp.demo)}
      t={t !== undefined && /^\d+$/.test(t) ? Number(t) : undefined}
      debug={one(sp.debug) === "1"}
      loginError={one(sp.fehler)}
    />
  );
}
