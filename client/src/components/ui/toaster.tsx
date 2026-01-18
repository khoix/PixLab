import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts, dismiss, pauseToast, resumeToast } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast 
            key={id} 
            {...props}
            onMouseEnter={() => pauseToast(id)}
            onMouseLeave={() => resumeToast(id)}
            onClick={(e) => {
              // Only dismiss if clicking on the toast itself, not on buttons or interactive elements
              const target = e.target as HTMLElement
              const isInteractive = target.closest('button') || target.closest('[role="button"]') || target.closest('a')
              if (!isInteractive) {
                dismiss(id)
              }
            }}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
