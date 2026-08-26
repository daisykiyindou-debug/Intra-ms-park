import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Universal modal wrapper — mounts children to document.body via a portal
 * (avoids transform/overflow clipping from any ancestor), applies the
 * site-wide backdrop + centering (`ms-modal-backdrop` + `ms-modal-panel`
 * from index.css) and locks body scroll while open.
 *
 * Usage:
 *   <PortalModal open={cartOpen} onClose={() => setCartOpen(false)} maxWidth="max-w-lg">
 *     <div className="p-5">…contenu…</div>
 *   </PortalModal>
 *
 * Legacy usage (just portal children as-is, no wrapper):
 *   <PortalModal raw>{children}</PortalModal>
 */
export default function PortalModal({
  open = true,
  onClose,
  children,
  maxWidth = "max-w-lg",
  className = "",
  raw = false,
  testId,
}) {
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
  if (raw) return createPortal(children, document.body);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      data-testid={testId}
      className="ms-modal-backdrop"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`ms-modal-panel ${maxWidth} ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
