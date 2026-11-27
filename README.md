# Baseline Club

**[Jouer à Baseline Club](https://romeo4934.github.io/jimmy/)**

Jeu de tennis rétro pour navigateur, avec entraînement contre le CPU et parties à deux sur invitation.

Pour jouer avec un ami, ouvre **Setup**. Clique sur **Connect Espresso Cash** si le bouton apparaît, puis sur **Create invite link**. Tu peux aussi choisir **Espresso username** pour envoyer l’invitation directement dans l’app de ton ami. La page hébergée par Espresso permet à ton ami d’installer l’app et de rejoindre ton invitation. Le jeu reconnaît une session enregistrée dans ce navigateur. Le bouton **Accept and play** dans Espresso Cash connecte automatiquement l’invité au jeu.

[Espresso Rooms](https://docs.espressocash.com/#rooms) transmet les informations de connexion entre les deux navigateurs. Le match démarre après **Accept and play**, puis les échanges du jeu passent directement par WebRTC. Les invitations sont valables une heure. Espresso avertit l’invitant quand son ami accepte. La notification rouvre le match, même si l’onglet initial a été fermé.

**Players & Store** propose Alex et Mika gratuitement, puis Jade et Sol à 0,10 USDC chacun. Espresso conserve les achats et vérifie les tenues payantes dans les parties en ligne. Les joueurs ont les mêmes caractéristiques de jeu. [Espresso Saves](https://docs.espressocash.com/#saves) synchronise le joueur choisi et les sons du court entre les appareils connectés. Pour activer le paiement, le propriétaire du site doit choisir **Pay me in this wallet** dans Espresso Connect Developers.

### Déploiement Espresso Cash

Enregistrer l’origine du jeu dans [Espresso Connect Developers](https://connect.espressocash.com/developers) et la faire vérifier. Pour GitHub Pages, l’origine est `https://romeo4934.github.io`. Le fichier de preuve doit être à la racine de cet hôte, dans `/.well-known/espresso.json`. GitHub Pages héberge tous les fichiers du jeu, et le SDK Espresso gère les invitations et les rooms depuis le navigateur.

Pour lancer le jeu en local, exécuter `python3 -m http.server 8000` depuis ce dossier et ouvrir `http://localhost:8000`.

Sur téléphone, jouer en paysage avec la manette à gauche. Maintenir Drive pour charger, puis relâcher pour frapper. Au clavier, utiliser les flèches ou WASD pour se déplacer, Z pour Drive et X pour Lob.
