# Baseline Club

**[Jouer à Baseline Club](https://romeo4934.github.io/jimmy/)**

Jeu de tennis rétro pour navigateur, avec entraînement contre le CPU et parties à deux sur invitation.

Pour jouer avec un ami, ouvre **Setup**. Clique sur **Connect Espresso Cash** si le bouton apparaît, saisis le nom Espresso Cash de ton ami, puis clique sur **Invite friend**. Laisse le champ vide pour créer un lien à partager. La page hébergée par Espresso permet à ton ami d’installer l’app et de rejoindre ton invitation. Le jeu reconnaît une session enregistrée dans ce navigateur. Le destinataire ouvre son invitation dans Espresso Cash.

### Déploiement Espresso Cash

1. Enregistrer l’origine du jeu dans [Espresso Connect Developers](https://connect.espressocash.com/developers) et la faire vérifier. Pour GitHub Pages, l’origine est `https://romeo4934.github.io`. Le fichier de preuve doit être à la racine de cet hôte, dans `/.well-known/espresso.json`.
2. Déployer `server/lobby.mjs` sur un service Node.js derrière HTTPS. Démarrage avec `node server/lobby.mjs`. Configurer `GAME_URL=https://romeo4934.github.io/jimmy/` et le secret **serveur** `ESPRESSO_API_KEY`. Le serveur utilise une seule instance et garde les invitations en mémoire pendant 15 minutes.
3. Mettre l’URL HTTPS du serveur dans `online-config.js`. Les joueurs approuvent la connexion dans Espresso Cash. Le serveur vérifie l’identité de l’invité et son acceptation avant d’échanger automatiquement les informations de connexion. GitHub Pages héberge le jeu en mode statique.

Sans serveur configuré, le navigateur peut envoyer une invitation Espresso quand le site est actif. Ton ami te renvoie le code affiché dans le jeu. Colle-le dans **Friend’s reply code**, puis clique sur **Start match**.

Pour lancer le jeu en local, exécuter `python3 -m http.server 8000` depuis ce dossier et ouvrir `http://localhost:8000`.

Sur téléphone, jouer en paysage avec la manette à gauche. Maintenir Drive pour charger, puis relâcher pour frapper. Au clavier, utiliser les flèches ou WASD pour se déplacer, Z pour Drive et X pour Lob.
