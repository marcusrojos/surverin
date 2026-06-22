## Objectif

Introduire une notion de **Site** et un nouveau rôle **Super administrateur**. Chaque administrateur est rattaché à un site unique et ne voit/agit que sur les données de son site. Le super admin a une vue globale sur tous les sites.

## 1. Base de données (migration)

- Ajouter `super_admin` à l'enum `app_role`.
- Créer la table `sites` : `name`, `address`, `phone`, `is_active` (+ champs standard). GRANT + RLS.
- Ajouter une colonne `site_id` (uuid, référence `sites`) sur :
  - `profiles` (site de rattachement de l'admin / livreur)
  - `pharmacies`
  - `axes`
  - `parcours`
  - `deliveries`
- Fonctions security-definer :
  - `get_user_site(_user_id uuid)` → renvoie le `site_id` du profil.
  - `is_super_admin(_user_id uuid)` → booléen.
- Mettre à jour les **RLS** des tables ci-dessus et des tables liées (`axis_pharmacies`, `parcours_pharmacies`, `parcours_colis`, `parcours_inventaire*`, `pharmacy_bacs_balance`) :
  - super_admin : accès total.
  - admin : accès uniquement aux lignes où `site_id = get_user_site(auth.uid())` (ou via la pharmacie/parcours rattaché pour les tables filles).
  - livreur / pharmacie : règles actuelles conservées.

```text
sites 1───* profiles (admins, livreurs)
sites 1───* pharmacies / axes / parcours / deliveries
```

## 2. Edge functions

- `create-user` : autoriser `super_admin` ET `admin` comme appelants.
  - super_admin peut créer un `admin` et lui assigner un `site_id`.
  - admin peut créer `livreur` / `pharmacie` ; le `site_id` est forcé au site de l'admin (jamais choisi librement).
  - Enregistrer `site_id` dans le profil créé.
- Création initiale d'un super admin via `setup-admin` (le 1er compte devient super_admin).

## 3. Frontend

### Auth
- `src/lib/auth.tsx` : ajouter `super_admin` au type `AppRole`, au cache et à la résolution ; exposer le `site_id` courant.

### Navigation (`Sidebar`, `MobileNav`)
- Rôle `super_admin` : mêmes onglets qu'admin + onglet **Sites** + onglet **Bacs** + vue d'ensemble multi-sites.
- Rôle `admin` : onglets actuels + onglet **Bacs**.

### Routage (`App.tsx`, `DashboardLayout`)
- `DashboardLayout requiredRole` doit accepter super_admin là où admin est requis.
- Nouvelles routes : `/admin/sites` (super_admin uniquement), `/admin/bacs` (admin + super_admin).

### Nouvelles pages
- `pages/admin/Sites.tsx` : CRUD des sites + indicateurs par site (nb pharmacies, parcours, livraisons, admins). Super admin uniquement.
- `pages/admin/Bacs.tsx` : suivi des soldes de bacs (`pharmacy_bacs_balance`) par pharmacie, filtré par site pour l'admin, global (avec filtre site) pour le super admin.

### Pages existantes
- Toutes les requêtes admin (`Pharmacies`, `Parcours`, `Axes`, `Deliveries`, `Users`, `Dashboard`, `DriverTracking`, `Lists`, `CreateParcoursWizard`) reposent sur le filtrage RLS, donc aucun filtre client supplémentaire n'est strictement requis ; mais lors des **créations**, renseigner `site_id` = site de l'admin courant.
- `Users.tsx` : le super admin peut créer des admins + choisir le site ; l'admin ne crée que livreurs (site auto). Affichage du site dans la liste.
- `Dashboard` super admin : cartes récapitulatives par site.

## 4. Détails techniques

- Le cloisonnement de sécurité repose sur les **RLS** (jamais sur le seul filtrage client).
- `site_id` nullable au départ pour ne pas casser les données existantes ; un script d'assignation pourra rattacher l'existant à un site « par défaut » créé à la migration.
- Les tables filles sans `site_id` direct sont filtrées via jointure sur leur parent dans les policies.

## Points à confirmer

1. Faut-il créer automatiquement un **site « Principal »** et y rattacher toutes les données existantes (pharmacies, parcours, etc.) ? (recommandé)
2. Le **premier** super admin : je le promeus via la page Utilisateurs / setup, ou veux-tu que je désigne un compte existant précis ?
