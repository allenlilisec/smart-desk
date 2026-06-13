"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { homePathForRoles } from "@/lib/auth";
import { LoadingSpinner } from "@/components/ui";

export default function HomePage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    router.replace(homePathForRoles(me.roles));
  }, [me, loading, router]);

  return <LoadingSpinner />;
}
