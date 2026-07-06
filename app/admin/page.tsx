import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/admin` has no view of its own. Materializing this segment ensures direct
 * loads and refreshes of `/admin` resolve (instead of falling through to the
 * 404 page) and sends visitors to the canonical access-administration route.
 */
export default function AdminIndexPage() {
  redirect("/admin/access");
}
