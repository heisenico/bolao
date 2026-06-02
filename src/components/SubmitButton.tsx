"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/Button";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  /** Label shown while the parent form's server action is in flight (e.g. "Salvando..."). */
  pendingLabel?: string;
}

/**
 * Submit button that disables itself while its parent <form>'s server action is
 * in flight (via useFormStatus), preventing double-submission and giving the
 * user progress feedback. Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
