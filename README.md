# App CR réunion (association)

Outil **gratuit et local** pour produire un brouillon de compte rendu de réunion (bureau, comité directeur, commissions) à partir d'un enregistrement audio, avec export **Word** et **Excel des actions**.

Il assemble des briques open source existantes au lieu de tout réinventer :

| Étape | Outil | Coût | Où sont les données |
|---|---|---|---|
| Enregistrer | Dictaphone de l'iPhone, transfert par AirDrop | gratuit | sur l'iPhone, puis sur le Mac |
| Transcrire et séparer les voix | [noScribe](https://github.com/kaixxx/noScribe) (Whisper + pyannote, GPL-3.0) | gratuit | sur le Mac, hors ligne |
| Anonymiser | cette app | gratuit | sur le Mac |
| Rédiger le CR | [Claude.ai](https://claude.ai), par copier-coller | gratuit (dans les limites de ton offre) | le texte **anonymisé** part chez Anthropic |
| Relire, exporter Word et Excel | cette app ([docx](https://github.com/dolanmiu/docx) et [ExcelJS](https://github.com/exceljs/exceljs), MIT) | gratuit | sur le Mac |

> ⚠️ Le résultat est un **brouillon**. La transcription automatique se trompe (noms, chiffres, attribution des voix), surtout à plusieurs autour d'une table. Relis en particulier les votes, les décisions, les responsables et les délais avant d'envoyer au secrétaire.

## Installation (une seule fois)

1. **noScribe** : télécharge la version Apple Silicon sur https://noscribe.de (environ 3 Go, macOS 14 minimum), ouvre le DMG et glisse noScribe et noScribeEdit dans *Applications*.
2. **Cette app** : sur GitHub, bouton **Code → Download ZIP**, puis décompresse le dossier où tu veux (par exemple dans *Documents*).
3. C'est tout : pas de compte, pas de clé API, rien d'autre à installer.

## Utilisation

1. **Avant la réunion** : préviens les participants que la réunion est enregistrée, et pourquoi.
2. **Enregistre** avec le Dictaphone de l'iPhone posé au centre de la table (voir « Enregistrer avec l'iPhone » ci-dessous), puis envoie le fichier .m4a sur le Mac par **AirDrop**.
3. **Transcris avec noScribe** :
   - Langue : *French* ;
   - Qualité : *Precise* ;
   - Détection des intervenants : le **nombre de participants** (plus fiable que *Auto*) ;
   - Sortie : *.html* (par défaut).
   
   Compte de 1 à 3 h de traitement pour 1 h de réunion selon le site de noScribe (sans doute moins sur une puce M5, non mesuré). Tu peux lancer le traitement le soir.
4. **Ouvre `index.html`** (double-clic ; Safari, Chrome ou Firefox) :
   1. renseigne les informations de la réunion ;
   2. importe le fichier de noScribe ;
   3. **retire** les passages trop sensibles : sélectionne-les dans la transcription, puis « Retirer la sélection de l'envoi » ;
   4. **anonymise** : le bouton « Ajouter les participants » remplit la table. Ajoute les nageurs et les autres personnes citées, en particulier les **mineurs**, avec « Rétablir » décoché. Traite ensuite chaque ligne de la **détection automatique** (Anonymiser ou Ignorer) ;
   5. lis le **rapport avant envoi**. Si des alertes restent, la copie n'est possible qu'après avoir coché la confirmation ;
   6. clique sur **Copier le texte pour Claude.ai**, colle-le dans une nouvelle conversation sur claude.ai, puis recopie la réponse dans l'app et clique sur **Importer** ;
   7. relis et corrige le CR. Les **points sensibles** sont encadrés en rouge, et les responsables, délais ou votes manquants sont surlignés en jaune ;
   8. **exporte en Word** (pour le secrétaire) et **en Excel** (suivi des actions).
5. **Après validation** : supprime l'enregistrement audio et le fichier de transcription.

Le travail en cours est gardé **chiffré** dans le navigateur (voir ci-dessous). **Nouvelle réunion** efface tout sauf la liste des noms à anonymiser et les participants habituels.

## Enregistrer avec l'iPhone

### Une seule fois : régler l'iPhone

- **Synchronisation iCloud du Dictaphone** : *Réglages → [ton nom] → iCloud → Afficher tout → Dictaphone*. Si elle est activée, chaque enregistrement est copié sur iCloud et sur tes autres appareils. Deux choix :
  - **la désactiver** (le plus simple : l'audio ne quitte l'iPhone que par AirDrop) ;
  - ou garder la synchronisation et activer la **Protection avancée des données** iCloud (*Réglages → [ton nom] → iCloud*), qui chiffre de bout en bout la plupart des données iCloud. Vérifie dans la liste d'Apple que le Dictaphone en fait partie.
- **Code de déverrouillage** : un iPhone protégé par un code chiffre son stockage. Un code à 6 chiffres minimum, et Face ID.
- **Qualité audio** (*Réglages → Apps → Dictaphone → Qualité audio*) : *Compressé* suffit pour la transcription ; *Sans perte* donne des fichiers bien plus lourds.

### Raccourci « Réunion CR » : lancer l'enregistrement d'un geste

L'app **Raccourcis** (gratuite, déjà installée) permet de tout préparer en un seul geste. Les noms des actions peuvent varier légèrement selon la version d'iOS ; tape le début du nom dans la recherche d'actions.

**Raccourci 1 : « Réunion CR »** (Raccourcis → + → ajouter les actions dans cet ordre)

1. **Obtenir le niveau de la batterie**
2. **Si** *Niveau de la batterie* *est inférieur à* `50`
   - **Afficher une alerte** : « Batterie faible : branche l'iPhone ou recharge-le avant la réunion. » (laisser « Afficher le bouton Annuler » activé)
   - **Fin si**
3. **Définir le mode de concentration** : *Activer* *Ne pas déranger* *jusqu'à désactivation*
4. **Afficher une alerte** : « As-tu annoncé l'enregistrement aux participants ? » (avec bouton Annuler)
5. **Enregistrer un nouveau mémo vocal** (action de l'app Dictaphone) : ouvre le Dictaphone et démarre l'enregistrement.

**Raccourci 2 : « Fin de réunion »**

1. **Définir le mode de concentration** : *Désactiver* *Ne pas déranger*
2. **Ouvrir l'app** : *Dictaphone* (pour arrêter si ce n'est pas fait, puis envoyer par AirDrop)

**Lancer le raccourci**, au choix :

- **Toucher le dos** (discret, sans déverrouiller l'écran d'accueil) : *Réglages → Accessibilité → Toucher → Toucher le dos → Toucher deux fois → Réunion CR* ;
- une **icône sur l'écran d'accueil** : dans le raccourci, ⓘ → *Ajouter à l'écran d'accueil* ;
- **Siri** : « Dis Siri, réunion CR ».

**Avant la première vraie réunion**, fais un essai de 5 minutes en verrouillant l'écran pendant l'enregistrement. Vérifie que l'enregistrement continue et que le fichier s'envoie bien par AirDrop.

> Pourquoi pas l'action « Enregistrer du son » de Raccourcis ? Elle enregistre dans le raccourci lui-même, ce qui est moins fiable sur une réunion de 2 h (interruption possible si l'app passe en arrière-plan). Le Dictaphone continue d'enregistrer écran verrouillé.

### À chaque réunion

1. **Mode Avion, ou au moins Ne pas déranger** (fait par le raccourci « Réunion CR ») : un appel entrant peut interrompre l'enregistrement.
2. **Batterie et stockage** : au moins 50 % de batterie pour 2 h, et quelques centaines de Mo libres.
3. **Placement** : à plat, écran vers le haut, au centre de la table et à égale distance des participants. Mets-le sur un tissu ou un sous-verre pour limiter les bruits de table, et loin des ordinateurs, de la machine à café et des fenêtres ouvertes. Le micro principal est en bas de l'iPhone : oriente ce côté vers le centre.
4. **Au café** : le bruit de fond (vaisselle, musique, autres tables) dégrade nettement la transcription. Choisis un coin calme, ou fais un test de 2 minutes avant (noScribe permet de ne transcrire qu'un extrait).
5. **Annonce** l'enregistrement en début de réunion, et éventuellement fais-le confirmer à l'oral.

### Après la réunion

1. **AirDrop vers le Mac** : le transfert est direct et chiffré entre les deux appareils, et le fichier arrive dans *Téléchargements*. Range-le dans un dossier dédié.
2. **Supprime l'enregistrement sur l'iPhone**, puis **vide « Supprimés récemment »** dans le Dictaphone. Sinon il y reste environ 30 jours (durée réglable dans *Réglages → Apps → Dictaphone*).
3. **Sauvegardes** : si l'iPhone est sauvegardé (iCloud ou Mac) avant la suppression, l'audio s'y trouve aussi. Ça se règle en le supprimant rapidement, ou avec la Protection avancée des données.

## Chiffrement du brouillon

Au premier lancement, l'app demande de **créer un mot de passe** (10 caractères minimum ; une courte phrase est idéale). Le brouillon (transcription, table des vrais noms, réponse de Claude, CR) est ensuite **chiffré dans le navigateur** avant d'être stocké :

- chiffrement AES-GCM 256 bits avec la Web Crypto API du navigateur, et une clé dérivée du mot de passe (PBKDF2-SHA-256, 600 000 itérations, sel aléatoire) ;
- le mot de passe n'est enregistré nulle part : **s'il est perdu, le brouillon est irrécupérable** (bouton « Mot de passe oublié » = tout effacer) ;
- verrouillage par le bouton 🔒 ou **automatiquement après 15 min d'inactivité** ;
- un ancien brouillon non chiffré est repris dans le coffre puis effacé à la création du mot de passe.

Ce que ce chiffrement **ne couvre pas** :

- **le texte envoyé à Claude.ai** : il doit être lisible pour être traité, et c'est l'anonymisation qui le protège ;
- **les fichiers sur le disque** : audio, transcription noScribe, Word et Excel exportés. Pour eux, active **FileVault** (*Réglages Système → Confidentialité et sécurité → FileVault*) et supprime-les une fois le CR validé ;
- **l'audio sur l'iPhone et dans iCloud** : voir « Enregistrer avec l'iPhone » ;
- un Mac **déverrouillé et laissé sans surveillance** pendant que le coffre est ouvert.

## Ce qui part chez Anthropic, et comment le réduire

Encoder le texte (Base64, etc.) ou le chiffrer avant l'envoi **ne protège rien** : Claude doit pouvoir le lire pour rédiger le CR, et le CR revient en clair. Seule la réduction de ce qui part est efficace. Elle se fait en trois couches, dans cet ordre :

1. **Passages retirés** : le passage sélectionné est remplacé dans la transcription par un repère ⟦Passage retiré n°X⟧. Son texte d'origine est gardé à part, dans le coffre chiffré. Claude reçoit seulement « [Passage retiré n°X : à rédiger manuellement] » et a pour consigne de ne rien en déduire.
2. **Pseudonymisation** : les noms et données listés dans la table sont remplacés (« [Personne A] », « [Téléphone] »…).
3. **Détection automatique** sur le texte qui va réellement partir : noms propres probables, e-mails, téléphones, adresses, codes postaux et villes, dates de naissance probables, IBAN, numéros de licence ou de dossier. Elle est volontairement large : « Ignorer » écarte une fausse alerte (mémorisé pour les réunions suivantes). Limites : un nom placé uniquement en début de phrase, un surnom courant ou une périphrase (« le fils du trésorier ») peuvent passer.

Le **rapport avant envoi** résume le tout. La copie est bloquée tant qu'il reste des alertes ou qu'aucun nom n'est anonymisé, sauf si tu coches la confirmation.

## Confidentialité : points à connaître

- L'audio et la transcription brute **ne quittent jamais le Mac**.
- Seul le texte **anonymisé**, que tu colles toi-même, part chez Anthropic (Claude.ai). L'anonymisation ne remplace que les noms listés : un nom absent de la liste, un surnom ou une faute de transcription (« Léa Martain ») passe en clair. Jette un œil à « Voir le texte envoyé » avant de copier.
- Dans Claude.ai, vérifie dans *Paramètres → Confidentialité* si tes conversations peuvent servir à améliorer les modèles, et désactive cette option si tu ne le souhaites pas.
- Claude peut se tromper de pseudonyme (attribuer à « [Personne B] » ce qu'a dit « [Personne C] »). Vérifie les noms rétablis.
- Une association est soumise au RGPD : informe les participants, ne garde l'audio que le temps nécessaire, et ne diffuse pas d'informations de santé ou concernant des mineurs sans nécessité.

## Limites connues

- La séparation des voix de noScribe se trompe parfois quand plusieurs personnes parlent en même temps ou que la discussion est dense (signalé par son auteur). Les étiquettes « S01, S02… » ne sont pas des noms.
- Pour une réunion de 2 h, le texte à coller est long. S'il dépasse ce que ton offre Claude.ai accepte, découpe la transcription en deux et fusionne les CR.
- Les exports Word et Excel ont une mise en forme simple : la mise en page finale est laissée au secrétaire.

## Structure

```
index.html            Page de l'app (ouvrir d'un double-clic)
assets/app.js         Import de la transcription, anonymisation, édition du CR, écran de verrouillage
assets/vault.js       Chiffrement du brouillon (AES-GCM, clé dérivée du mot de passe)
assets/detect.js      Détection des données identifiantes restantes avant envoi
assets/prompt.js      Consignes de rédaction envoyées à Claude, lecture de la réponse
assets/export.js      Génération du Word et de l'Excel
assets/style.css      Mise en forme (thème clair et sombre)
assets/vendor/        docx 9.15.3 et ExcelJS 4.4.0 (MIT), embarqués pour fonctionner hors ligne
```
