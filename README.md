# Bibliothèque 1.3.2

Application personnelle de bibliothèque, en français et en anglais. Livres, collections, couvertures, notes illustrées, prêts, filtres, modifications groupées et exports PDF. Aucun livre ni image personnelle n’est fourni.

[English documentation](README.en.md)

## Utilisation

La racine de l’archive contient les fichiers prêts à utiliser. Une reconstruction les place aussi dans `dist/` :

- `index.html` : page bilingue de présentation.
- `bibliotheque.html` : application autonome avec bouton de langue français / anglais.
- `source.zip` : sources correspondantes.

Chaque page HTML est autonome : les scripts, polices et bibliothèques PDF sont intégrés. Le bouton de langue passe du français à l’anglais dans ce même fichier. Aucun CDN, compte ni serveur applicatif n’est nécessaire. Le nom du paquet est `eigrutel-bibliotheque`, le fichier d’application `bibliotheque.html` et le nom d’écran iOS `bibliotheque`.

Pour un site, déposer les fichiers de `dist/` dans le même dossier sur un hébergement HTTPS. Pour remplacer une ancienne installation appelée `bibliotheque.html`, conserver ce point d’entrée ou rediriger vers `index.html` sur le même domaine. Les données du navigateur sont liées à l’origine du site (protocole, domaine et port), pas à la langue.

L’ouverture directe d’un HTML est possible selon le navigateur ; le stockage des pages `file://` varie. Sur iPad, utiliser Safari depuis un hébergement HTTPS. Faire une sauvegarde JSON avant de déplacer l’application, changer de navigateur ou changer de domaine.

## Démarrage et sauvegardes

Une nouvelle installation démarre sans livre ni collection. Le panneau gauche accepte un nom de bibliothèque, repris dans les noms des sauvegardes JSON et PDF, ainsi que dans leurs métadonnées. Ajouter un livre permet de saisir librement le nom de sa collection. Un import JSON ou JSON backup permet de reprendre une bibliothèque. Les fichiers JSON sans champ Collection importent les livres sans collection ; la sélection multiple permet ensuite de les classer ensemble.

Les bibliothèques déjà enregistrées par les versions 0.x sont conservées. La version 1.0 ne réinjecte aucune collection. Le format JSON reste `eigrutel-bibliotheque`, `schemaVersion: 1`, commun aux deux langues.

Le changement de langue conserve la bibliothèque sur l’appareil. Les données restent dans IndexedDB. Il n’y a pas de synchronisation entre appareils, ni de stockage distant des livres. Les sauvegardes JSON incluent notes, images présentes dans la bibliothèque et réglages. Elles ne sont pas chiffrées.

Les trois choix d’import sont : ajouter les nouvelles fiches sans écraser les anciennes (défaut), mettre à jour les fiches correspondantes, ou restaurer la bibliothèque/la collection du fichier. Les correspondances JSON utilisent les identifiants, pas seulement le titre. Deux copies distinctes peuvent partager le même titre. Une copie avant import permet d’annuler le dernier import sur le même appareil.

## Couvertures « Que sais-je ? »

`LibCore.isQueSaisJe(nom)` active uniquement un habillage visuel avec trois bandes verticales égales : couleur, blanc, couleur. Il ignore la casse, les accents, les espaces, les traits d’union usuels et le point d’interrogation.

Exemples reconnus : `que sais-je`, `Que sais-je?`, `QUE SAIS-JE ?`, `Que sais je`.

Le nom enregistré n’est pas modifié. Une image de couverture fournie reste prioritaire. Aucun contenu ni livre n’est créé par cette règle. Les autres collections gardent leur couverture unie.

## Développement

Node.js 20 ou plus récent, npm. Depuis ce dossier :

```sh
npm ci
npm run build
npm test
```

`npm run build` génère une page autonome bilingue et `dist/source.zip`. `npm run format` formate les sources. Le paquet npm n’est pas destiné au registre npm.

| Fichier | Rôle |
| --- | --- |
| `core.js` | Modèle, validation, import JSON, fusion, filtres, notes et règle de couverture |
| `app.js` | Interface, état local, transactions, sélection, formulaires et événements |
| `template.html` | Structure HTML et styles adaptatifs |
| `pdf-export.js` | Génération locale des PDF, format A4 avec contenu compact à 80 % |
| `locales/en.json` | Catalogue des libellés anglais |
| `i18n.js` | Dictionnaire FR/EN appliqué directement à l’interface |
| `build.cjs` | Assemblage autonome français/anglais et archive de sources |
| `test*.cjs` | Tests reproductibles avec données fictives uniquement |
| `vendor/` | Dépendances PDF, polices et leurs notices |

Les champs `condition` et `status` conservent leurs valeurs historiques françaises dans les sauvegardes. Seuls leurs libellés d’affichage sont traduits. Les textes libres et les noms de repères personnalisés restent ceux de l’utilisateur. Les appels explicites `I18n.t()` et `I18n.html()` traduisent uniquement les libellés d’interface et les messages. `i18n.js` lit le dictionnaire FR/EN de `locales/en.json`. Le bouton met à jour la page active sans rechargement ni décompression. Les filtres, la sélection, les brouillons et l’historique restent en mémoire.

Les commandes Annuler et Rétablir restaurent les 30 dernières modifications pendant la session, y compris les retraits groupés vers la corbeille. Les raccourcis clavier Ctrl/Cmd+Z et Ctrl/Cmd+Y fonctionnent aussi hors des champs de saisie. Les transactions vérifient un numéro de révision pour éviter un écrasement silencieux entre deux onglets. Le brouillon d’une fiche ne remplace l’original qu’à l’enregistrement. Le cœur valide la liste des champs autorisés aux actions groupées. Les notes sont échappées avant rendu ; seul le balisage prévu est interprété.

## Vérification de cette version

La suite locale couvre les sauvegardes JSON fictives, les images, les exemplaires distincts, les modes de fusion, la restauration d’une collection, les notes, les champs, les prêts et les actions groupées ; elle vérifie aussi le démarrage vide, les variantes du nom Que sais-je, la compatibilité JSON FR/EN et la syntaxe des scripts générés.

Les tests de langue vérifient la bascule répétée, les libellés statiques, la préférence mémorisée, le stockage bloqué et la conservation des brouillons, de la sélection et de l’historique. Le contrôle visuel navigateur de ce correctif n’a pas pu être effectué dans l’environnement de livraison. Les gestes tactiles et téléchargements restent à valider sur un iPad physique.

## Dépôt et licences

Cette archive constitue un instantané propre, sans historique Git, configuration d’hébergement privée, export personnel ou identifiant de site. Elle peut former la racine d’un nouveau dépôt. Les anciennes versions privées ne sont pas incluses.

Code : GNU AGPL-3.0-or-later (`LICENSE`). Documentation et modèles : CC BY-SA 4.0 (`LICENSE-DOCS.txt`). Noms et logos Eigrutel réservés. Les livres et contenus importés conservent leurs droits propres.

Dépendances et polices : voir `THIRD-PARTY.md` et les notices dans `vendor/`. Conserver ces notices et fournir les sources correspondantes lors de la redistribution.

## Correctif 1.0.1

Dans une fiche enregistrée, « Livre rendu » enregistre immédiatement le retrait du nom et de la date de prêt. Dans le formulaire de modification, « Effacer la date » et « Livre rendu : retirer le prêt » modifient le brouillon ; « Enregistrer la fiche » valide ces changements.

Le nom de bibliothèque est enregistré avant chaque export JSON, collection ou PDF, y compris après un clic immédiat ou un raccourci clavier. Les sauvegardes importées dans une bibliothèque sans nom lui transmettent leur nom.

`test-workflows.cjs` exécute le HTML livré avec jsdom et fake-indexeddb : effacement et retour de prêt, enregistrement, réouverture, rechargement, noms des exports, import et corbeille. Le rendu PDF est remplacé uniquement dans le test de nommage. Cette simulation ne remplace pas un contrôle sur iPad réel. Le numéro 1.3.2 est indiqué dans le mode d’emploi.

## Images et sauvegardes, version 1.3.2

L’ajout d’une couverture ou d’une image de notes optimise automatiquement la copie stockée. Les couvertures sont limitées à 600 px de haut (et 960 px de large pour les panoramas), les notes à 1 600 px sur le grand côté. Les images plus petites ne sont jamais agrandies. PNG, WebP et JPEG sont comparés selon le format d’origine ; la transparence est conservée. Une copie plus lourde est refusée. Les GIF et les animations PNG/WebP sont conservés. Une image déjà optimisée à cette taille n’est pas recompressée.

Le poids avant/après est affiché dans l’éditeur. La sauvegarde JSON contient les copies optimisées, pas les originaux. Conserver les fichiers originaux à part si nécessaire.

Pour les images déjà présentes ou importées par JSON : panneau gauche → **Alléger les images** → **Calculer le gain**. L’aperçu affiche les poids, le gain estimé du JSON et les éventuelles images illisibles, conservées intactes. Annuler ne modifie rien. **Remplacer les images** applique le résultat à toute la bibliothèque, corbeille comprise. La confirmation précise que l’historique Annuler/Rétablir et la copie précédant le dernier import sont effacés, afin de ne pas conserver les images lourdes en double. Les sauvegardes déjà téléchargées ne sont jamais modifiées.

Le format JSON reste compatible avec les versions précédentes et sa limite d’import reste de 150 Mo. L’optimisation ne garantit pas qu’une bibliothèque passe sous cette limite. Les traitements sont séquentiels. Les tests d’encodage utilisent des images synthétiques ; les tests d’interface exécutent le HTML avec DOM et IndexedDB simulés. Un essai matériel sur iPad reste à faire.

## Dupliquer une fiche

Le bouton **Dupliquer**, à côté de **Modifier**, ouvre une copie dans l’éditeur. Tous les champs, les notes et les images sont repris ; le titre reçoit « (copie) ». Les identifiants de la fiche et de ses images sont renouvelés, et les liens dans les notes suivent les nouvelles images. La fiche d’origine reste intacte. **Enregistrer la fiche** ajoute le nouveau livre ; **Annuler** ne crée rien. La duplication est disponible pour les livres hors corbeille.

En mode sélection, **Dupliquer** se trouve entre **Retirer** et **Modifier la sélection**. Il ajoute une copie de chaque fiche sélectionnée. Les copies deviennent la nouvelle sélection pour permettre une modification groupée immédiate. La duplication groupée correspond à une seule action dans Annuler/Rétablir, dans les limites habituelles de l’historique.

## Nouveautés 1.3.2

Sur téléphone, le titre de collection reste sur une seule ligne au-dessus des commandes. Les noms longs sont abrégés visuellement sans modifier leur contenu.
La collection **Penguin** (sans tenir compte de la casse et des espaces) reçoit une couverture couleur / blanc / couleur en trois bandes horizontales égales. Une image de couverture reste prioritaire.

Le champ historique `number` est conservé dans le JSON et s’intitule **N° et sous-titre**. Il accepte par exemple `2 · La pyramide des tempêtes`. Les anciens fichiers restent compatibles. À titre identique (casse et accents ignorés), le tri alphabétique classe les tomes selon leur numéro initial, puis leur sous-titre. Les titres différents gardent leur ordre alphabétique. Le tri **Année** utilise la première année à quatre chiffres du champ Année / édition ; les valeurs non reconnues sont placées à la fin. Les cartes présentent le titre, le numéro/sous-titre puis l’auteur, sans masquer ce dernier.

Le nom est sauvegardé automatiquement après la saisie et immédiatement avant les exports. Un petit journal local protège une saisie interrompue avant l’enregistrement. Les modifications des livres, des couleurs, la sauvegarde et Annuler/Rétablir conservent le nom actuel. Une restauration de bibliothèque peut le remplacer par celui du fichier restauré. Ces protections ne synchronisent pas des domaines ou appareils différents.

**Sélectionner > Exporter PDF** permet de choisir fiches complètes ou notes uniquement, puis un document unique ou un document par livre. L’ordre suit le tri affiché, sur toutes les pages sélectionnées. Chaque livre commence sur une nouvelle page ; un PDF unique utilise une pagination continue. Les PDF séparés disposent de liens individuels, compatibles avec le téléchargement manuel sur iPad. Leurs noms incluent le nom de la bibliothèque, le titre et le numéro/sous-titre, avec un préfixe unique pour éviter les collisions.

## Repères couleur et tri par année

Les sauvegardes JSON complètes et par collection incluent tous les repères couleur (identifiant, nom et code couleur). À l’import, les définitions du fichier remplacent celles des mêmes repères sur l’appareil. Lors d’un ajout, d’une mise à jour ou d’une restauration de collection, les repères absents du fichier restent disponibles. Les repères sont communs à toute la bibliothèque : leur restauration s’applique aussi aux autres fiches qui les utilisent. Un ancien fichier sans palette conserve les repères actuels.

« Année ↑ » trie de la plus ancienne à la plus récente ; « Année ↓ » effectue le tri inverse. Les années non renseignées restent à la fin.

Chaque repère possède une croix de retrait dans « Mes repères couleur ». S’il est utilisé, un message indique le nombre de livres concernés, corbeille comprise. « Enregistrer » retire le repère et son affectation aux fiches, sans supprimer de livre, de note ou d’image. « Annuler » ferme le panneau sans appliquer les changements. Après enregistrement, Annuler/Rétablir agit sur l’ensemble de cette modification. Les JSON mémorisent les retraits avec le champ facultatif removedPaletteIds, pour qu’ils ne réapparaissent pas sur un autre appareil utilisant la version 1.3.2 ou ultérieure. Un ancien fichier définissant explicitement ce repère peut le rétablir.
