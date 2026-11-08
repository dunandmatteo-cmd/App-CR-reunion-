# App CR réunion (association)

Outil **gratuit et local** pour produire un brouillon de compte rendu de réunion (bureau, comité directeur, commissions) à partir d'un enregistrement audio, avec export **Word** et **Excel des actions**.

Il assemble des briques open source existantes au lieu de tout réinventer :

| Étape | Outil | Coût | Où sont les données |
|---|---|---|---|
| Enregistrer | Dictaphone (iPhone) ou QuickTime (Mac) | gratuit | sur l'appareil |
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
2. **Enregistre** avec le Dictaphone de l'iPhone posé au centre de la table, ou QuickTime sur le Mac (*Fichier → Nouvel enregistrement audio*). Transfère le fichier sur le Mac (AirDrop).
3. **Transcris avec noScribe** :
   - Langue : *French* ;
   - Qualité : *Precise* ;
   - Détection des intervenants : le **nombre de participants** (plus fiable que *Auto*) ;
   - Sortie : *.html* (par défaut).
   
   Compte de 1 à 3 h de traitement pour 1 h de réunion selon le site de noScribe (sans doute moins sur une puce M5, non mesuré). Tu peux lancer le traitement le soir.
4. **Ouvre `index.html`** (double-clic ; Safari, Chrome ou Firefox) :
   1. renseigne les informations de la réunion ;
   2. importe le fichier de noScribe ;
   3. **anonymise** : le bouton « Ajouter les participants » remplit la table. Ajoute les nageurs et les autres personnes citées, en particulier les **mineurs**, avec « Rétablir » décoché ;
   4. clique sur **Copier le texte pour Claude.ai**, colle-le dans une nouvelle conversation sur claude.ai, puis recopie la réponse dans l'app et clique sur **Importer** ;
   5. relis et corrige le CR. Les **points sensibles** sont encadrés en rouge, et les responsables, délais ou votes manquants sont surlignés en jaune ;
   6. **exporte en Word** (pour le secrétaire) et **en Excel** (suivi des actions).
5. **Après validation** : supprime l'enregistrement audio et le fichier de transcription.

Le travail en cours est gardé dans le navigateur. **Nouvelle réunion** efface tout sauf la liste des noms à anonymiser et les participants habituels.

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
assets/app.js         Import de la transcription, anonymisation, édition du CR
assets/prompt.js      Consignes de rédaction envoyées à Claude, lecture de la réponse
assets/export.js      Génération du Word et de l'Excel
assets/style.css      Mise en forme (thème clair et sombre)
assets/vendor/        docx 9.15.3 et ExcelJS 4.4.0 (MIT), embarqués pour fonctionner hors ligne
```
