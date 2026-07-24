import { createPortal } from "react-dom";

/**
 * Portal wrapper for modals to bypass CSS transform clipping.
 * Parent components using `.ms-fade-up` (which applies transform: translateY)
 * would clip child elements with position: fixed. This mounts the modal
 * directly to document.body to avoid the issue.
 */
export default function PortalModal({ children }) {
  return createPortal(children, document.body);
}
