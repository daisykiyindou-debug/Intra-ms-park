import { useRef, useState } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * Local image uploader — pick from the device gallery/pellicule then upload
 * to the backend. Accepts either a single URL (mode=single) or a list of URLs
 * (mode=multi). Falls back to a URL input for backward compat.
 */
export default function ImageUpload({ value, onChange, mode = "single", testId }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const backend = process.env.REACT_APP_BACKEND_URL || "";
  const absolutize = (u) => (u && u.startsWith("/") ? `${backend}${u}` : u);

  const uploadFile = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) {
      toast.error("Merci de choisir une image");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const url = data.url;
      if (mode === "multi") {
        onChange([...(value || []), url]);
      } else {
        onChange(url);
      }
      toast.success("Image importée");
    } catch (err) {
      toast.error("Impossible d'importer l'image", { description: err.response?.data?.detail });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(f);
    }
  };

  const urls = mode === "multi" ? (value || []) : (value ? [value] : []);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={mode === "multi"}
        onChange={onPick}
        data-testid={testId || "image-file-input"}
        className="hidden"
      />

      {urls.length > 0 && (
        <div className={`grid gap-2 ${urls.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
          {urls.map((u, i) => (
            <div key={u + i} className="relative group">
              <img
                src={absolutize(u)}
                alt=""
                className="w-full h-32 object-cover rounded-lg border border-[#071B34]/5"
              />
              <button
                type="button"
                onClick={() => {
                  if (mode === "multi") onChange(urls.filter((_, j) => j !== i));
                  else onChange("");
                }}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-[#EF4444] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Retirer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          data-testid={`${testId || "image"}-pick`}
          className="ms-btn-outline text-xs !py-1.5 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Import en cours…" : mode === "multi" ? "Ajouter des photos" : (urls.length ? "Remplacer" : "Importer depuis la galerie")}
        </button>
        <button
          type="button"
          onClick={() => setShowUrl((s) => !s)}
          className="text-[11px] text-[#475569] hover:text-[#3BA4FF] font-semibold"
        >
          {showUrl ? "Masquer URL" : "…ou coller une URL"}
        </button>
      </div>

      {showUrl && (
        <input
          type="url"
          placeholder="https://…"
          value={mode === "single" ? (value || "") : ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (mode === "multi") {
              if (v) onChange([...(value || []), v]);
            } else {
              onChange(v);
            }
          }}
          className="ms-input !py-1.5 !text-xs"
        />
      )}
    </div>
  );
}
