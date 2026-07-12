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
- Auto-génération planning lors de l'approbation de congé : type=`leave` (CP) ou `rtt`, note "Congé payé (validé)" / "RTT (validé)", badgeage effacé pour ces jours
- Acquisition CP : +2,5 jours au 1er du mois (idempotent par employé/mois)
- Sync bidirectionnelle admin ↔ employé : le frontend envoie `X-Employee-Id` header sur chaque requête

## Architecture
- Backend FastAPI `/app/backend/server.py` (~2400 lignes) — routes `/api`, admin sous `/api/admin`, MongoDB motor, ContextVar pour l'utilisateur courant
- Frontend React + Shadcn UI + Tailwind
- `/app/frontend/src/pages/Management.jsx` — shell + 5 sous-routes
- `/app/frontend/src/lib/api.js` — interceptor axios ajoutant `X-Employee-Id` depuis localStorage

## Changelog
### 2026-07 (session actuelle)
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
