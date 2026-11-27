export type Status = "processing" | "ready" | "error";
/** « a_lire » : scan ou photo en attente de lecture sur l'ordinateur. */
export type SigneStatus = Status | "a_lire";

export type Genre = "courrier" | "note";

/** Un courrier signé déposé par l'utilisateur : il sert de modèle de mise en page et de style. */
export interface Signe {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: SigneStatus;
  error: string | null;
  demo: boolean;
  nomFichier: string;
  mime: string | null;
  /** Catégorie : réponse à une demande, convocation, relance… */
  type: string;
  objet: string;
  resume: string;
  /** « courrier » (réponse à la signature du directeur) ou « note » (note au directeur). */
  genre: Genre;
  entete: string;
  /** Bloc d'en-tête de droite : « REPUBLIQUE DE COTE D'IVOIRE / Union – Discipline – Travail ». */
  enteteDroite: string;
  refs: string;
  lieu: string;
  /** La date est laissée en blanc (« Abidjan, le »), complétée à la signature. */
  dateBlanche: boolean;
  destinataire: string;
  appel: string;
  politesse: string;
  signature: string;
  ampliation: string;
  pied: string;
  style: string;
  texte: string;
  police: string;
  hasLogo: boolean;
  hasSignatureImg: boolean;
  /** Mise en page utilisée par défaut pour les nouveaux courriers. */
  defaut: boolean;
}

export type SigneSummary = Pick<
  Signe,
  "id" | "createdAt" | "status" | "nomFichier" | "type" | "objet" | "resume" | "defaut" | "demo" | "genre"
>;

/** Compteurs des courriers signés (toute la base, pas seulement la page affichée). */
export interface SigneCompteurs {
  total: number;
  prets: number;
  notes: number;
  erreurs: number;
  aLire: number;
  enCours: number;
}

/** Un scan ou une photo dont le texte reste à lire sur l'ordinateur. */
export interface ALire {
  genre: "signe" | "piece";
  id: string;
  nom: string;
}

export type PieceRole = "dossier" | "justificatif";

export interface Piece {
  id: string;
  dossierId: string;
  role: PieceRole;
  nom: string;
  mime: string | null;
  taille: number;
  /** Texte lu dans le fichier (pour un scan ou une photo, par la lecture sur l'ordinateur). */
  texte: string;
  /** Scan ou photo : « attente » tant que son texte n'est pas lu, « echec » s'il n'a pas pu l'être. */
  lecture: "" | "attente" | "echec";
  /** Pièce justificative à joindre au courrier (mention P.J.). */
  joindre: boolean;
  createdAt: string;
}

/** Résultat de l'analyse d'un dossier imputé. */
export interface Analyse {
  resume: string;
  demandeur: string;
  appel: string;
  dateCourrier: string;
  refCourrier: string;
  objetCourrier: string;
  demandes: string[];
  instructionDirecteur: string;
  echeance: string;
  elements: string[];
  pieces: { nom: string; apport: string }[];
  pointsAVerifier: string[];
  orientation: string;
  objetReponse: string;
  typeReponse: string;
}

export type Ton = "courtois" | "ferme" | "bienveillant";

export interface Dossier {
  id: string;
  titre: string;
  createdAt: string;
  updatedAt: string;
  status: Status | "vide";
  step: string | null;
  error: string | null;
  demo: boolean;
  analyse: Analyse | null;
  consignes: string;
  ton: Ton;
  genre: Genre;
  signeId: string | null;
}

export interface DossierSummary {
  id: string;
  titre: string;
  createdAt: string;
  status: Dossier["status"];
  demo: boolean;
  pieces: number;
  courriers: number;
  resume: string;
}

/** Un projet de courrier, éditable, exportable en Word et en PDF. */
export interface Courrier {
  id: string;
  dossierId: string | null;
  signeId: string | null;
  createdAt: string;
  updatedAt: string;
  status: Status;
  error: string | null;
  demo: boolean;
  genre: Genre;
  entete: string;
  enteteDroite: string;
  refs: string;
  lieu: string;
  /** Date au format AAAA-MM-JJ, vide pour la laisser en blanc. */
  date: string;
  vref: string;
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
  /** Options d'édition et de mise en page choisies dans l'éditeur. */
  forme: MiseEnForme;
  remarques: string[];
}

/** Options d'édition (blocs affichés) et de mise en page du projet. */
export interface MiseEnForme {
  entete: boolean;
  refs: boolean;
  pied: boolean;
  /** Taille du texte, en points. */
  taille: number;
  /** Interligne : 1, 1,15 ou 1,5. */
  interligne: number;
  alignement: "justify" | "left";
}

/** Champs d'un courrier que l'IA (ou le mode démo) rédige. */
export interface Redaction {
  objet: string;
  vref: string;
  destinataire: string;
  appel: string;
  corps: string[];
  politesse: string;
  pj: string[];
  ampliation: string[];
  remarques: string[];
}
