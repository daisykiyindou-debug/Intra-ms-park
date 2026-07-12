import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDateFr } from "@/lib/api";

const categoryColor = {
  Communication: "bg-[#3BA4FF]/15 text-[#1D70B8]",
  Événement: "bg-[#A78BFA]/15 text-[#7C3AED]",
  Restauration: "bg-[#F59E0B]/15 text-[#B45309]",
  Alerte: "bg-[#EF4444]/15 text-[#B91C1C]",
};

export default function NewsCarousel({ items = [] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    const t = setInterval(() => emblaApi.scrollNext(), 6000);
    return () => clearInterval(t);
  }, [emblaApi, onSelect]);

  if (!items.length) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl ms-card" data-testid="news-carousel">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {items.map((n) => (
            <div key={n.id} className="relative shrink-0 grow-0 basis-full">
              <div className="relative aspect-[16/8] md:aspect-[16/6] overflow-hidden">
                <img src={n.image} alt={n.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#071B34] via-[#071B34]/70 to-transparent" />
              </div>
              <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-10">
                <div className="max-w-2xl">
                  <span
                    className={`ms-chip ${categoryColor[n.category] || "bg-white/15 text-white"} backdrop-blur-md`}
                  >
                    {n.category}
                  </span>
                  <h3 className="mt-3 text-2xl md:text-4xl font-bold tracking-tight text-white leading-tight">
                    {n.title}
                  </h3>
                  <p className="mt-2 text-sm md:text-base text-white/80 max-w-xl line-clamp-2">
                    {n.summary || n.content}
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    {n.cta_url && n.cta_url.startsWith("http") ? (
                      <a
                        href={n.cta_url}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`news-cta-${n.id}`}
                        className="ms-btn-primary"
                      >
                        {n.cta_text || "En savoir plus"} <ArrowUpRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <Link
                        to={n.cta_url || "/actualites"}
                        data-testid={`news-cta-${n.id}`}
                        className="ms-btn-primary"
                      >
                        {n.cta_text || "Lire l'actualité"} <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    )}
                    <span className="text-xs text-white/60">{formatDateFr(n.date)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 flex items-center gap-2">
        <button
          onClick={() => emblaApi?.scrollPrev()}
          data-testid="carousel-prev"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md text-white hover:bg-white/25 transition-colors"
          aria-label="Précédent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => emblaApi?.scrollNext()}
          data-testid="carousel-next"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md text-white hover:bg-white/25 transition-colors"
          aria-label="Suivant"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute bottom-6 left-6 md:left-10 flex gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            data-testid={`carousel-dot-${i}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === selected ? "w-8 bg-white" : "w-1.5 bg-white/40"
            }`}
            aria-label={`Aller au slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
