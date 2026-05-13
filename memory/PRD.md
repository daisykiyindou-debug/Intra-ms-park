# MS Park Intranet — PRD

## Problem statement (verbatim, summarised)
Intranet ultra premium pour les employés de MS Park (parc de loisirs : karting, attractions, roller, restauration Soccer Bar / Donut House / stands). Identité visuelle bleu nuit `#071B34` + bleu lumineux `#3BA4FF`, glassmorphism léger, cartes arrondies, expérience type Slack + Notion + Workday + Apple. 11+ sections : Dashboard, Points Repas, Menu digital, Mon Coin RH (Planning, Badgeage, Demandes), Actualités, Messagerie, Documents, Notifications, Agenda, Avantages, Contacts, Profil.

## User choices (gathered)
- **Auth** : aucune. Utilisateur unique pré-câblé : *Idriss MALONGA*, Employé Polyvalent, contrat 24h/sem, planning mer-dim.
- **Données démo** : complètes (12 employés, 4 actualités, menu complet, planning ±8 semaines, badgeage historique avec anomalies, demandes RH, documents, notifications, partenaires, channels messagerie, événements agenda, news carrousel).
- **Messagerie** : simulée (HTTP polling, pas de WebSocket).
- **Météo** : widget mocké (Paris 9°).
- **Scope v1** approuvé : tout sauf appels audio/vidéo, signature électronique, 2FA, PWA.

## Architecture
- **Backend** : FastAPI + Motor (MongoDB). Seed idempotent dans `_seed_once()`. Toutes les routes `/api/*`.
- **Frontend** : React 19 + React Router v7 + Tailwind + Shadcn UI + Embla Carousel + Sonner toasts + Lucide icons.
- **Police** : Plus Jakarta Sans (Google Fonts).
- **State global** : `AppContext` (me, employees, notifications) chargé au mount.

## What's been implemented (2026-02-13)
- Layout fixe Sidebar bleu nuit + Header glass + Notifications drawer (slide-in right)
- Dashboard : welcome perso, statut live (En service / Pause / Hors site / Fin de service / OFF), météo, prise de poste, KPI bento, carrousel actualités premium auto-rotation, 8 accès rapides
- Points Repas : jauge SVG animée, quota selon rôle (employe 20/restauration 30/encadrement 35), historique du jour, statut badge (PAS de bouton clock-in)
- Restauration : 4 stores (Soccer Bar, Donut House, stand crêpes, stand bonbons), 24 produits, panier drawer, choix heure de retrait, commande + modal QR code, calcul auto points utilisés + reste à payer
- Planning : vue mois + semaine, jours cliquables → modal détail (horaire, pause 45min, manager, lieu)
- Badgeage : table historique, filtres jour/semaine/mois + tous/conformes/anomalies, badge "uniquement sur site"
- Demandes RH : formulaire 6 types (congé/absence/échange/acompte/matériel/maladie), filtres pending/approved/rejected
- Actualités : feed social posts + like + commentaires + composer
- Messagerie : 12 canaux (Accueil, Karting, Roller, Restauration, etc.), conversation style Slack, envoi messages
- Documents RH : grille, filtres catégorie, preview iframe PDF
- Agenda : calendrier mois + liste événements à venir
- Avantages : 6 partenaires (Cinéma Pathé, Fitness Park, Uber Eats, Spa, Decathlon, MS Group), QR codes copiables
- Contacts : annuaire 12 employés avec photo, recherche, filtres département
- Profil : carte héro Idriss + coordonnées + compétences + quotas

## Backlog (P0/P1/P2)
**P1**
- Notifications temps réel (WebSocket)
- Appels audio/vidéo messagerie
- Sondages dans Actualités
- Signature électronique PDF Documents
- 2FA + rôles (manager, RH, direction, admin)
- Mode sombre toggle
- PWA (manifest + service worker)

**P2**
- Workflow validation manager des demandes (vue côté manager)
- Heures supplémentaires détaillées
- API badgeage physique réelle (intégration borne / portique)
- Stripe paiement complémentaire CB sur surcharge

## Personas
- **Idriss MALONGA** (employé polyvalent) — utilisateur principal démo
- Sophie BERNARD (responsable opérations / manager)
- Pierre MOREAU (directeur RH)
- Thomas DUPONT (manager restauration)

## Test credentials
N/A — pas d'authentification dans v1.

## API endpoints
`/api/me`, `/api/employees`, `/api/dashboard`, `/api/schedule`, `/api/badging`, `/api/meal-points/today`, `/api/menu`, `/api/orders`, `/api/posts`, `/api/posts/:id/like`, `/api/posts/:id/comments`, `/api/requests`, `/api/documents`, `/api/notifications`, `/api/partners`, `/api/channels`, `/api/channels/:id/messages`, `/api/events`, `/api/news`.
