# Génération des PDF — Web, Mobile et Bureau (.exe)

Toute la génération de PDF passe par **jsPDF côté client** (aucun serveur requis) et par un
point d'entrée unique : `savePdfDoc()` dans `src/lib/pdf-kit.ts`. Ce point d'entrée détecte
automatiquement l'environnement d'exécution et n'échoue jamais silencieusement (il enchaîne
sur une solution de repli si nécessaire).

| Environnement | Méthode d'enregistrement | Repli |
| --- | --- | --- |
| Navigateur web | Téléchargement via URL blob | Ouverture dans un nouvel onglet, puis `doc.save()` |
| Mobile (Capacitor Android/iOS) | Écriture dans « Documents » + ouverture avec le lecteur PDF du système | Téléchargement blob, nouvel onglet |
| Bureau Windows (.exe Electron) | Boîte de dialogue native « Enregistrer sous » puis ouverture du fichier | Téléchargement blob, nouvel onglet |

## Version mobile (Capacitor)

1. `npm install`
2. `npx cap add android` (et/ou `npx cap add ios`)
3. `npm run build && npx cap sync`
4. `npx cap run android`

## Version bureau Windows (.exe)

Le processus principal Electron (`electron/main.cjs`) sert le dossier `dist/` via un petit
serveur HTTP local. Les chemins absolus des assets, le routage SPA et les appels Supabase
fonctionnent donc exactement comme sur le web (pas de page blanche liée à `file://`).

1. `npm install --save-dev electron @electron/packager`
2. Test local : `npm run desktop`
3. Génération de l'exécutable Windows : `npm run desktop:package`
   → le dossier `electron-release/DPCI Delivery-win32-x64/` contient `DPCI Delivery.exe`.

`electron/preload.cjs` expose uniquement `dpciDesktop.savePdf()` (isolation de contexte
activée, pas d'accès Node depuis l'interface).

## Documents concernés

- Bons de livraison — `src/lib/generate-receipt-pdf.ts`
- Rapports d'inventaire — `src/lib/generate-inventory-pdf.ts`
- Listes, bacs et accès utilisateurs — `src/lib/pdf-kit.ts` (`finalizePdf`)

Tous appellent `savePdfDoc()`, donc toute évolution du mécanisme d'enregistrement se fait
en un seul endroit.
