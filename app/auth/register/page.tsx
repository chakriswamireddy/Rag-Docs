import { redirect } from "next/navigation";

// Registration is admin-managed. Direct access here is not allowed.
export default function RegisterPage() {
  redirect("/auth/signin");
}

