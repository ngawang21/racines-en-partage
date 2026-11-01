# Guide de votre boutique Racines en Partage

Bonjour Marie,

Ce guide vous accompagne pour tout ce que vous ferez seule sur votre
boutique : changer un prix, une photo ou un texte, indiquer une rupture,
ajouter un produit, mettre la boutique en pause, suivre les commandes dans
Stripe et préparer les colis Mondial Relay.

Chaque partie traite une seule tâche, avec des étapes numérotées. Gardez ce
guide à portée de main les premières semaines ; ensuite, le tableau « Que
faire si » à la fin suffit souvent.

**Sommaire**

1. Se connecter à l'administration
2. L'écran d'accueil de l'administration
3. Modifier un produit : texte, prix, poids, origine
4. Changer ou ajouter une photo
5. Indiquer une rupture et remettre en stock
6. Ajouter un nouveau produit
7. Supprimer un produit
8. Les catégories
9. Les textes des pages : accueil, histoire, FAQ, contact
10. Les textes légaux
11. Les réglages : livraison, pause, bandeau, TVA, coordonnées
12. Après « Enregistrer » : la mise en ligne
13. Les commandes dans Stripe : voir, rembourser, codes promo, reçus
14. Préparer un colis à partir de l'e-mail de commande
15. Répondre à une cliente ou un client
16. Que faire si...
17. Qui contacter

---

## 1. Se connecter à l'administration

L'administration est la partie privée du site, où vous modifiez vos
produits et vos textes. Elle se trouve à l'adresse
**racinesenpartage.fr/admin/**. Personne d'autre ne peut y entrer : il faut
votre compte GitHub (GitHub est le service qui garde en sécurité tous les
fichiers de votre site).

1. Ouvrez votre navigateur (Chrome, Edge, Firefox ou Safari) sur un
   ordinateur. Le téléphone fonctionne aussi, mais l'écran est petit.
2. Tapez **racinesenpartage.fr/admin/** dans la barre d'adresse.
3. Cliquez sur le bouton **Se connecter avec GitHub**.
4. Une petite fenêtre GitHub s'ouvre. Entrez votre identifiant
   (`racinesenpartage`) et votre mot de passe GitHub, puis le code à six
   chiffres de votre application d'authentification si GitHub le demande.
5. La toute première fois, GitHub demande l'autorisation : cliquez sur le
   bouton vert **Authorize** (autoriser).
6. La fenêtre se ferme et l'administration s'affiche.

L'administration s'affiche en français si votre navigateur est en
français. Vous restez connectée plusieurs jours sur le même ordinateur.

Pour vous déconnecter (sur un ordinateur partagé, par exemple) : cliquez
sur le rond avec votre photo ou votre initiale, en haut à droite, puis sur
**Se déconnecter**.

**Si la page tourne en boucle ou revient sans cesse à l'écran de
connexion**

1. Vérifiez que votre navigateur n'a pas bloqué la petite fenêtre GitHub :
   une icône apparaît alors au bout de la barre d'adresse. Cliquez dessus et
   choisissez « Toujours autoriser les fenêtres pour ce site ».
2. Fermez tous les onglets de l'administration, rouvrez
   racinesenpartage.fr/admin/ et recommencez.
3. Essayez un autre navigateur, ou une fenêtre de navigation privée.
4. Si un message parle de « domaine non autorisé » ou d'« authentificateur »,
   ce n'est pas de votre fait : prévenez votre développeur, c'est un réglage
   technique à corriger de son côté.

Le bouton **Se connecter avec un jeton d'accès** sert uniquement en
dépannage, si votre développeur vous le demande. Ne communiquez jamais un
jeton ni votre mot de passe par e-mail.

---

## 2. L'écran d'accueil de l'administration

À gauche, la liste de ce que vous pouvez modifier :

| Rubrique                    | Ce que vous y trouvez                                            |
| --------------------------- | ---------------------------------------------------------------- |
| **Produits**                | Une fiche par sachet (10 au départ)                              |
| **Catégories**              | Poudres, tisanes, graines, cacao                                 |
| **Pages**                   | Accueil, Notre histoire, Questions fréquentes, Contact           |
| **Textes légaux**           | Mentions légales, CGV, politique de confidentialité              |
| **Réglages de la boutique** | Livraison, pause, bandeau d'annonce, TVA, coordonnées, lancement |

Dans **Produits**, la liste affiche chaque produit avec sa photo, son nom et
son poids. En haut de la liste :

- **Trier** : par nom, par prix, par disponibilité ou par poids.
- **Filtrer** : afficher seulement les produits « En stock », « Plus que
  quelques sachets », « Rupture », « Mis en avant », ceux dont les valeurs
  nutritionnelles sont masquées, ou une seule catégorie.
- **Grouper** : ranger la liste par catégorie ou par disponibilité.

La loupe en haut de l'écran cherche un mot dans tous vos contenus.

Sous chaque champ, une phrase grise explique ce qu'il faut y mettre. Un
champ obligatoire laissé vide devient rouge au moment d'enregistrer, avec
le message « Ce champ est obligatoire ».

---

## 3. Modifier un produit : texte, prix, poids, origine

1. Cliquez sur **Produits**, puis sur le produit.
2. La fiche s'ouvre en **français** (onglet ou menu de langue en haut de la
   fiche). C'est toujours en français que l'on modifie le prix, le poids, la
   disponibilité, les photos et l'origine : l'anglais les reprend tout seul.
3. Modifiez ce que vous voulez :
   - **Prix TTC** : en euros avec un **point**, par exemple `8.90`. Deux
     chiffres après le point au plus.
   - **Poids net** : en grammes, par exemple `100`.
   - **Origine** : telle qu'elle est écrite sur l'étiquette, par exemple
     « Niger ». Le champ **Pays d'origine (pour Google)** juste en dessous
     sert aux moteurs de recherche ; laissez-le vide si l'origine n'est pas
     un seul pays (« Afrique de l'Ouest »).
   - **Description**, **Ingrédients**, **Conseils d'utilisation**,
     **Conservation** : vos textes. Dans la description, vous pouvez mettre
     un mot en **gras** ou en _italique_ avec les boutons au-dessus du texte.
4. Cliquez sur **Enregistrer**, en haut à droite.
5. Le site est à jour environ deux minutes plus tard (voir la partie 12).

**La version anglaise du texte**

1. Dans la fiche, passez en **anglais** (menu de langue en haut de la
   fiche). Les champs communs (prix, photos...) y sont grisés : ils viennent
   du français.
2. Modifiez les textes anglais, puis **Enregistrer**.

Un texte anglais laissé vide n'est pas grave : le site affiche alors le
texte français à la place. Le bouton **Copier depuis Français** (menu de la
langue anglaise) recopie les textes français pour vous éviter de tout
retaper ; il ne reste qu'à les traduire.

**Règle importante sur les textes des produits** : la loi encadre
strictement ce que l'on peut dire des bienfaits d'un aliment. Dans « Les
bienfaits », gardez uniquement les phrases imprimées sur l'étiquette, sans
en ajouter. En cas de doute, demandez avant de publier.

---

## 4. Changer ou ajouter une photo

**Avant de commencer**

- Format : JPEG, PNG ou WebP. Sur iPhone, réglez l'appareil photo sur « Le
  plus compatible » (Réglages, Appareil photo, Formats), sinon les photos
  sont au format HEIC, que les ordinateurs lisent mal.
- Taille : **2 Mo au plus** par photo. Une photo de téléphone récent dépasse
  souvent 2 Mo : envoyez-la-vous par e-mail en taille « moyenne », ou
  réduisez-la avec l'outil Photos de l'ordinateur.
- Cadrage : le sachet bien net, centré, sur un fond simple, à la lumière du
  jour. Une photo carrée ou presque carrée rend le mieux.

L'administration convertit chaque photo en WebP (un format léger pour le
web) et la réduit à 2048 pixels au plus. Le site fabrique ensuite toutes
les tailles utiles. Vous n'avez rien à faire de plus.

**Remplacer ou ajouter une photo**

1. Ouvrez le produit, en français.
2. Dans **Photos**, cliquez sur **Ajouter** (ou sur une photo existante pour
   la **Remplacer**).
3. Choisissez **Téléverser** puis la photo sur votre ordinateur, ou
   glissez-la dans la fenêtre. Une photo déjà envoyée se retrouve dans la
   liste et se choisit d'un clic.
4. La **première** photo de la liste est la photo principale, celle de la
   boutique. Faites glisser les photos pour changer l'ordre.
5. Pour retirer une photo de la fiche, cliquez sur la croix ou sur
   **Supprimer** à côté d'elle. Il faut toujours au moins une photo.
6. **Enregistrer**.

Les photos des catégories et de la page « Notre histoire » se changent de
la même manière dans leur rubrique.

---

## 5. Indiquer une rupture et remettre en stock

Le site ne compte pas les sachets : c'est vous qui indiquez la
disponibilité.

1. Ouvrez le produit, en français.
2. Dans **Disponibilité**, choisissez :
   - **En stock** : achat normal ;
   - **Plus que quelques sachets** : un badge prévient les clients, l'achat
     reste possible ;
   - **Rupture** : la fiche reste visible avec la mention « Rupture », mais
     le bouton d'achat est désactivé.
3. **Enregistrer**.

Pour remettre en stock, même chemin : choisissez **En stock** et
enregistrez.

Astuce : le filtre **Rupture** de la liste des produits montre d'un coup
d'œil tout ce qui est épuisé.

---

## 6. Ajouter un nouveau produit

Le plus simple est souvent de **dupliquer** un produit proche (même
catégorie, autre poids), puis de changer ce qui diffère.

1. Dans **Produits**, cliquez sur **Nouveau**. Pour dupliquer, ouvrez plutôt
   le produit modèle et choisissez **Dupliquer** dans le menu de la fiche.
2. Remplissez la fiche **en français**, de haut en bas :

| Champ                                | Quoi mettre                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Nom du produit                       | Comme sur le sachet, sans le poids : « Poudre de baobab »                           |
| Phrase d'accroche                    | Une phrase sous le nom                                                              |
| Catégorie                            | À choisir dans la liste                                                             |
| Référence (SKU)                      | Un code unique en majuscules, par exemple `REP-BAO-250`. Ne le changez plus ensuite |
| Prix TTC                             | Avec un point : `12.50`                                                             |
| Poids net                            | En grammes : `250`                                                                  |
| Disponibilité                        | En général « En stock »                                                             |
| Photos                               | Au moins une                                                                        |
| Description                          | Deux à quatre phrases                                                               |
| Ingrédients                          | Mot pour mot, comme sur l'étiquette                                                 |
| Conseils d'utilisation               | Un conseil par ligne (bouton **Ajouter**)                                           |
| Les bienfaits                        | Seulement les phrases de l'étiquette, ou rien                                       |
| Comment est-il obtenu ?              | Facultatif                                                                          |
| Petite recette                       | Facultative : titre, ingrédients, étapes                                            |
| Conservation                         | Comme sur l'étiquette                                                               |
| Origine, Pays d'origine              | Comme sur l'étiquette ; le pays seulement si c'est un seul pays                     |
| Mentions « sans »                    | Seulement ce que l'étiquette affirme et qui est vrai                                |
| Afficher les valeurs nutritionnelles | À cocher quand le tableau ci-dessous est recopié et vérifié                         |
| Valeurs nutritionnelles pour 100 g   | Recopiez le tableau de l'étiquette, unités comprises (« 3,0 g »)                    |
| Mettre en avant sur l'accueil        | Trois ou quatre produits cochés au total                                            |
| Produits associés                    | Deux ou trois produits proposés en bas de la fiche                                  |
| Titre et description pour Google     | Facultatifs ; sinon le nom et l'accroche sont utilisés                              |

3. **L'adresse de la page.** À droite (ou dans le panneau « Slug »),
   l'administration propose l'adresse de la future page à partir du nom et
   du poids, par exemple `poudre-de-baobab-250g`, qui donnera
   racinesenpartage.fr/produits/poudre-de-baobab-250g/. Gardez la
   proposition. Cette adresse **ne pourra plus être changée** après le
   premier enregistrement, pour que les liens partagés ne cassent jamais.
4. **La traduction anglaise.** Passez en anglais : les champs communs
   (prix, poids, photos, catégorie, stock...) sont déjà recopiés et grisés.
   Cliquez sur **Copier depuis Français** pour reprendre les textes, puis
   traduisez le nom, l'accroche, la description, les conseils, la
   conservation et la recette. Ce que vous ne traduisez pas s'affiche en
   français sur la version anglaise.
5. **Enregistrer**. Le produit apparaît sur le site environ deux minutes
   plus tard, dans sa catégorie.
6. Pensez à l'ajouter dans les **Produits associés** d'un ou deux produits
   proches, pour qu'il soit proposé ailleurs.

---

## 7. Supprimer un produit

Si le produit reviendra un jour, préférez **Rupture** (partie 5) : la page
reste en ligne, Google la garde, et il suffit de remettre en stock.

Pour supprimer définitivement :

1. **D'abord, retirez-le des autres fiches.** Utilisez la loupe pour
   chercher son nom, puis :
   - dans chaque produit qui le cite dans **Produits associés**, retirez-le
     et enregistrez ;
   - dans **Pages**, **Accueil**, vérifiez qu'il ne fait pas partie des
     trois produits de **Les trois produits dont la recette est montrée** ;
     sinon, choisissez-en un autre et enregistrez.
2. Ouvrez le produit, menu de la fiche, **Supprimer**, puis confirmez.
3. Les fiches française et anglaise sont supprimées ensemble.

Si vous oubliez l'étape 1, rien ne casse pour les clients : le site refuse
simplement de se mettre à jour et garde la version précédente en ligne.
Faites alors l'étape 1, enregistrez, et la mise à jour repart.

---

## 8. Les catégories

Les catégories rangent la boutique : poudres, tisanes, graines, cacao.

**Modifier une catégorie**

1. **Catégories**, puis la catégorie.
2. Modifiez le **Nom**, l'**Introduction** (deux phrases en haut de sa page),
   l'**Image** ou l'**Ordre d'affichage** (1 pour la première).
3. Passez en anglais pour le nom et l'introduction anglais.
4. **Enregistrer**.

**Ajouter une catégorie** : **Nouveau**, puis nom, introduction, ordre et
image. L'adresse proposée reprend le nom ; raccourcissez-la en un seul mot
sans accent, par exemple `epices`. Elle ne pourra plus changer ensuite.
Rangez ensuite des produits dedans (champ **Catégorie** de chaque produit).

**Supprimer une catégorie** n'est pas possible depuis l'administration,
pour éviter de laisser des produits sans rayon. Déplacez d'abord ses
produits vers une autre catégorie, puis demandez la suppression à votre
développeur.

---

## 9. Les textes des pages : accueil, histoire, FAQ, contact

1. Cliquez sur **Pages**, puis sur la page : **Accueil**, **Notre
   histoire**, **Questions fréquentes** ou **Contact**.
2. Modifiez les textes en français, puis passez en anglais pour la
   traduction.
3. **Enregistrer**.

Ce qu'il faut savoir page par page :

- **Accueil** : le grand bandeau (petit titre, titre, suite du titre en
  couleur, texte, boutons), les **quatre engagements** sous le bandeau
  (pictogramme et texte ; il y en a toujours quatre), les titres des
  sections, le texte « Deux terres », et les **trois produits** dont la
  recette est montrée (choisissez des produits qui ont une « Petite
  recette »). Les produits mis en avant se choisissent dans chaque fiche
  produit (case **Mettre en avant sur l'accueil**).
- **Notre histoire** : une introduction et des sections (titre, texte, photo
  facultative avec sa description). Si vous ajoutez ou retirez une section
  en français, faites de même en anglais, dans le même ordre.
- **Questions fréquentes** : une liste de questions et réponses. Même règle :
  même nombre et même ordre en français et en anglais.
- **Contact** : le titre, l'introduction et les horaires. L'adresse, le
  téléphone et l'e-mail se changent dans les **Réglages** (partie 11).

**Attention aux chiffres écrits en toutes lettres.** La réponse « La
livraison est-elle offerte ? » de la FAQ cite le seuil de 49 € et les prix
4,90 € et 6,90 €, et une autre réponse cite les délais. Si vous changez ces
montants dans les Réglages, corrigez aussi ces réponses, en français et en
anglais.

Les **Titres et descriptions pour Google** apparaissent dans les résultats
de recherche : une phrase claire de 150 caractères environ suffit.

---

## 10. Les textes légaux

Les mentions légales, les conditions générales de vente (CGV) et la
politique de confidentialité sont dans **Textes légaux**.

1. Ouvrez le texte, modifiez-le comme dans un traitement de texte
   (titres, gras, listes avec les boutons au-dessus).
2. Les mots entre accolades, comme `{company}`, `{siren}`, `{address}`,
   `{email}`, `{phone}`, `{host}` ou `{vat}`, sont remplacés automatiquement
   par les informations des Réglages. **Ne les modifiez pas, ne les
   traduisez pas.**
3. Les lignes qui commencent par **TODO** sont à compléter avant
   l'ouverture : le nom de la directrice de la publication (mentions
   légales) et le médiateur de la consommation (CGV). Remplacez toute la
   ligne, mot TODO compris.
4. **Enregistrer**. La date « Dernière mise à jour » se met à jour toute
   seule.

La version française fait foi. Si vous changez une règle des CGV (délai de
retour, frais...), faites relire le changement avant de l'enregistrer, et
reportez-le dans la version anglaise.

---

## 11. Les réglages : livraison, pause, bandeau, TVA, coordonnées

Cliquez sur **Réglages de la boutique**. Tout ici vaut pour les deux
langues ; les textes affichés aux clients ont une case « En français » et
une case « En anglais » (vide, c'est le français qui s'affiche).

**Frais de port**

1. Dépliez **Modes de livraison**, puis le mode : Point Relais, livraison à
   domicile ou retrait à Arnouville.
2. Changez le **Prix** (avec un point : `4.90`, ou `0` pour gratuit), le
   **Délai affiché**, le **Nom affiché**, ou décochez **Proposé aux clients**
   pour le retirer temporairement.
3. **Enregistrer**.

Ajouter un mode de livraison ou un pays demande votre développeur.

**Seuil de livraison offerte**

Dans **Boutique**, **Livraison offerte à partir de** : le montant du panier
(produits seuls) à partir duquel la livraison devient gratuite, par exemple
`49`. Pensez à la FAQ (partie 9).

**Mettre la boutique en pause (vacances)**

1. **Boutique**, décochez **Boutique ouverte**.
2. **Enregistrer**.

Le site reste visible, un message annonce la pause, et le paiement est
désactivé. Au retour, recochez la case et enregistrez. Vous pouvez
annoncer la date de retour dans le bandeau d'annonce.

**Bandeau d'annonce**

**Boutique**, **Bandeau d'annonce** : une phrase affichée tout en haut de
toutes les pages (« Livraison offerte dès 49 € », « Fermeture du 1er au 15
août »...). En français et en anglais. Effacez le texte pour faire
disparaître le bandeau.

**TVA**

À régler une fois, avec votre comptable :

- **Franchise en base** : vous ne facturez pas la TVA ; les CGV et les
  mentions légales affichent automatiquement « TVA non applicable, art. 293
  B du CGI ».
- **Prix TTC avec TVA** : les prix saisis sont TTC, et le **Taux** (5.5 pour
  l'alimentaire) apparaît dans les textes légaux.

Changer de régime ne change pas vos prix : vérifiez-les ensuite.

**Coordonnées et entreprise**

**Entreprise et coordonnées** : nom, devise, e-mail de contact, téléphone
(10 chiffres collés, `0775689108`), adresse, lien Instagram complet, numéro
**SIREN** (9 chiffres) et atelier de conditionnement. Ces informations
apparaissent dans le pied de page, la page Contact et les textes légaux.

**Quantité maximale par produit** : le nombre de sachets d'un même produit
qu'une cliente peut commander d'un coup (10 au départ).

**Lancement : les prix provisoires**

Les prix actuels des dix produits sont **provisoires**. Tant que la case
**Lancement**, **Prix confirmés** n'est pas cochée, la vérification faite
avant l'ouverture de la boutique échoue et le site ne peut pas ouvrir au
public. Quand chaque prix est le bon :

1. Vérifiez une dernière fois le prix de chaque produit (tri par prix dans
   la liste des produits).
2. **Réglages de la boutique**, **Lancement**, cochez **Prix confirmés**.
3. **Enregistrer**.

La même vérification exige le numéro SIREN et l'absence de ligne « TODO »
dans les textes légaux.

---

## 12. Après « Enregistrer » : la mise en ligne

Quand vous cliquez sur **Enregistrer** :

1. L'administration affiche « Entrée enregistrée ». Votre modification est
   gardée en sécurité.
2. Le site se reconstruit automatiquement : comptez **environ deux
   minutes**.
3. Ouvrez la page concernée sur racinesenpartage.fr et actualisez-la (touche
   F5, ou tirez la page vers le bas sur téléphone). Le lien **Afficher sur
   le site en ligne** de la fiche y mène directement.

Il n'y a pas de brouillon : chaque enregistrement part en ligne. Pour
préparer un long texte tranquillement, écrivez-le d'abord dans un document
à part.

**Si la modification n'apparaît pas après cinq minutes**

1. Actualisez la page avec Ctrl + F5 (Cmd + Maj + R sur Mac), ou ouvrez-la
   dans une fenêtre de navigation privée.
2. Toujours rien : le site a peut-être refusé la modification (photo
   manquante, prix vide, produit supprimé encore cité ailleurs...). Dans ce
   cas, **l'ancienne version reste en ligne**, les clients ne voient aucune
   panne. Relisez votre dernière modification ; si vous ne voyez pas
   l'erreur, envoyez à votre développeur le nom de la fiche et l'heure de
   l'enregistrement.

Toutes vos modifications sont conservées avec leur date : une erreur peut
toujours être annulée par votre développeur.

---

## 13. Les commandes dans Stripe : voir, rembourser, codes promo, reçus

Stripe encaisse les paiements et garde la liste de toutes vos commandes.
Connectez-vous sur **dashboard.stripe.com** (ou dans l'application Stripe
sur votre téléphone). Les noms des menus de Stripe changent parfois
légèrement ; s'ils diffèrent de ce guide, cherchez le mot le plus proche.

**Voir les commandes**

1. Menu **Paiements** (ou **Transactions**).
2. Chaque ligne est une commande payée : montant, date, e-mail du client.
3. Cliquez sur une ligne pour le détail : produits, client, téléphone, et
   dans les **métadonnées** le mode de livraison et le point relais choisi.

Vous recevez aussi un e-mail « Nouvelle commande » pour chaque commande
(partie 14). L'argent est versé automatiquement sur votre compte bancaire,
quelques jours après le paiement.

**Rembourser**

1. Ouvrez le paiement.
2. Bouton **Rembourser**.
3. Laissez le montant total, ou tapez un montant plus petit pour un
   remboursement partiel (un sachet manquant, les frais de port...).
4. Choisissez un motif, puis confirmez.

Le client reçoit l'argent sous 5 à 10 jours sur sa carte. Les frais Stripe
du paiement d'origine ne sont pas rendus.

**Créer un code promo**

1. Menu **Catalogue de produits**, onglet **Coupons**, **Créer un coupon**.
2. Choisissez un pourcentage (10 %) ou un montant (5 €), la durée
   « Une fois », éventuellement une date de fin ou un nombre maximal
   d'utilisations.
3. Dans le coupon, ajoutez un **code promotionnel** que les clients
   taperont, par exemple `BIENVENUE10`.
4. Le client saisit ce code sur la page de paiement Stripe, dans « Ajouter
   un code promotionnel ».

Pour arrêter un code, désactivez-le dans le coupon.

**Les reçus**

Stripe envoie un reçu par e-mail au client après chaque paiement et chaque
remboursement (si l'option est activée dans **Paramètres**, **E-mails
clients**). Pour renvoyer un reçu : ouvrez le paiement, **Envoyer le reçu**.

---

## 14. Préparer un colis à partir de l'e-mail de commande

Pour chaque commande payée, vous recevez dans votre boîte Outlook un e-mail
« Nouvelle commande » avec : le numéro de commande, les produits et
quantités, le montant, le nom, l'e-mail et le **téléphone** du client, le
mode de livraison, et pour le Point Relais le **bloc du point relais**
(nom, adresse, numéro du type `FR-123456`).

**Point Relais Mondial Relay**

1. Préparez le colis : les sachets de la commande, bien calés.
2. Pesez le colis fermé (une balance de cuisine suffit).
3. Connectez-vous à votre espace professionnel Mondial Relay et créez une
   nouvelle expédition.
4. Destinataire : le **nom** et le **téléphone** de l'e-mail (Mondial Relay
   envoie un SMS au client quand le colis arrive), et l'e-mail du client.
5. Mode de livraison : **Point Relais**. Indiquez le **numéro du point
   relais** de l'e-mail (les chiffres après `FR-`), ou cherchez-le par son
   nom et son code postal.
6. Indiquez le **poids** pesé.
7. Validez : l'étiquette est payée avec votre solde prépayé. Imprimez-la,
   collez-la sur le colis.
8. Déposez le colis dans un Point Relais près de chez vous.

Les écrans de Mondial Relay peuvent évoluer ; les informations demandées
restent celles de l'e-mail.

**Livraison à domicile (Colissimo)**

L'e-mail contient l'adresse de livraison. Achetez l'étiquette Colissimo
(en ligne sur le site de La Poste, ou au bureau de poste) avec cette
adresse et le poids, puis déposez le colis.

**Retrait à Arnouville**

L'e-mail indique « Retrait ». Appelez ou envoyez un SMS au client (numéro
dans l'e-mail) pour convenir d'un rendez-vous au 9 Rue du Marché.

Astuce : quand le colis est parti, répondez à l'e-mail du client (partie 15) pour lui dire qu'il est en route.

---

## 15. Répondre à une cliente ou un client

Les clients vous écrivent à **racinesenpartage@outlook.com** (affiché sur la
page Contact) ou vous appellent au 07 75 68 91 08. Quand un client répond à
son e-mail de confirmation de commande, sa réponse arrive aussi dans votre
boîte Outlook.

Quelques conseils :

- Répondez sous deux jours ouvrés, même brièvement (« Bien reçu, je regarde
  et je reviens vers vous demain »).
- Demandez toujours le **numéro de commande** : il est dans l'e-mail de
  confirmation du client et dans le vôtre.
- **Colis en retard** : vérifiez le suivi dans votre espace Mondial Relay et
  transmettez le lien de suivi au client.
- **Colis abîmé** : demandez une photo, puis renvoyez le produit ou
  remboursez (partie 13).
- **Retour** : un sachet fermé peut être retourné dans les 14 jours ; un
  sachet ouvert ne peut pas être repris (hygiène), comme l'expliquent les
  CGV et la FAQ.
- **Questions sur la santé** : restez sur les mots de l'étiquette et
  conseillez de demander l'avis d'un médecin ou d'un pharmacien.

---

## 16. Que faire si...

| Situation                                                         | Que faire                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Un prix est faux sur le site**                                  | Produits, le produit, en français, **Prix TTC** avec un point (`8.90`), Enregistrer. En ligne en deux minutes. Une commande déjà payée au mauvais prix : remboursez la différence dans Stripe (partie 13).                                                      |
| **Une photo est floue ou mal cadrée**                             | Reprenez la photo à la lumière du jour, sans zoom, puis remplacez-la (partie 4). Si elle est floue seulement sur le site, elle était sans doute trop petite au départ : envoyez l'original, pas une capture d'écran ni une photo reçue par messagerie.          |
| **Une commande est payée mais je n'ai pas reçu d'e-mail**         | Regardez dans les **courriers indésirables** d'Outlook. La commande est de toute façon dans **Stripe**, Paiements, avec tout ce qu'il faut pour le colis. Si plusieurs e-mails manquent, prévenez votre développeur.                                            |
| **Un client dit n'avoir rien reçu après sa commande**             | Vérifiez le paiement dans Stripe. Envoyez-lui son reçu depuis le paiement (**Envoyer le reçu**) et confirmez-lui sa commande par e-mail.                                                                                                                        |
| **Le site est en panne** (page blanche, erreur)                   | Essayez depuis un autre appareil ou en 4G pour vérifier que ce n'est pas votre connexion. Si le site est vraiment inaccessible, prévenez votre développeur avec l'heure et une capture d'écran. Vos commandes et vos paiements restent en sécurité chez Stripe. |
| **Ma modification n'apparaît pas**                                | Attendez cinq minutes, actualisez (Ctrl + F5). Toujours rien : voir la partie 12.                                                                                                                                                                               |
| **L'administration refuse d'enregistrer**                         | Un champ est en rouge : il est obligatoire ou mal rempli (prix sans point, téléphone avec des espaces...). Lisez le message sous le champ, corrigez, enregistrez.                                                                                               |
| **J'ai perdu mon mot de passe GitHub**                            | Sur github.com, **Sign in**, puis **Forgot password?** : un lien arrive sur votre e-mail. Si vous avez perdu votre téléphone à codes, utilisez vos codes de secours (gardés à l'activation), sinon prévenez votre développeur.                                  |
| **J'ai perdu mon mot de passe Stripe ou Outlook**                 | Sur la page de connexion, « Mot de passe oublié » : un lien arrive par e-mail ou par SMS.                                                                                                                                                                       |
| **Je veux changer un texte en anglais seulement**                 | Ouvrez la fiche ou la page, passez en **anglais** avec le menu de langue, modifiez le texte, Enregistrer. Le français ne bouge pas.                                                                                                                             |
| **Je veux changer un texte en français et en anglais**            | Modifiez le français, enregistrez, passez en anglais, modifiez, enregistrez. Un champ anglais vide affiche le français.                                                                                                                                         |
| **Un produit est épuisé**                                         | Disponibilité : **Rupture** (partie 5).                                                                                                                                                                                                                         |
| **Je pars en vacances**                                           | Réglages, Boutique, décochez **Boutique ouverte**, et annoncez la date de retour dans le bandeau (partie 11).                                                                                                                                                   |
| **Je change d'adresse e-mail ou de téléphone**                    | Réglages, Entreprise et coordonnées. Prévenez aussi votre développeur pour l'e-mail : les e-mails de commande sont envoyés à une adresse réglée de son côté.                                                                                                    |
| **Je veux changer les frais de port ou le seuil**                 | Réglages, Modes de livraison ou Boutique (partie 11), puis la réponse de la FAQ qui cite ces montants (partie 9).                                                                                                                                               |
| **Je veux une nouvelle page, un nouveau mode de livraison, etc.** | Demandez à votre développeur : c'est une nouvelle fonctionnalité, pas un changement de texte.                                                                                                                                                                   |

---

## 17. Qui contacter

- **Votre développeur** : pour tout ce qui ne se règle pas avec ce guide.
  Indiquez toujours la page concernée, ce que vous avez fait, l'heure, et
  joignez une capture d'écran.
- **Stripe** : aide en français depuis le tableau de bord (menu Aide), pour
  les versements, les remboursements et les litiges bancaires.
- **Mondial Relay** : service client professionnel depuis votre espace,
  pour les étiquettes et les colis.
