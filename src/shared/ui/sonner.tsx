import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // The app is dark-only (see src/tokens.css) — no theme detection.
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        style: {
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: '6px',
          color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
          padding: '12px 16px',
        },
        classNames: {
          success: 'toast-success',
          error: 'toast-error',
          warning: 'toast-warning',
          info: 'toast-info',
        },
      }}
      style={
        {
          "--normal-bg": "var(--bg-2)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line-2)",
          "--border-radius": "6px",
          "--success-bg": "var(--bg-2)",
          "--success-border": "var(--good)",
          "--error-bg": "var(--bg-2)",
          "--error-border": "var(--danger)",
          "--warning-bg": "var(--bg-2)",
          "--warning-border": "var(--warn)",
          "--info-bg": "var(--bg-2)",
          "--info-border": "var(--accent-2)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
