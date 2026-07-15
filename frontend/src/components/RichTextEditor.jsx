import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Heading1, Heading2,
  AlignLeft, AlignCenter, AlignRight, Smile,
} from "lucide-react";

const EMOJIS = ["😀", "😍", "🎉", "🥳", "🚀", "💪", "🔥", "✨", "👏", "❤️", "🎯", "📢", "🍕", "🛼", "☕", "🎂"];

/**
 * Lightweight contentEditable rich-text editor.
 * Emits HTML through onChange. Supports bold/italic/underline, H1/H2, lists,
 * links, alignment and an emoji picker.
 */
export default function RichTextEditor({ value, onChange, placeholder = "Rédigez votre publication…", testId }) {
  const ref = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);

  // Keep the DOM in sync when parent resets the value (e.g. after publish)
  useEffect(() => {
    if (ref.current && (value || "") !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML || "");
  };

  const insertLink = () => {
    const url = window.prompt("Lien (https://…)");
    if (!url) return;
    const full = url.startsWith("http") ? url : `https://${url}`;
    exec("createLink", full);
  };

  const insertEmoji = (e) => {
    ref.current?.focus();
    document.execCommand("insertText", false, e);
    onChange(ref.current?.innerHTML || "");
    setShowEmoji(false);
  };

  const Btn = ({ onClick, icon: Icon, title, testId: tid }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={tid}
      className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#071B34]/5 text-[#475569] hover:text-[#071B34]"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="rounded-xl border border-[#071B34]/10 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#071B34]/5 bg-[#F8FAFC] px-2 py-1.5">
        <Btn onClick={() => exec("bold")} icon={Bold} title="Gras" testId="rte-bold" />
        <Btn onClick={() => exec("italic")} icon={Italic} title="Italique" testId="rte-italic" />
        <Btn onClick={() => exec("underline")} icon={Underline} title="Souligné" testId="rte-underline" />
        <span className="w-px h-5 bg-[#071B34]/10 mx-1" />
        <Btn onClick={() => exec("formatBlock", "H2")} icon={Heading1} title="Titre" />
        <Btn onClick={() => exec("formatBlock", "H3")} icon={Heading2} title="Sous-titre" />
        <span className="w-px h-5 bg-[#071B34]/10 mx-1" />
        <Btn onClick={() => exec("insertUnorderedList")} icon={List} title="Liste à puces" />
        <Btn onClick={() => exec("insertOrderedList")} icon={ListOrdered} title="Liste numérotée" />
        <span className="w-px h-5 bg-[#071B34]/10 mx-1" />
        <Btn onClick={() => exec("justifyLeft")} icon={AlignLeft} title="Aligner à gauche" />
        <Btn onClick={() => exec("justifyCenter")} icon={AlignCenter} title="Centrer" />
        <Btn onClick={() => exec("justifyRight")} icon={AlignRight} title="Aligner à droite" />
        <span className="w-px h-5 bg-[#071B34]/10 mx-1" />
        <Btn onClick={insertLink} icon={Link2} title="Insérer un lien" testId="rte-link" />
        <div className="relative">
          <Btn onClick={() => setShowEmoji((s) => !s)} icon={Smile} title="Emojis" testId="rte-emoji" />
          {showEmoji && (
            <div className="absolute z-10 mt-1 flex flex-wrap gap-1 rounded-xl border border-[#071B34]/10 bg-white p-2 shadow-lg w-56">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => insertEmoji(e)}
                  className="h-8 w-8 rounded-md hover:bg-[#F4F7FA] text-lg"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-testid={testId || "rich-text-editor"}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onBlur={(e) => onChange(e.currentTarget.innerHTML)}
        className="ms-rte min-h-[140px] max-h-[400px] overflow-y-auto p-3 text-sm text-[#071B34] focus:outline-none"
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
    </div>
  );
}
