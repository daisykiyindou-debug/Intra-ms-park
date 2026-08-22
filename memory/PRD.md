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
