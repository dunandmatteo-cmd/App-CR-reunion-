# App CR réunion

Application web (PC et smartphone) pour produire un **brouillon de compte rendu de réunion** à partir d'un enregistrement audio, avec export Excel du plan d'actions.

```
Enregistrer (ou importer) l'audio → Transcrire (Mistral Voxtral) → Corriger la transcription
→ Générer le CR (Claude) → Relire / corriger le CR → Exporter Excel / copier le texte
```

> ⚠️ Le CR produit est un **brouillon**. La transcription automatique et la rédaction peuvent contenir des erreurs (termes techniques, références, attributions). Il doit être relu et validé par une personne avant diffusion ou archivage comme enregistrement qualité.

## Fonctionnalités

- Enregistrement depuis le navigateur (micro du PC ou du téléphone), pause/reprise, vumètre, maintien de l'écran allumé (si supporté).
- Sauvegarde continue des morceaux d'enregistrement dans le navigateur : en cas de fermeture accidentelle, l'audio est proposé en récupération.
- Import d'un fichier audio existant (mp3, m4a, wav, webm…).
- Transcription en français avec séparation des intervenants (« Intervenant 1, 2… ») et vocabulaire métier (8D, WPS, QMOS, ressuage…).
- Transcription modifiable avant rédaction.
- CR structuré : participants, objet, synthèse, points abordés, **décisions**, **actions (responsable, délai, priorité, référence NC/8D)**, points ouverts, **points à vérifier** (passages douteux de la transcription), prochaine réunion.
- Règles de rédaction : pas d'invention ; responsable ou délai non énoncé → « À définir » (surligné en jaune).
- Export **Excel** : onglet *Actions* (statut en liste déroulante, date de clôture, vérification de l'efficacité, filtres), onglets *Décisions* et *Compte rendu*.
- Brouillon conservé localement dans le navigateur jusqu'à « Nouvelle réunion ».

## Installation (PC Windows, Mac ou Linux)

1. Installer **Node.js 20 ou plus récent** : https://nodejs.org (version LTS).
2. Récupérer ce dépôt, puis dans un terminal ouvert dans le dossier :
   ```bash
   npm install
   ```
3. Copier `.env.example` en `.env` et renseigner :
   - `ANTHROPIC_API_KEY` : clé créée sur la Console Anthropic (https://platform.claude.com), rubrique *API keys*. Facturation à l'usage : il faut ajouter un moyen de paiement ou des crédits.
   - `MISTRAL_API_KEY` : clé créée sur https://console.mistral.ai, rubrique *API keys*.
   - `APP_PASSWORD` : mot de passe d'accès (obligatoire en pratique dès que l'app est accessible par d'autres que toi).
4. Lancer :
   ```bash
   npm start
   ```
5. Ouvrir http://localhost:3000 dans Chrome, Edge ou Firefox.

## Utilisation sur smartphone

Le navigateur n'autorise le micro **qu'en HTTPS** (ou sur `localhost`). Pour utiliser le téléphone, l'app doit donc être hébergée derrière HTTPS, par exemple :

- sur un serveur interne de l'entreprise avec un certificat (à voir avec l'informatique) ;
- ou chez un hébergeur Node.js (Render, Railway, Scaleway, OVH…) en renseignant les variables du `.env` dans leur interface et **avec `APP_PASSWORD` défini**.

Alternative sans hébergement : enregistrer avec l'application dictaphone du téléphone, puis importer le fichier dans l'app sur le PC.

## Confidentialité et conformité : à valider avant usage

- **Flux de données** : l'audio est envoyé à **Mistral AI** (transcription) ; le texte de la transcription est envoyé à **Anthropic** (rédaction). Le serveur de l'app ne stocke pas l'audio sur disque (traitement en mémoire). Vérifier les conditions de conservation des données de chaque fournisseur et leur compatibilité avec les engagements de confidentialité clients (plans, réclamations, données fournisseurs).
- **RGPD** : l'enregistrement de la voix est un traitement de données personnelles. L'app impose de cocher l'information des participants avant d'enregistrer ; la règle interne (information, durée de conservation de l'audio, suppression après validation du CR) est à définir avec le référent RGPD.
- **Système qualité** : si les CR servent de preuve (revues de direction, suivi des actions correctives…), les traiter comme les autres informations documentées conservées (identification, validation, archivage).

## Coûts indicatifs

Facturation à l'usage par les deux fournisseurs (transcription à la minute d'audio, rédaction au volume de texte). Pour une réunion d'une heure, compter de l'ordre de quelques dizaines de centimes à environ un euro selon les tarifs en vigueur : **vérifier les grilles tarifaires actuelles** de Mistral et d'Anthropic.

## Paramètres optionnels (`.env`)

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port HTTP | 3000 |
| `MAX_AUDIO_MB` | Taille max d'un fichier audio | 300 |
| `CLAUDE_MODEL` | Modèle Claude utilisé pour la rédaction | `claude-opus-5-5` |
| `MISTRAL_TRANSCRIPTION_MODEL` | Modèle de transcription | `voxtral-mini-latest` |

## Structure

```
server.js              Serveur Express (API + fichiers statiques, mot de passe)
src/transcription.js   Appel Mistral Voxtral, mise en forme par intervenant
src/claude.js          Consignes de rédaction + schéma JSON du CR, appel Claude
src/excel.js           Génération du classeur Excel
public/                Interface web (HTML/CSS/JS sans framework)
```
