import * as React from "react";

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <label className="mb-2 block text-sm font-medium">
      {children}
    </label>
  );
}

export { Label };