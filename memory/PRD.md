# MS Park Intranet — PRD

## Problème et Vision
Intranet ultra premium (glassmorphism, cartes arrondies) pour les employés de MS Park. MVP couvrant Dashboard temps réel, Points Repas, Menu de restauration, Coin RH, Actualités, Messagerie, Documents RH, Agenda, Avantages, Profil. Système pré-rempli avec des données de démo. Rôle Administrateur pour tout gérer.

## Personas
- **Employé polyvalent** : consulte planning, badge, congés, messagerie, restauration, avantages.
- **Admin RH / Communication** : gère utilisateurs, plannings, congés/RTT, docs RH, actualités, newsletters.
- **Super Admin** : vue restreinte au management, aucune page employée.

## Architecture technique
- Frontend: React + Tailwind + Shadcn UI + Context API (`adminMode`, `me`).
- Backend: FastAPI (Python), MongoDB (motor).
- Auth simulée: header `X-Employee-Id`.
- Uploads: dossier local `/app/backend/uploads`.

## Changelog récent
- **iter 40 (26 août 2026)** — Onboarding nouveau employé (Julien BERNARD) : (1) Migration idempotente `_seed_julien_bernard()` avec marker `onboarding_julien_v1` — insertion employé (`emp-julien-bernard`, personal_email `julien.bernard@gmail.com`, password `Julien2026!`, `onboarding_pending=True`, welcomed_at et tour_completed_at à null) + création du canal Service RH personnel (`rh-emp-julien-bernard`) + post d'un message de bienvenue signé Pierre MOREAU (Directeur RH) + push notification. (2) Backend `/api/me` expose désormais `needs_tour = onboarding_pending AND not tour_completed_at`. (3) Nouvel endpoint `POST /api/me/tour/complete` qui set `tour_completed_at` et `onboarding_pending=False`. (4) Nouveau composant frontend `OnboardingTour.jsx` monté dans `App.js` juste après `WelcomePopup` : overlay avec spotlight SVG mask autour de l'élément ciblé, tooltip anchoré (right-of ou below-of) avec titre / description / progress bar / boutons Précédent/Suivant/Passer/Terminer. 11 étapes : Dashboard, Profil, Actualités, Messagerie, Planning, Badge, Congés, Restauration, CSE, Documents, Aide. Se déclenche uniquement après fermeture du WelcomePopup et pour les employés flaggés `onboarding_pending`.
- **iter 39 (26 août 2026)** — Actualités & Management : (1) Tri alphabétique des tabs de `/management` (Management.jsx `subNav`, "Vue d'ensemble" en tête) et du menu latéral admin (Sidebar.jsx `adminNav`). (2) Composer Actualités — quand `adminMode` est ON (ou user = comm-only), l'avatar affiche le logo officiel MS Park (`OFFICIAL_AVATAR`) et le placeholder devient "Quoi de neuf, **MS Park** ?". (3) Règle d'édition renforcée frontend+backend : les admins/comm ne peuvent **modifier** que leurs propres posts OU les posts `posted_as == "official"` (même publiés par un autre admin). La **suppression** reste possible sur tous les posts pour les admins/comm. Backend `PUT /api/posts/{id}` renvoie 403 sinon.
- **iter 38 (26 août 2026)** — Rebranding Login + Sidebar : remplacement de l'icône Sparkles par le logo transparent MS Park (`n4qg1w02_logo ms park transparent.png`) sur `LoginPage.jsx` (cadre 64×64 glassmorphism) et `Sidebar.jsx` (cadre 44×44 glassmorphism). Suppression des 3 boutons de démo (`quickfill-employee/comm/admin`) + valeurs par défaut email/mot de passe vidées. Nouveau lien `forgot-password-link` : `mailto:support@mspark.fr` avec libellé "Mot de passe oublié ? Envoyer un mail à support@mspark.fr (Service Web & IT)". Toast d'erreur générique. Import `Sparkles` retiré. Vérifié via screenshots.
- **iter 37 (26 août 2026)** — Reset canaux d'équipe + isolation stricte des boîtes. Migration one-shot (`team_reset_v1`) : tous les `team_channel_ids` vidés, tous les canaux `team-{key}` remis à 0 membres. Admins ré-assignent explicitement via wizard, système poste "X a rejoint le canal" à l'ajout (déjà en place). Suppression définitive des shared `service-{key}` inboxes (dépréciés) + `_sync_service_channel_membership` devient no-op. Frontend renforce `_is_service_thread` avec `is_service_inbox === true` (défense en profondeur). Résultat vérifié : Léa (Communication staff) ne voit plus "Service — Communication" dans Ma messagerie, uniquement dans sa boîte Communication.
- **iter 36 (26 août 2026)** — Messagerie / Service RH : les membres du Service RH reçoivent `service-rh` dans leur `service_channels_access` au démarrage, et sont ajoutés aux canaux `rh-{uid}` via migration idempotente. Frontend détecte `rh-{uid}` comme thread Service RH. Contacts : tri par prénom.
- **iter 35 (26 août 2026)** — Contacts / Pôles : `/api/poles` limité à 5 services officiels avec `canal_key` mappé sur les canaux corporate. Onglet "Tous les employés" masqué pour les groupes opérationnels ; téléphones pros affichés + pagination 18/page + tri alphabétique. Bug fix DM avec Idriss : exclusion en dur remplacée par `e.id !== me.id`.
- **iter 32 (22 août 2026)** — Bugfix `UserManager.jsx` wizard : la validation "Suivant" exigeait `f.email` (Email pro) alors que le champ n'est pas requis (label sans `*`). Désormais seul `personal_email` est requis, et `email` pro est uniquement format-checké si non-vide. Validé bout-en-bout : création → reset password → login via email pro OU perso (backend 100%, frontend 100%).

## Fonctionnalités livrées (état actuel — 22 août 2026, iter 34)
- Authentification simulée + Onboarding: WelcomePopup première connexion.
- Permissions granulaires (Super Admin / RH / Communication / Employé) appliquées back+front.
- Dashboard temps réel (horloge Paris, planning du jour, carousel).
- Points Repas + Menu restauration + Notes de frais.
- Planning + Badgeage.
- Congés/RTT/absences + Documents RH.
- Actualités + Newsletters Pro.
- Messagerie complète (édition 10 min, likes subtils, canaux corporate, présence temps réel, read receipts DM, absence auto-reply, multi-sélection archive/suppression).
- Contacts, Agenda, Formation, Galerie photos, Boîte à idées, CSE & Avantages.
- Gestion utilisateurs (wizard admin, réinitialisation de mot de passe).
- **NEW iter34**: Module Salles de réunion
  - 4 salles seedées (Horizon, Galaxie, Nova, Éclipse) avec photos, capacité, étage, équipements
  - Page /salles avec statuts temps réel ("Disponible maintenant / Occupée jusqu'à HHhMM / Indisponible pour maintenance")
  - Bannière "Vos prochaines réservations"
  - Modale planning journalier par salle (créneaux 30 min de 8h à 20h, code couleur libre/occupé/mine)
  - Formulaire de réservation (durée libre par pas de 15 min, participants internes, équipements, demande particulière, warning capacité)
  - Détection de conflit avec message d'erreur (409)
  - Notifications automatiques aux participants (création/modification/annulation)
  - Modale "Mes réservations" (À venir + Historique + modification + annulation avec motif)
  - Admin /management/salles : CRUD salles + vue toutes réservations à venir

## Backlog (P2 / V2)
- Signature électronique PDF
- Double authentification (2FA)
- Application PWA mobile
- Appels audio/vidéo dans la messagerie

## Contraintes clés
- Toutes les modales / popups doivent utiliser `<PortalModal>` (clipping CSS transforms sinon).
- Backend > 8000 lignes dans `server.py` — à découper en routers (messagerie, paie, RH, badgeage) en priorité de refacto.
- Frontend en français uniquement.
