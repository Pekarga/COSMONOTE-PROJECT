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
          <p className="muted">Le rédacteur, version 0.5.2</p>
        </div>
      </div>
      <p>
        L&apos;application prépare vos courriers de réponse et vos notes au Directeur à partir des dossiers imputés, dans la mise
        en page et le style de vos courriers signés. Le projet reste un brouillon : relisez-le, complétez les passages
        signalés [à compléter], puis faites-le signer.
      </p>
      <ol className="steps">
        <li>Modèles : déposez vos courriers signés (Word, PDF ou scans).</li>
        <li>Lucarne : glissez le dossier imputé par le Directeur.</li>
        <li>Pièces justificatives : ajoutez-les au dossier, cochez P.J. pour les mentionner.</li>
        <li>Rédigez, relisez sur la page A4, puis exportez en Word ou en PDF.</li>
      </ol>
      <p className="small muted">
        Tout se passe sur cet ordinateur, sans Internet : vos fichiers, la lecture des scans, l&apos;analyse et la rédaction.
        La rédaction s&apos;appuie sur le modèle de langue Ministral 3 8B (Mistral AI, licence Apache 2.0), téléchargé une seule
        fois depuis les Paramètres, et sur le moteur llama.cpp (licence MIT).
      </p>
    </section>
  );
}
