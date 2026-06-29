import { Loader2 } from "lucide-react";

export function ActionSpinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </span>
  );
}
