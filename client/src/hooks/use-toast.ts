import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 4000
const TOAST_DURATION = 4000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
// Track dismiss timeouts separately for pause/resume functionality
const dismissTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
const pauseStartTimes = new Map<string, number>()
const remainingDurations = new Map<string, number>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

// Pause auto-dismiss when mouse enters toast
function pauseToast(toastId: string) {
  const timeout = dismissTimeouts.get(toastId)
  if (timeout) {
    clearTimeout(timeout)
    dismissTimeouts.delete(toastId)
    
    // Calculate remaining time
    const startTime = pauseStartTimes.get(toastId)
    if (startTime) {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, TOAST_DURATION - elapsed)
      remainingDurations.set(toastId, remaining)
      pauseStartTimes.delete(toastId)
    }
  }
}

// Resume auto-dismiss when mouse leaves toast
function resumeToast(toastId: string) {
  const remaining = remainingDurations.get(toastId)
  if (remaining !== undefined && remaining > 0) {
    remainingDurations.delete(toastId)
    
    const timeout = setTimeout(() => {
      dismissTimeouts.delete(toastId)
      pauseStartTimes.delete(toastId)
      dispatch({ type: "DISMISS_TOAST", toastId })
    }, remaining)
    
    dismissTimeouts.set(toastId, timeout)
    pauseStartTimes.set(toastId, Date.now())
  }
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // Clean up dismiss timeout when dismissing
      if (toastId) {
        const timeout = dismissTimeouts.get(toastId)
        if (timeout) {
          clearTimeout(timeout)
          dismissTimeouts.delete(toastId)
          pauseStartTimes.delete(toastId)
          remainingDurations.delete(toastId)
        }
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          const timeout = dismissTimeouts.get(toast.id)
          if (timeout) {
            clearTimeout(timeout)
            dismissTimeouts.delete(toast.id)
            pauseStartTimes.delete(toast.id)
            remainingDurations.delete(toast.id)
          }
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      // Clean up all timeout tracking when removing
      if (action.toastId) {
        dismissTimeouts.delete(action.toastId)
        pauseStartTimes.delete(action.toastId)
        remainingDurations.delete(action.toastId)
      }
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  // Auto-dismiss after 4 seconds - track this timeout for pause/resume
  const timeout = setTimeout(() => {
    dismissTimeouts.delete(id)
    pauseStartTimes.delete(id)
    dismiss()
  }, TOAST_DURATION)
  
  dismissTimeouts.set(id, timeout)
  pauseStartTimes.set(id, Date.now())

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
    pauseToast,
    resumeToast,
  }
}

export { useToast, toast }
