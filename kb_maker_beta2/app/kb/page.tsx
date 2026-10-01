import LiveKBClient from "./LiveKBClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Current Knowledge Base — Databricks Volume",
  description: "Live explorer and inspector for production knowledge bases in Databricks Unity Catalog.",
};

export default function LiveKBPage() {
  return <LiveKBClient />;
}
