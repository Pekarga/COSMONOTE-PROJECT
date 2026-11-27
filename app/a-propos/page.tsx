import { InfoIcon } from "@/components/Icons";

export default function AProposPage() {
  return (
    <section className="card panel" style={{ maxWidth: 760 }}>
      <h2 className="panel-head">
        <InfoIcon size={20} /> À propos
      </h2>
      <div className="apropos-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" />
        <div>
          <h1>Rédacteur de Courriers Administratifs</h1>
          <p className="muted">Le rédacteur, version 0.3.1</p>
        </div>
      </div>
      <p>
        L&apos;application prépare vos courriers de réponse et vos notes au Directeur à partir des dossiers imputés, dans la mise
        en page et le style de vos courriers signés. Le projet reste un brouillon : relisez-le, complétez les passages
        signalés [à compléter], puis faites-le signer.
      </p>
      <ol className="steps">
        <li>Modèles : déposez vos courriers signés (Word de préférence).</li>
        <li>Lucarne : glissez le dossier imputé par le Directeur.</li>
        <li>Pièces justificatives : ajoutez-les au dossier, cochez P.J. pour les mentionner.</li>
        <li>Rédigez, relisez sur la page A4, puis exportez en Word ou en PDF.</li>
      </ol>
      <p className="small muted">
        Vos fichiers restent sur cet ordinateur. Sans clé Claude, l&apos;application fonctionne en mode démo, avec des règles simples.
      </p>
    </section>
  );
}
