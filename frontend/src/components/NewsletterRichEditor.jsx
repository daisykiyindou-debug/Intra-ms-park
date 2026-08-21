import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Undo2, Redo2, Copy, Paintbrush, Type, Smile,
} from "lucide-react";

const FONT_FAMILIES = [
  { l: "Défaut", v: "" },
  { l: "Serif", v: "Georgia, serif" },
  { l: "Sans-serif", v: "Inter, sans-serif" },
  { l: "Monospace", v: "'JetBrains Mono', monospace" },
  { l: "Script", v: "'Brush Script MT', cursive" },
];
const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "40"];
const TEXT_COLORS = ["#071B34", "#334155", "#3BA4FF", "#1D70B8", "#059669", "#D97706", "#DC2626", "#7C3AED", "#DB2777", "#ffffff"];
const BG_COLORS   = ["transparent", "#FEF3C7", "#DBEAFE", "#D1FAE5", "#FCE7F3", "#EDE9FE", "#FEE2E2", "#F1F5F9", "#071B34", "#3BA4FF"];
const QUICK_EMOJIS = ["🎉", "🚀", "✨", "🔥", "💡", "❤️", "👏", "🎯", "📢", "✅", "⭐", "🏆", "🍕", "☕", "📅", "📌"];

const Sep = () => <div className="w-px h-6 bg-[#071B34]/10 mx-1" />;

const ToolbarBtn = ({ onClick, icon: Icon, title, disabled, testId }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    title={title}
    disabled={disabled}
    data-testid={testId}
    className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
      disabled ? "text-[#94A3B8] cursor-not-allowed" : "text-[#334155] hover:bg-[#071B34]/8"
    }`}
  >
    <Icon className="h-4 w-4" />
  </button>
);

/**
 * Newsletter rich text editor — contentEditable with a professional toolbar.
 * Emits HTML on change. `disabled` puts the editor in read-only mode.
 */
export default function NewsletterRichEditor({ value, onChange, disabled = false, placeholder = "Écrivez votre texte…", minHeight = 120 }) {
  const ref = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);

  useEffect(() => {
    if (!ref.current) return;
    if ((value || "") !== ref.current.innerHTML) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const emit = () => onChange?.(ref.current?.innerHTML || "");

  const exec = (cmd, arg = null) => {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    setOpenMenu(null);
    emit();
  };

  const insertLink = () => {
    const url = window.prompt("Adresse du lien (https://…) :", "https://");
    if (url) exec("createLink", url);
  };

  return (
    <div className="rounded-xl border border-[#071B34]/12 bg-white overflow-visible" data-testid="newsletter-rte">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-[#071B34]/8 bg-[#F8FAFC]">
        <ToolbarBtn onClick={() => exec("bold")} icon={Bold} title="Gras" disabled={disabled} testId={"rte-bold"} />
        <ToolbarBtn onClick={() => exec("italic")} icon={Italic} title="Italique" disabled={disabled} testId={"rte-italic"} />
        <ToolbarBtn onClick={() => exec("underline")} icon={Underline} title="Souligné" disabled={disabled} testId={"rte-underline"} />
        <ToolbarBtn onClick={() => exec("strikeThrough")} icon={Strikethrough} title="Barré" disabled={disabled} testId={"rte-strikeThrough"} />
        <Sep />
        <div className="relative">
          <button type="button" disabled={disabled}
            onClick={() => setOpenMenu(openMenu === "font" ? null : "font")}
            className="h-8 px-2 rounded-md text-xs font-semibold text-[#334155] hover:bg-[#071B34]/8 flex items-center gap-1"
          >
            <Type className="h-3.5 w-3.5" /> Police
          </button>
          {openMenu === "font" && (
            <div className="absolute z-20 top-full left-0 mt-1 min-w-[160px] rounded-lg bg-white shadow-lg ring-1 ring-[#071B34]/10 py-1">
              {FONT_FAMILIES.map((f) => (
                <button key={f.l} type="button"
                  onMouseDown={(e) => { e.preventDefault(); exec("fontName", f.v || "sans-serif"); }}
                  style={{ fontFamily: f.v || undefined }}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#F1F5F9]"
                >{f.l}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" disabled={disabled}
            onClick={() => setOpenMenu(openMenu === "size" ? null : "size")}
            className="h-8 px-2 rounded-md text-xs font-semibold text-[#334155] hover:bg-[#071B34]/8"
          >Taille</button>
          {openMenu === "size" && (
            <div className="absolute z-20 top-full left-0 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-[#071B34]/10 p-1 grid grid-cols-3 gap-0.5">
              {FONT_SIZES.map((s) => (
                <button key={s} type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ref.current?.focus();
                    document.execCommand("styleWithCSS", false, true);
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount && !sel.isCollapsed) {
                      const range = sel.getRangeAt(0);
                      const span = document.createElement("span");
                      span.style.fontSize = `${s}px`;
                      try { range.surroundContents(span); } catch { span.appendChild(range.extractContents()); range.insertNode(span); }
                    }
                    emit();
                    setOpenMenu(null);
                  }}
                  className="text-xs px-2 py-1 rounded hover:bg-[#F1F5F9]"
                >{s}px</button>
              ))}
            </div>
          )}
        </div>
        <Sep />
        <div className="relative">
          <button type="button" disabled={disabled}
            onClick={() => setOpenMenu(openMenu === "color" ? null : "color")}
            className="h-8 w-8 rounded-md flex items-center justify-center text-[#334155] hover:bg-[#071B34]/8"
            title="Couleur du texte"
          ><Paintbrush className="h-4 w-4" /></button>
          {openMenu === "color" && (
            <div className="absolute z-20 top-full left-0 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-[#071B34]/10 p-2 grid grid-cols-5 gap-1">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button"
                  onMouseDown={(e) => { e.preventDefault(); exec("foreColor", c); }}
                  className="h-6 w-6 rounded-md ring-1 ring-black/5" style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" disabled={disabled}
            onClick={() => setOpenMenu(openMenu === "bg" ? null : "bg")}
            className="h-8 px-2 rounded-md text-xs font-semibold text-[#334155] hover:bg-[#071B34]/8"
            title="Couleur de fond"
          >Fond</button>
          {openMenu === "bg" && (
            <div className="absolute z-20 top-full left-0 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-[#071B34]/10 p-2 grid grid-cols-5 gap-1">
              {BG_COLORS.map((c) => (
                <button key={c} type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ref.current?.focus();
                    document.execCommand("styleWithCSS", false, true);
                    document.execCommand("hiliteColor", false, c === "transparent" ? "rgba(0,0,0,0)" : c);
                    emit();
                    setOpenMenu(null);
                  }}
                  className="h-6 w-6 rounded-md ring-1 ring-black/5" style={{ background: c === "transparent" ? "repeating-linear-gradient(45deg, #E5E7EB, #E5E7EB 4px, #fff 4px, #fff 8px)" : c }}
                />
              ))}
            </div>
          )}
        </div>
        <Sep />
        <ToolbarBtn onClick={() => exec("insertUnorderedList")} icon={List} title="Liste à puces" disabled={disabled} testId={"rte-insertUnorderedList"} />
        <ToolbarBtn onClick={() => exec("insertOrderedList")} icon={ListOrdered} title="Liste numérotée" disabled={disabled} testId={"rte-insertOrderedList"} />
        <Sep />
        <ToolbarBtn onClick={() => exec("justifyLeft")} icon={AlignLeft} title="Gauche" disabled={disabled} testId={"rte-justifyLeft"} />
        <ToolbarBtn onClick={() => exec("justifyCenter")} icon={AlignCenter} title="Centrer" disabled={disabled} testId={"rte-justifyCenter"} />
        <ToolbarBtn onClick={() => exec("justifyRight")} icon={AlignRight} title="Droite" disabled={disabled} testId={"rte-justifyRight"} />
        <ToolbarBtn onClick={() => exec("justifyFull")} icon={AlignJustify} title="Justifier" disabled={disabled} testId={"rte-justifyFull"} />
        <Sep />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); insertLink(); }} disabled={disabled}
          data-testid="rte-link"
          className="h-8 w-8 rounded-md flex items-center justify-center text-[#334155] hover:bg-[#071B34]/8" title="Lien"
        ><LinkIcon className="h-4 w-4" /></button>
        <div className="relative">
          <button type="button" disabled={disabled}
            onClick={() => setOpenMenu(openMenu === "emoji" ? null : "emoji")}
            className="h-8 w-8 rounded-md flex items-center justify-center text-[#334155] hover:bg-[#071B34]/8" title="Emoji"
          ><Smile className="h-4 w-4" /></button>
          {openMenu === "emoji" && (
            <div className="absolute z-20 top-full left-0 mt-1 rounded-lg bg-white shadow-lg ring-1 ring-[#071B34]/10 p-2 grid grid-cols-8 gap-0.5">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} type="button"
                  onMouseDown={(ev) => { ev.preventDefault(); exec("insertText", e); }}
                  className="h-7 w-7 text-base rounded hover:bg-[#F1F5F9]"
                >{e}</button>
              ))}
            </div>
          )}
        </div>
        <Sep />
        <ToolbarBtn onClick={() => exec("copy")} icon={Copy} title="Copier la mise en forme" disabled={disabled} testId={"rte-copy"} />
        <ToolbarBtn onClick={() => exec("undo")} icon={Undo2} title="Annuler" disabled={disabled} testId={"rte-undo"} />
        <ToolbarBtn onClick={() => exec("redo")} icon={Redo2} title="Rétablir" disabled={disabled} testId={"rte-redo"} />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        data-testid="newsletter-rte-surface"
        className={`px-3 py-2 text-sm text-[#071B34] outline-none max-w-none ${disabled ? "bg-[#F8FAFC] select-none" : ""}`}
        style={{ minHeight, whiteSpace: "pre-wrap" }}
      />
      <style>{`
        [data-testid="newsletter-rte-surface"]:empty::before {
          content: attr(data-placeholder);
          color: #94A3B8;
        }
        [data-testid="newsletter-rte-surface"] a { color: #3BA4FF; text-decoration: underline; }
        [data-testid="newsletter-rte-surface"] ul, [data-testid="newsletter-rte-surface"] ol { padding-left: 1.5rem; margin: 0.25rem 0; }
      `}</style>
    </div>
  );
}
