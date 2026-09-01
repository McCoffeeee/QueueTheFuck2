import { Suspense } from "react";
import { HomePageClient } from "@/components/HomePageClient";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-6">
          <p className="text-muted">Loading...</p>
        </main>
      }
    >
      <HomePageClient />
    </Suspense>
  );
}
