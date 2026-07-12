import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export default function Payslip() {
  const { employeeId, year, month } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/payslip/${employeeId}/${year}/${month}`)
      .then((r) => setP(r.data))
      .catch(() => setErr("Impossible de charger le bulletin"));
  }, [employeeId, year, month]);

  if (err) return <div className="ms-card p-8 text-center text-[#EF4444]">{err}</div>;
  if (!p) return <div className="ms-card p-8 animate-pulse h-64" />;

  return (
    <div className="ms-fade-up max-w-4xl mx-auto space-y-4 print:space-y-2">
      <div className="flex items-center justify-between print:hidden">
        <Link
          to="/documents"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#475569] hover:text-[#071B34]"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux documents
        </Link>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            data-testid="print-payslip"
            className="ms-btn-outline"
          >
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>
      </div>

      <div
        className="bg-white shadow-2xl rounded-2xl overflow-hidden border border-[#071B34]/5 print:shadow-none print:border-0 print:rounded-none"
        data-testid="payslip-doc"
      >
        {/* Header band */}
        <div className="bg-gradient-to-br from-[#071B34] to-[#0B2545] text-white px-8 py-6 flex items-start justify-between print:bg-[#071B34]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
              Bulletin de salaire
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight mt-1">{p.period.label}</h1>
            <div className="text-xs text-white/60 mt-1">
              Période du {new Date(p.period.from).toLocaleDateString("fr-FR")} au{" "}
              {new Date(p.period.to).toLocaleDateString("fr-FR")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-extrabold tracking-tight leading-none">MS PARK</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-1">SAS</div>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#071B34]/10">
          <div className="p-6">
            <div className="ms-overline">Employeur</div>
            <div className="mt-2 text-sm font-bold text-[#071B34]">{p.employer.name}</div>
            <div className="text-xs text-[#475569] leading-relaxed">
              {p.employer.address}<br />
              SIRET : {p.employer.siret} · APE : {p.employer.ape}<br />
              <span className="italic">{p.employer.convention}</span>
            </div>
          </div>
          <div className="p-6">
            <div className="ms-overline">Salarié</div>
            <div className="mt-2 text-sm font-bold text-[#071B34]">
              {p.employee.first_name} {p.employee.last_name}
            </div>
            <div className="text-xs text-[#475569] leading-relaxed">
              {p.employee.role}<br />
              Matricule : {p.employee.badge_number}<br />
              {p.employee.address}<br />
              Ancienneté : {Math.floor(p.employee.seniority_months / 12)} an{p.employee.seniority_months >= 24 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Résumé période */}
        <div className="border-t border-[#071B34]/10 px-6 py-4 grid grid-cols-3 gap-4 text-center bg-[#F4F7FA]">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
              Contrat
            </div>
            <div className="text-lg font-bold text-[#071B34]">{p.worked.contract_hours_weekly}h / semaine</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
              Heures du mois
            </div>
            <div className="text-lg font-bold text-[#071B34]">{p.worked.monthly_hours} h</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#475569]">
              Taux horaire
            </div>
            <div className="text-lg font-bold text-[#071B34]">{p.worked.hourly_rate.toFixed(2)} €</div>
          </div>
        </div>

        {/* Lignes */}
        <div className="px-6 py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#475569] border-b border-[#071B34]/10">
                <th className="pb-2 font-semibold">Libellé</th>
                <th className="pb-2 text-right font-semibold">Base</th>
                <th className="pb-2 text-right font-semibold">Taux</th>
                <th className="pb-2 text-right font-semibold">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#071B34]/5">
              {p.lines_gross.map((l, i) => (
                <tr key={`g-${i}`}>
                  <td className="py-2 text-[#071B34] font-medium">{l.label}</td>
                  <td className="py-2 text-right text-[#475569]">{l.base}</td>
                  <td className="py-2 text-right text-[#475569]">{l.rate.toFixed(2)} €</td>
                  <td className="py-2 text-right font-semibold text-[#071B34]">
                    {l.amount.toFixed(2)} €
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F4F7FA]">
                <td className="py-2 pl-2 font-bold text-[#071B34]" colSpan="3">
                  Salaire brut
                </td>
                <td className="py-2 text-right pr-2 font-extrabold text-[#071B34]">
                  {p.totals.gross.toFixed(2)} €
                </td>
              </tr>

              <tr className="text-[10px] uppercase tracking-wider text-[#475569]">
                <td className="pt-4 pb-1 font-semibold" colSpan="4">
                  Cotisations et contributions salariales
                </td>
              </tr>
              {p.lines_deductions.map((l, i) => (
                <tr key={`d-${i}`}>
                  <td className="py-2 text-[#071B34]">{l.label}</td>
                  <td className="py-2 text-right text-[#475569]">—</td>
                  <td className="py-2 text-right text-[#475569]">{l.rate.toFixed(2)} %</td>
                  <td className="py-2 text-right font-semibold text-[#EF4444]">
                    − {l.amount.toFixed(2)} €
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F4F7FA]">
                <td className="py-2 pl-2 font-bold text-[#071B34]" colSpan="3">
                  Total cotisations salariales
                </td>
                <td className="py-2 text-right pr-2 font-extrabold text-[#EF4444]">
                  − {p.totals.deductions.toFixed(2)} €
                </td>
              </tr>
              <tr>
                <td className="py-2 font-bold text-[#071B34]" colSpan="3">
                  Net à payer avant impôt
                </td>
                <td className="py-2 text-right font-bold text-[#071B34]">
                  {p.totals.net_before_tax.toFixed(2)} €
                </td>
              </tr>
              <tr>
                <td className="py-2 text-[#071B34]" colSpan="3">
                  Prélèvement à la source
                </td>
                <td className="py-2 text-right text-[#EF4444]">
                  − {p.totals.prelevement_source.toFixed(2)} €
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="border-t border-[#071B34]/10 bg-gradient-to-br from-[#3BA4FF]/10 to-transparent px-8 py-5 flex items-center justify-between">
          <div>
            <div className="ms-overline text-[#3BA4FF]">Net à payer</div>
            <div className="text-3xl font-extrabold tracking-tight text-[#071B34]">
              {p.totals.net_a_payer.toFixed(2)} €
            </div>
          </div>
          <div className="text-right text-[10px] text-[#475569] leading-relaxed max-w-xs">
            Bulletin conforme au modèle simplifié.<br />
            À conserver sans limitation de durée.<br />
            Généré le {new Date(p.generated_at).toLocaleDateString("fr-FR")}
          </div>
        </div>
      </div>
    </div>
  );
}
