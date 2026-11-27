# Baseline Club

**[Jouer à Baseline Club](https://tennis.arcadefleet.com/)**

Jeu de tennis rétro pour navigateur, avec entraînement contre le CPU et parties à deux sur invitation.

Le jeu ouvre directement le court contre le CPU. Pour jouer avec un ami, clique sur **Invite friend**. Laisse le champ vide pour créer un lien ou saisis son pseudo Espresso pour envoyer l’invitation dans l’app. La page hébergée par Espresso permet à ton ami d’installer l’app et de rejoindre ton invitation. **Accept and play** dans Espresso Cash connecte automatiquement l’invité au jeu.

[Espresso Rooms](https://docs.espressocash.com/#rooms) transmet les informations de connexion entre les deux navigateurs. Le match démarre après **Accept and play**, puis les échanges du jeu passent directement par WebRTC. Les invitations sont valables une heure. Espresso avertit l’invitant quand son ami accepte. La notification rouvre le match, même si l’onglet initial a été fermé.

Le bouton **Store** est accessible depuis le court. Carlos et Yannick sont gratuits. Casper et Naomi coûtent 0,10 USDC chacun. Espresso conserve les achats et vérifie les tenues payantes dans les parties en ligne. Les joueurs ont les mêmes caractéristiques de jeu. [Espresso Saves](https://docs.espressocash.com/#saves) synchronise le joueur choisi et les sons du court. Après un match en ligne, l’écran du score permet d’envoyer un pourboire de 0,10 USDC à l’adversaire, avec confirmation dans Espresso Cash. [Espresso Tips](https://docs.espressocash.com/#tips)

### Déploiement Espresso Cash

L’origine `https://tennis.arcadefleet.com` est vérifiée dans [Espresso Connect Developers](https://connect.espressocash.com/developers). GitHub Pages sert le fichier de preuve à `/.well-known/espresso.json`. Le SDK Espresso gère les invitations et les rooms depuis le navigateur.

### Journaux de jeu

Sur le site public, le bouton **Accept & play** active le partage des statistiques de jeu et ouvre le court. Le choix est conservé dans ce navigateur. Dans **Menu → Settings**, désactiver **Share anonymous gameplay** termine la partie en cours et rouvre l’écran d’entrée. Les journaux contiennent les résultats des points et de l’entraînement, le timing, la puissance, le bonus de vitesse et le type de commande. L’identifiant anonyme est propre au navigateur. Les pseudos, les wallets et les invitations restent hors de ces journaux. **Menu → Diagnostics** permet toujours d’exporter un journal local.

Pour analyser les échanges, lire le jeu `tennis.arcadefleet.com` avec la clé `GAME_LOGS_KEY` depuis un environnement privé. Filtrer par mode et type de commande avant de comparer les taux de retour, les durées de charge ou les motifs d’échec. [API Espresso Game Logs](https://mcp.espressocash.com/#game-logs)

Pour lancer le jeu en local, exécuter `python3 -m http.server 8000` depuis ce dossier et ouvrir `http://localhost:8000`.

Sur téléphone, jouer en paysage avec la manette à gauche. Maintenir Drive pour charger, puis relâcher près du contact pour accélérer la balle. Au clavier, utiliser les flèches ou WASD pour se déplacer, Z pour Drive et X pour Lob.
