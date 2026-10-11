"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/actions/helpers";
import { cn } from "@/lib/utils";
import { useHydrated } from "./use-hydrated";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submitLabel = "Simpan",
  className,
  resetOnSuccess = false,
  variant = "default",
  size = "default",
  confirmText,
  onResult,
  inline = false,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  /** Jika diisi, tampilkan window.confirm sebelum submit (untuk aksi berdampak). */
  confirmText?: string;
  onResult?: (state: ActionState) => void;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
    if (state) onResult?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={cn(inline ? "inline-flex flex-wrap items-end gap-2" : "space-y-3", className)}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <div className={cn("flex items-center gap-3", inline && "contents")}>
        <Button type="submit" disabled={pending || !hydrated} variant={variant} size={size}>
          {pending ? "Menyimpan…" : submitLabel}
        </Button>
        {state?.message && !inline && (
          <p role="status" className={cn("text-sm", state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {state.message}
          </p>
        )}
      </div>
      {state?.message && inline && (
        <p role="status" className={cn("basis-full text-xs", state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
          {state.message}
        </p>
      )}
    </form>
  );
}
