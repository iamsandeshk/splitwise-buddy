import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary/60 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_8px_18px_-10px_hsl(var(--primary)/0.6)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive/50 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_8px_18px_-10px_hsl(var(--destructive)/0.55)] hover:brightness-110",
        outline:
          "border border-dashed border-border bg-transparent text-foreground hover:border-primary/50 hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/60 hover:bg-secondary/80",
        ghost:
          "hover:bg-secondary/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        premium:
          "bg-gradient-to-b from-primary to-primary-glow text-primary-foreground border border-primary/60 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2),0_10px_22px_-10px_hsl(var(--primary)/0.65)]",
        success:
          "bg-success text-success-foreground border border-success/50 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.18),0_8px_18px_-10px_hsl(var(--success)/0.55)] hover:brightness-110",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-8",
        icon: "h-10 w-10",
        xl: "h-14 rounded-2xl px-10 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
