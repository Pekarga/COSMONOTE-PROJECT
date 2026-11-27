"use client";
import { useEffect, useRef, useState } from "react";
import { MISE_EN_FORME_DEFAUT, ligneDate } from "@/lib/style";
import type { Genre, MiseEnForme } from "@/lib/types";

/** Largeur d'une page A4 à l'écran (210 mm à 96 points par pouce). */
const A4_PX = (210 / 25.4) * 96;

export type LetterFields = {
  genre: Genre;
  entete: string;
  enteteDroite: string;
  refs: string;
  vref: string;
  lieu: string;
  date: string;
  destinataire: string;
  objet: string;
  pj: string;
  appel: string;
  corps: string;
  politesse: string;
  signature: string;
  ampliation: string;
  pied: string;
  police: string;
};

type Key = Exclude<keyof LetterFields, "genre">;

/** Le document sur une feuille A4, chaque bloc modifiable directement. */
export function LetterSheet(props: {
  value: LetterFields;
  onChange?: (key: Key, value: string) => void;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  forme?: MiseEnForme;
  /** Échelle imposée (aperçu rapide) ; sinon la page se réduit pour tenir dans la colonne. */
  zoom?: number;
}) {
  const v = props.value;
  const f = props.forme ?? MISE_EN_FORME_DEFAUT;
  const readOnly = !props.onChange;
  const note = v.genre === "note";
  const dateInput = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  useEffect(() => {
    if (props.zoom || !wrap.current) return;
    const el = wrap.current;
    const ro = new ResizeObserver(() => setFit(Math.min(1, Math.max(0.45, (el.clientWidth - 8) / A4_PX))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.zoom]);

  const field = (key: Key, placeholder: string, className = "") => (
    <textarea
      className={`sheet-field ${className} ${v[key] ? "" : "is-empty"}`}
      value={v[key]}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck
      lang="fr"
      rows={1}
      aria-label={placeholder}
      onChange={(e) => props.onChange?.(key, e.target.value)}
    />
  );

  const logo = props.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="sheet-logo" src={props.logoUrl} alt="Logo" />
  ) : null;

  return (
    <div className={`sheet-wrap ${props.zoom ? "sheet-thumb" : ""}`} ref={wrap}>
      <article
        className={`sheet ${props.zoom ? "" : "print-area"}`}
        style={{
          fontFamily: `"${v.police}", Arial, sans-serif`,
          fontSize: `${f.taille}pt`,
          lineHeight: 1.3 * f.interligne,
          zoom: props.zoom ?? fit,
          ["--align" as string]: f.alignement,
        }}
      >
        {f.entete && (
        <div className={`sheet-timbre ${v.enteteDroite || !readOnly ? "trois" : ""}`}>
          <div className="sheet-col">
            {!(v.enteteDroite || !readOnly) && logo}
            {field("entete", "En-tête : ministère, direction, service", "sheet-entete")}
          </div>
          {(v.enteteDroite || !readOnly) && (
            <>
              <div className="sheet-col sheet-armoiries">{logo}</div>
              <div className="sheet-col">{field("enteteDroite", "En-tête de droite (République, devise)", "sheet-entete")}</div>
            </>
          )}
        </div>
        )}

        <div className="sheet-top">
          <div className="sheet-left">
            {f.refs && field("refs", "Références : N°____/…", "sheet-refs")}
            {f.refs && (v.vref || !readOnly) && (
              <div className={`sheet-vref ${v.vref ? "" : "print-hide"}`}>
                <span>V/Réf. :</span>
                <input
                  className="sheet-inline"
                  value={v.vref}
                  placeholder="(facultatif)"
                  readOnly={readOnly}
                  onChange={(e) => props.onChange?.("vref", e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="sheet-right">
            <div className="sheet-date">
              <input
                className="sheet-inline sheet-lieu"
                value={v.lieu}
                placeholder="Ville"
                readOnly={readOnly}
                aria-label="Ville"
                onChange={(e) => props.onChange?.("lieu", e.target.value)}
              />
              <button
                type="button"
                className="sheet-datebtn"
                disabled={readOnly}
                onClick={() => dateInput.current?.showPicker?.()}
                title="Choisir la date"
              >
                {ligneDate("x", v.date).replace(/^x/, "")}
              </button>
              {!readOnly && v.date && (
                <button type="button" className="sheet-dateclear no-print" onClick={() => props.onChange?.("date", "")} title="Laisser la date en blanc">
                  ×
                </button>
              )}
              <input
                ref={dateInput}
                type="date"
                className="sheet-dateinput"
                value={v.date}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => props.onChange?.("date", e.target.value)}
              />
            </div>
            {!note && field("destinataire", "A\nDestinataire : qualité, organisme\n\nV I L L E", "sheet-dest")}
          </div>
        </div>

        {note && field("destinataire", "NOTE A\nMONSIEUR LE DIRECTEUR…", "sheet-note-dest")}

        <div className="sheet-objet">
          <strong>
            <u>Objet</u> :
          </strong>
          {field("objet", "objet du document")}
        </div>
        {(v.pj || !readOnly) && (
          <div className={`sheet-objet sheet-pj ${v.pj ? "" : "print-hide"}`}>
            <strong>
              <u>P.J.</u> :
            </strong>
            {field("pj", "pièces jointes, une par ligne (facultatif)")}
          </div>
        )}

        {!note && field("appel", "Formule d'appel", "sheet-appel")}
        {field("corps", "Corps du document (une ligne vide entre deux paragraphes)", "sheet-corps")}
        {field("politesse", note ? "Formule finale" : "Formule de politesse", "sheet-corps")}

        <div className="sheet-sign">
          {field("signature", "Signature (vide si manuscrite)")}
          {props.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sheet-sigimg" src={props.signatureUrl} alt="Signature" />
          )}
        </div>

        {(v.ampliation || !readOnly) && (
          <div className={`sheet-ampliation ${v.ampliation ? "" : "print-hide"}`}>
            <span>
              <u>Ampliation</u> :
            </span>
            {field("ampliation", "destinataires en copie, un par ligne (facultatif)")}
          </div>
        )}

        {f.pied && (v.pied || !readOnly) && field("pied", "Pied de page (facultatif)", "sheet-pied")}
      </article>
    </div>
  );
}
