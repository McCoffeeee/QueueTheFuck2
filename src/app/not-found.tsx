import Link from "next/link";
import { Button } from "@/components/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold">Room not found</h1>
      <p className="text-muted">This room may have ended or the code is incorrect.</p>
      <Link href="/">
        <Button>Go home</Button>
      </Link>
    </main>
  );
}
