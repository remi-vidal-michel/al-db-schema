// ...existing code...
# al-db-schema

Extension VS Code pour générer un schéma de base de données (Mermaid ERD) à partir d'un projet Business Central AL ouvert dans VS Code.

## Fonctionnalités principales

- Détection automatique d'un projet AL (présence de `app.json` et fichiers `.al`).
- Scan des objets `table` et `tableextension`.
- Extraction des champs : nom, type, caption, FieldClass (exclusion des FlowFields/FlowFilters), TableRelation.
- Identification des PK via les keys et des FK via `TableRelation`.
- Fusion des `tableextension` avec les tables de base.
- Génération d'un diagramme Mermaid (ERD) affiché dans un WebView, avec options de copie et d'export `.mmd`.

## Commandes et utilisation

- Commande principale : `al-db-schema.generateSchema`

Utilisation rapide :
1. Ouvrir le dossier de projet AL dans VS Code (doit contenir `app.json`).
2. Ouvrir la palette de commandes : `Ctrl+Shift+P`.
3. Lancer `AL DB Schema: Générer le schéma de base de données` (ou tapez `al-db-schema.generateSchema`).
4. Un WebView s'ouvre affichant le diagramme Mermaid généré.
5. Dans le WebView :
   - Copier le code Mermaid.
   - Télécharger le fichier `.mmd`.
   - Rerafraîchir ou régénérer après modification des fichiers `.al`.

### Raccourcis
- Palette de commandes : `Ctrl+Shift+P` → tapez `AL DB Schema`.

## Comportement attendu et détection

- Le scanner recherche `app.json` à la racine du workspace et tous les fichiers `.al` dans l'arborescence.
- Les `tableextension` présents dans le même workspace sont fusionnés dans la table cible.
- Les champs avec `FieldClass = FlowField` ou `FlowFilter` sont exclus.
- La première clé déclarée dans le bloc `keys` est considérée comme PK par défaut.
- Les relations sont extraites depuis les propriétés `TableRelation` des champs.

## Sorties

- Diagramme Mermaid rendu dans un WebView.
- Option pour copier le code Mermaid.
- Export en fichier `.mmd` (format texte Mermaid).

## Options / Configuration

Aucune configuration requise par défaut. (Possibilité d'ajouter des options dans `contributes.configuration` si nécessaire : ex. filtres, inclusion/exclusion de schémas, etc.)

## Dépannage

- Aucun rendu ? Vérifier la présence de `app.json` et d'au moins un fichier `.al`.
- Données manquantes ? Vérifier la syntaxe AL (noms de champs, clés, TableRelation).
- Si le WebView reste vide, ouvrir la console de l'extension (Affichage → Afficher → Sortie) pour les logs.

## Contribution

Contributions et rapports de bugs bienvenus via issues sur le dépôt.

## Licence

Ajouter ici la licence du projet (ex. MIT).

**Fin**