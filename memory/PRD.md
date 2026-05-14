# MS Park Intranet — PRD

## Problème / Vision
Intranet ultra-premium pour les employés MS Park (parc d'attractions). MVP simulé, sans authentification réelle, avec données de démonstration pour l'employé fictif **Idriss MALONGA**.

## Identité visuelle
- Glassmorphism, cartes arrondies, ton corporate haut de gamme
- Couleurs : bleu nuit `#071B34`, bleu accent `#3BA4FF`, fond `#F4F7FA`
- Réf. design : `/app/design_guidelines.json`

## Fonctionnalités MVP livrées
- **Dashboard** temps réel (horloge Paris, prochain shift "Prise de poste du jour")
- **Points Repas** (20 pts/jour crédités auto sur jours travaillés)
- **Restaurant** : Menu digital 4 stands (Soccer Bar, Donut House, Stand Crêpes, Stand Bonbons), panier en **modal centré**, paiement points + CB, QR code de retrait, pipeline statut (préparation → prête → récupérée)
- **Planning** (vue semaine, pauses exactes, jours OFF)
- **Badgeage** simulé
- **Demandes RH** (CP N-1 / CP N / RTT + upload fichier)
- **Actualités** internes
- **Messagerie** simulée (1-1 + groupes côté backend)
- **Documents RH**
- **Agenda**, **Avantages**, **Profil**, **Contacts** (pôles)
- **Login/Logout** simulé avec redirection

## Règles métier
- **Commandes restaurant uniquement le jour J** (backend rejette toute autre date)
- Heure de retrait minimum = maintenant + 1 h
- Un seul stand par panier (single-store cart)
- Points expirent à 23h59, non cumulables
- Lieu de retrait auto-assigné = stand du produit

## Architecture
- Backend FastAPI `/app/backend/server.py` (routes préfixées `/api`, données seed in-memory + MongoDB)
- Frontend React + Shadcn UI + Tailwind, pages dans `/app/frontend/src/pages/`

## Changelog récent
- **2026-02 (session courante)** :
  - Panier Restaurant converti en modal centré (suppression du drawer latéral droit)
  - Date de retrait verrouillée sur "Aujourd'hui" (UI + validation backend)
  - Email professionnel supprimé du profil (seul email personnel reste)
  - Page Login utilise désormais l'email personnel par défaut
- Modifications massives (message 129) appliquées : QR code modal, statut évolutif commande, photo profil mise à jour, label "Prise de poste du jour", lieu de retrait auto, validation +1h.

## Backlog (P2 — V2)
- Messagerie temps réel avec appels audio/vidéo
- UI création de groupes dans Messagerie (backend prêt)
- Signature électronique PDF
- 2FA
- PWA mobile

## Credentials de test
Voir `/app/memory/test_credentials.md` (login simulé — n'importe quelle entrée passe).
