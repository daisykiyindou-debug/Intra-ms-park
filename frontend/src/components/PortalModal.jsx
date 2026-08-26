import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Barebones portal wrapper. Mounts children to `document.body` so any
 * `position: fixed` inside them isn't scoped by an ancestor transform.
 * Optionally locks body scroll while `open` is true and closes on Escape.
 * Legacy signature: `<PortalModal open onClose={...}>` OR just `<PortalModal>`.
 */
export default function PortalModal({ open = true, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(children, document.body);
}
