import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils/utils"

// Manabase button variants (design_handoff_manabase/README.md §01).
// The design's "Icon" button = variant="secondary" size="icon" — no extra variant.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-[160ms] ease-[var(--ease-hud)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // Primary — filled accent, glow elevation; one per view.
        default:
          "bg-primary text-primary-foreground font-semibold shadow-[0_0_0_1px_var(--accent-line),0_0_18px_var(--glow)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--accent),0_6px_22px_var(--glow-strong)]",
        // Destroy — transparent with danger text/hairline (never filled);
        // irreversible actions only.
        destructive:
          "bg-transparent text-destructive border border-destructive/35 hover:bg-destructive/10 focus-visible:ring-destructive/30",
        // Alias of secondary — kept for API compat; prefer variant="secondary".
        outline:
          "bg-surface text-foreground border border-line-2 hover:border-primary hover:shadow-[0_0_0_1px_var(--accent-line),0_0_16px_var(--glow)]",
        secondary:
          "bg-surface text-foreground border border-line-2 hover:border-primary hover:shadow-[0_0_0_1px_var(--accent-line),0_0_16px_var(--glow)]",
        // Ghost — toolbar / low emphasis. Transparent border reserves the
        // hairline's space so hover doesn't shift layout.
        ghost:
          "border border-transparent text-muted-foreground hover:text-foreground hover:bg-surface hover:border-line",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
