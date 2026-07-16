# MS Park Intranet — PRD

## Problème / Vision
Intranet premium pour employés du parc MS Park + espace administrateur pour le Responsable Opérationnel. MVP simulé (auth mockée via `X-Employee-Id` header) avec deux comptes seed. Données démo réalistes. Tout en français.

## Identité visuelle
- Glassmorphism, cartes arrondies
- Bleu nuit `#071B34`, bleu accent `#3BA4FF`, fond `#F4F7FA`
- Réf : `/app/design_guidelines.json`

## Comptes de démo
- **Employé** — Idriss MALONGA — `idriss.malonga@gmail.com` / `Idriss2026!` — 24h/semaine
- **Admin** — Marcus SIMÉO — `marcus.simeo@mspark.fr` / `MSPark@Admin2026!` — 35h/semaine, Responsable Opérationnel

## Modules livrés
### Employé
- **Dashboard** temps réel (horloge Paris, prise de poste, carrousel des news featurées, KPI hebdo dynamiques, semaine en chiffres OFF/CP/retards/absences)
- **Points Repas** (20 pts/jour crédités auto)
- **Restaurant** : menu 4 stands, panier modal centré, commandes **jour J uniquement**, +1h min pour retrait, QR code, statut évolutif, historique limité à 3 avec "Voir tout"
- **Planning** mensuel (fix bug offset UTC → toutes vues sync sur le jour local)
- **Badgeage** (généré depuis planning)
- **Demandes RH** (CP, RTT, arrêt maladie, badge perdu) avec upload
- **Actualités**, **Messagerie** (refonte : scroll fixe, responsive, archive/suppression, groupes), **Documents RH**, **Agenda**, **Avantages**, **Contacts**, **Profil**

### Admin (visible uniquement si `me.is_admin`)
- **Vue d'ensemble** : stats globales, volumes horaires par employé vs contrat, demandes à traiter
- **Plannings** : CRUD complet (créer/modifier/supprimer entrées shift/off/leave/training), navigation semaine par semaine, alerte contrat automatique ("X heures manquantes / Contrat respecté / +X heures supplémentaires prévues")
- **Demandes** : filtrer par statut, approuver/refuser/demander complément — l'approbation d'un CP/RTT **injecte automatiquement** les jours dans le planning ET **décrémente les compteurs**
- **Attributions RTT/CP** : sélection multi-employés + attribution de jours ; simulation de l'acquisition mensuelle (+2,5 CP/mois)
- **Actualités** : publication complète (titre, contenu, image, catégorie, texte+URL du CTA), toggle Carrousel/Épinglée/Active, ordre modifiable

## Règles métier clés
- Commande restaurant : le jour J uniquement, ≥ 1 h avant retrait
- Auto-consommation CP : d'abord CP N-1 puis CP N
- **Approbation congé** : pour chaque jour de la période demandée
  - Si jour OFF → **ignoré** (pas d'entrée CP, pas de décompte)
  - Si jour SHIFT → converti en `type=leave`, horaires préservés, décompte 1 jour
  - Si jour déjà leave/rtt/training → ignoré
- **Heures CP couvertes** : `_covered_minutes` prend shift + leave + rtt en compte → un jour CP couvre bien les heures prévues du contrat, aucune heure manquante générée
- Acquisition CP : +2,5 jours au 1er du mois (idempotent par employé/mois)
- Sync bidirectionnelle admin ↔ employé : `X-Employee-Id` header

## Architecture
- Backend FastAPI `/app/backend/server.py` (~2400 lignes) — routes `/api`, admin sous `/api/admin`, MongoDB motor, ContextVar pour l'utilisateur courant
- Frontend React + Shadcn UI + Tailwind
- `/app/frontend/src/pages/Management.jsx` — shell + 5 sous-routes
- `/app/frontend/src/lib/api.js` — interceptor axios ajoutant `X-Employee-Id` depuis localStorage

## Changelog
### 2026-08 — Historique badgeage tous comptes + demande RTT
- **Badgeage historique pour tous** : le seed génère désormais l'historique de badgeage pour **tous les employés** (Idriss + Marcus + Léa + tous les seeds), pas seulement pour Idriss. Chaque employé a ~21 jours d'entrées (mois roulant), anomalies déterministes par employé.
- **Dashboard "Aujourd'hui" aligné sur le badgeage intelligent** : `/api/dashboard` utilise désormais `_compute_today_badging()` (même helper que `/api/badging`) → les 4 badges (entrée / sortie pause / reprise / sortie) affichés sur le tableau de bord correspondent exactement à ceux de la page Badge.
- **Léa a désormais un planning** : Mon-Fri 09:30–17:30 avec pause 12:30–13:30 (35h/sem).
- **Demandes RH — type RTT ajouté** dans le sélecteur (icône soleil orange) aux côtés de Congé payé, Absence, Échange horaires, Acompte, Matériel, Arrêt maladie. Le backend accepte déjà `type: "rtt"` (approved via `is_rtt`, décrémente `leave_balance.rtt`, crée un planning `type: "rtt"` sur les jours concernés).
- **Attribution RTT admin** : déjà en place dans `LeaveGrantManager` (`/management/attributions`) — l'admin peut créditer N jours de RTT à N employés en un clic.

### 2026-08 — Générateur de formulaires personnalisés
- **Backend** : nouveaux modèles `CustomForm`, `FormField`, `FormResponse` + endpoints CRUD :
  - `GET/POST/PUT/DELETE /admin/forms` (admin + comm editors)
  - `GET /forms/{id}` (public — employés connectés)
  - `POST /forms/{id}/submit` (dépose la réponse + notif push au créateur)
  - `GET /admin/forms/{id}/responses` (résultats)
- **12 types de champs** : text, email, tel, textarea, select, checkbox, radio, date, file, number, url, section (titre/paragraphe séparateur).
- **Frontend** : nouvelle page `/management/formulaires` (`FormBuilder.jsx`) — liste des formulaires (badge actif/désactivé, N champs, N réponses, URL publique copiable), constructeur avec palette de types + réordonner ↑↓ + options éditables inline pour select/radio/checkbox, `ResponsesModal` avec liste des réponses et **export CSV**.
- **Formulaire public** `/formulaires/{id}` (`PublicForm.jsx`) :
  - Rendu de tous les types de champs avec styles cohérents.
  - **Auto-prefill** du prénom, nom, email et téléphone depuis l'employé connecté (matching sur nom technique + libellé).
  - Validation des champs obligatoires côté client.
  - Écran de succès avec le message personnalisé.
- **Intégration cible de bouton** : dans le CTA d'événement (type "Formulaire"), nouveau `FormPickerOrUrl` — l'admin choisit un formulaire créé dans une liste déroulante OU colle une URL libre.
- **Seed** : 2 formulaires démo — "Inscription — Séminaire MS Park 2026" (8 champs) et "Suggestions & idées 💡" (4 champs).
- **Sidebar** : Léa (Chargée de communication) voit également l'onglet "Formulaires" — elle peut créer/modifier/voir les résultats comme un admin.

### 2026-08 — Éditeur semaine complète + duplication planning
- **Backend** : nouveau `POST /admin/schedule/week` — accepte un `employee_id`, `week_start` (lundi), `entries[]` (jusqu'à 7 jours avec type/horaires/lieu/service), et `duplicate_weeks` (0..N). Congés/RTT validés préservés (jamais écrasés). Notification push envoyée à l'employé.
- **Frontend** : bouton "Éditer la semaine complète" dans le toolbar `PlanningManager`. Modal `WeekEditor` :
  - 7 lignes pré-remplies depuis les entrées existantes OU depuis le `weekly_pattern` de l'employé (OFF automatique le weekend).
  - Type toggle par ligne (Shift/OFF/Formation), horaires début/fin/pause/reprise, lieu.
  - Congés/RTT validés affichés en lecture seule ("Congé validé (verrouillé)").
  - Compteur total planifié vs contrat en temps réel (badge Conforme / -Xh / +Xh).
  - Menu "Dupliquer sur" : cette semaine / +1 / +2 / +3 (~mois) / +4 / +7 / +11 (~3 mois).
  - **Bouton unique "Enregistrer la semaine"** ou "Enregistrer N semaines" selon la duplication.
- Testé end-to-end : 28 jours créés en 1 clic (7×4 semaines) pour Marcus.

### 2026-08 — Bouton d'événement personnalisable + historique badgeage
- **Bouton d'événement 100% personnalisable** :
  - Toggle activation/désactivation
  - Texte libre (max 40 car.) + 9 raccourcis préréglés (Réserver, En savoir plus, Acheter un billet, Découvrir, Voir l'actualité, Voir le programme, Accéder au site, Répondre, Nous contacter)
  - 4 types de destination : Actualité (ID pérenne), Lien externe, Page interne, Formulaire/billetterie
  - Aperçu live du bouton avant sauvegarde
  - Backend : nouveaux champs `cta_enabled`, `cta_text`, `cta_target_type`, `cta_target_id`, `cta_url` sur `EventPayload` + migration automatique depuis les legacy `signup_enabled`/`linked_news_id`/`external_link` via `_normalize_event`.
  - Frontend `Agenda.jsx` modal + `NewsDetail` `EventDetail` utilisent uniquement le nouveau CTA unifié.
- **Historique badgeage** :
  - Filtre backend `filter_range=day/week/month` désormais roulant (aujourd'hui / 7 jours / 30 jours) au lieu de calendaire — l'historique passé s'affiche toujours.
  - Frontend Badgeage.jsx : n'affiche que les **5 derniers jours** + bouton **"↓ Voir plus (N jours supplémentaires)"** / **"↑ Réduire"**.

### 2026-08 — Titres, redirections, image agenda, rich text & sync globale
- **Titre obligatoire** sur les publications du fil (`PostCreate.title` requis backend, input dédié composer max 140 car).
- **Redirection par ID unique** : `NewsDetail` (`/actualites/:id`) résout news → fallback post automatique. Le lien reste valide même si le titre change.
- **TargetPicker fusionné** dans carrousel + agenda : liste combinée news + posts avec recherche par titre, ID affiché.
- **Image dans modal Agenda** + `end_date` (multi-jours), `intro_text`, boutons S'inscrire/Voir l'actualité liée/Lien externe.
- **RichTextEditor** custom (contentEditable + toolbar : gras/italique/souligné, H2/H3, listes puces/num, alignements, liens, emoji picker). CSS `.ms-rte` / `.ms-prose`.
- **Rendu HTML** via `dangerouslySetInnerHTML` avec classes `ms-prose` sur le fil + NewsDetail.
- **Synchronisation globale** : hook `useLiveData` + `notifyLiveRefresh` → toute mutation admin/comm rafraîchit instantanément les pages actualités/posts/carrousel/agenda/documents/plannings/notifications sur toutes les vues (same-tab + cross-tab via localStorage).

### 2026-08 — Chargée de communication + validation Sync CP
- **Sync CP/RTT confirmée** (bug déjà résolu dans une itération antérieure) : approbation d'un congé → planning employé ET planning admin affichent immédiatement "CONGÉ" sur les jours concernés (verified via curl + admin PlanningManager screenshot pour Marcus semaine 20-24 juil). Ajout du badge RTT dans typeStyles (Planning.jsx) et typeMeta (Management.jsx EntryCard) pour robustesse.
- **Nouveau compte "Chargée de communication"** — Léa DUBOIS (`emp-lea-comm`) — `lea.dubois@mspark.fr` / `MSPark@Comm2026!`. Flag `can_manage_communication: true`, `is_admin: false`.
- **Nouveau helper `require_communication_editor()`** côté backend qui autorise admins OU comm editors sur : `POST/PUT/DELETE /admin/news`, `POST/PUT/DELETE/GET /admin/events`, `POST /admin/broadcast`, `POST /posts`, `DELETE /posts/{id}`.
- **News publiées par Léa** → `author_name: "MS Park"`, `posted_as: "official"` (au nom du compte officiel).
- **Posts sur le fil par Léa** → forcés en `posted_as: "official"` côté backend, badge "Communication" orange dans le composer, toggle "Publier en tant que" masqué.
- **Sidebar** : nouveau bloc "Communication" (orange, icône Megaphone) affiché à Léa avec 2 liens seulement (Carrousel accueil, Agenda). Léa n'a AUCUN accès aux blocs Management/RH.
- **ManagementShell** : header adapté ("Espace Communication · Gestion de la communication interne" pour Léa vs "Espace Management · Pilotage opérationnel" pour admin). Routes admin gardées `is_admin`-only, routes `carrousel`/`agenda` ouvertes aux comm editors.
- **LoginPage** : 3 boutons quickfill (Employé / Com' / Admin).

### 2026-08 — Agenda Admin + Carrousel v2
- **Fix crash** `Can't find variable: AgendaManager` sur `/management/agenda` (composant manquant côté frontend)
- **AgendaManager complet** ajouté à `Management.jsx` : CRUD événements, catégories (event/training/meeting/birthday/maintenance), ciblage multi-groupes (all/admin/managers/ops/restauration) + ciblage employés spécifiques, image, description, inscription optionnelle avec URL, actualité liée, lien externe
- **Helper `_normalize_event`** côté backend : synchronise `category ↔ type`, `start_time ↔ time`, `signup_enabled ↔ needs_registration` (nouveaux événements admin s'affichent désormais correctement sur l'Agenda employé qui lit les clés legacy)
- **Filtrage `/api/events` par `group_targets`** vérifié : employé (role=employe) voit `all` + `ops`, admin voit `all` + `admin`, encadrement voit `all` + `managers/encadrement`, restauration voit `all` + `restauration`. Ciblage employé unitaire (`employee_targets`) fonctionne.
- **NewsCarousel CTA routing** vérifié : `target_type=event` → `/agenda/event/{id}`, `target_type=news` → `/actualites/{id}`, external/internal/document routent correctement.
- **PUT /api/admin/events** : les valeurs `None` sont maintenant filtrées pour éviter d'écraser des champs existants lors d'updates partiels.
- **data-testid `event-detail-modal`** ajouté sur la modal Agenda employé.

### 2026-07 — Update final
- **Seed Idriss corrigé** : planning 24h/semaine exact (Mer-Sam 09h-14h + Dim 10h-14h)
- Suppression des pauses artificielles sur shifts < 6h (conforme code du travail)
- **Contract respecté** même sur une semaine complète en CP (24h/24h)
- **Générateur de fiche de paie** conforme au modèle simplifié français (SIRET, APE, cotisations CSG/CRDS/retraite/maladie/chômage/complémentaire, net imposable, prélèvement à la source)
- **Page /documents/payslip/:emp/:year/:month** — rendu premium imprimable
- **Onglets Management ajoutés** : Documents RH (upload avec ciblage employé/tous + génération fiche de paie 1 clic) et Fil MS Park (broadcast dans canaux publics)
- **Endpoint POST /api/admin/broadcast** — messages officiels avec badge "📣 Annonce officielle"
- **Endpoint POST /api/admin/documents** + `/admin/documents/payslip`
- **Endpoint GET /api/documents** filtré par target_employee_id (employé voit uniquement les siens + les broadcast "all")
- **Compte admin Marcus SIMÉO** ajouté au seed avec `is_admin: True`, contract_hours_weekly: 35
- **X-Employee-Id middleware** + ContextVar : multi-utilisateur simulé
- **Login réel** POST `/api/auth/login` avec rejet 401 si mauvais mot de passe
- **Sidebar** : section "Management" avec badge violet visible uniquement pour admin
- **Page Management** avec 5 sous-routes fonctionnelles
- **Planning CRUD admin** avec alerte contrat dynamique
- **Auto-sync congés/RTT** : approbation → planning + compteur
- **Attributions RTT/CP + accrual mensuel** simulé
- **Actualités CRUD admin** + carrousel filtré (`/api/carousel` = featured + active)
- **Fix bug offset planning** : `toISOString()` UTC → ISO local (résout le décalage 1 jour)
- **Messagerie refonte** : scroll interne fixe, responsive mobile, archive/suppression, création groupes fonctionnelle
- **Restaurant** : panier en modal centré (plus de drawer), verrouillé sur jour J, historique limité à 3 avec "Voir tout"
- **Profil** : email pro supprimé
- **Header** : email retiré du menu déroulant

## Backlog (P2)
- Messagerie temps réel (WebSocket) + appels audio/vidéo
- Signature électronique PDF sur documents
- 2FA / PWA mobile
- Pièces jointes réelles dans news (upload d'images/PDF, actuellement seulement URL)
- Drag-and-drop pour réordonner le carrousel (actuellement flèches ± 10)
- Pauses dans planning : lookup table au lieu de milieu-22min (bug iter3 encore ouvert)
