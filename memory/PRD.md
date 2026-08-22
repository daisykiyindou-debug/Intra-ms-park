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

## Fonctionnalités livrées (état actuel — 22 août 2026, iter 33)
- Authentification simulée + Onboarding: WelcomePopup première connexion.
- Permissions granulaires (Super Admin / RH / Communication / Employé) appliquées back+front.
- Dashboard temps réel (horloge Paris, planning du jour, carousel).
- Points Repas + Menu restauration + Notes de frais.
- Planning + Badgeage (statuts congés/RTT/OFF, next shift calculé même en congés).
- Congés/RTT/absences + Documents RH (fiches de paie automatiques + DM auto depuis "Service RH" avec lien).
- Actualités + Newsletters Pro (éditeur riche, blocs 4 colonnes, planification `publish_at`, ciblage par statut, publication verrouillée).
- Messagerie:
  - temps réel isolée par utilisateur (pas de canaux globaux hérités pour les nouveaux comptes)
  - édition dans 10 min avec indicateur "Modifié"
  - like/unlike 👍
  - deep-link notifications avec auto-clear du badge
  - filtrage auto des notifs vers canaux supprimés/inaccessibles
  - onglet "Canaux" dans la modale Nouveau message (Service RH, Communication, Managers OPS, Département financier, Direction) — 1 canal unique par utilisateur, membres calculés dynamiquement, non-membres bloqués (403)
  - sidebar remplit toute la hauteur avec scroll interne indépendant (aside + section, `min-h-0` sur flex containers)
  - **NEW iter33**: statut de présence dynamique (heartbeat 60s, "En ligne" / "Dernière connexion il y a X min / aujourd'hui à HHhMM / le JJ/MM/YYYY à HHhMM")
  - **NEW iter33**: read receipts DM ("Vu à HHhMM" sous le dernier message envoyé lu, calculé depuis `channel_reads`)
  - **NEW iter33**: message d'absence automatique paramétrable depuis la messagerie (icône cloche barrée) — auto (congés validés + jour OFF) + toggle manuel avec dates + message personnalisé, debounce 1h par contact
- Contacts, Agenda, Formation, Galerie photos, Boîte à idées, CSE & Avantages (e-commerce partenaires).
- Gestion utilisateurs (wizard admin, réinitialisation de mot de passe).

## Backlog (P2 / V2)
- Signature électronique PDF
- Double authentification (2FA)
- Application PWA mobile
- Appels audio/vidéo dans la messagerie

## Contraintes clés
- Toutes les modales / popups doivent utiliser `<PortalModal>` (clipping CSS transforms sinon).
- Backend > 8000 lignes dans `server.py` — à découper en routers (messagerie, paie, RH, badgeage) en priorité de refacto.
- Frontend en français uniquement.
