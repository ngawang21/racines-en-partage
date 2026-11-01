# Guide de votre boutique Racines en Partage

Bonjour Marie,

Ce guide vous accompagne pour tout ce que vous ferez seule sur votre
boutique : changer un prix, une photo ou un texte, indiquer une rupture,
masquer ou ajouter un produit, changer l'ordre de la boutique, mettre la
boutique en pause, suivre les commandes dans Stripe et préparer les colis
Mondial Relay.

Chaque partie traite une seule tâche, avec des étapes numérotées. Les mots
en **gras** sont ceux que vous verrez à l'écran, à l'identique. Gardez ce
guide à portée de main les premières semaines ; ensuite, le tableau « Que
faire si » à la fin suffit souvent.

**Sommaire**

1. Se connecter à l'administration, sur ordinateur ou sur téléphone
2. L'écran d'accueil de l'administration
3. Modifier un prix, un poids ou un texte
4. Les photos : bien les prendre, les ajouter, les changer
5. Indiquer une rupture, remettre en stock, masquer un produit
6. Ajouter un nouveau produit
7. La traduction anglaise (facultative)
8. Supprimer un produit
9. Changer l'ordre de la boutique
10. Les catégories
11. Les textes des pages : accueil, histoire, FAQ, contact
12. Les textes légaux
13. Les réglages : boutique ouverte, bandeau, livraison, TVA, lancement
14. Après « Enregistrer » : la mise en ligne et la vérification
15. Les commandes dans Stripe : voir, rembourser, codes promo, reçus
16. Préparer un colis à partir de l'e-mail de commande
17. Répondre à une cliente ou un client
18. Que faire si...
19. Qui contacter

---

## 1. Se connecter à l'administration, sur ordinateur ou sur téléphone

L'administration est la partie privée du site, où vous modifiez vos
produits et vos textes. Elle se trouve à l'adresse
**racinesenpartage.fr/admin/**. Personne d'autre ne peut y entrer : il faut
votre compte GitHub (GitHub est le service qui garde en sécurité tous les
fichiers de votre site).

**Sur l'ordinateur**

1. Ouvrez votre navigateur (Chrome, Edge, Firefox ou Safari).
2. Tapez **racinesenpartage.fr/admin/** dans la barre d'adresse.
3. Cliquez sur **Se connecter avec GitHub**.
4. Une petite fenêtre GitHub s'ouvre. Entrez votre identifiant
   (`racinesenpartage`) et votre mot de passe GitHub, puis le code à six
   chiffres de votre application d'authentification si GitHub le demande.
5. La toute première fois, GitHub demande l'autorisation : cliquez sur le
   bouton vert **Authorize** (autoriser).
6. La fenêtre se ferme et l'administration s'affiche.

**Sur le téléphone, sans retaper le mot de passe**

1. Connectez-vous d'abord sur l'ordinateur (ci-dessus).
2. Cliquez sur le rond avec votre photo ou votre initiale, en haut à
   droite, puis sur **Se connecter sur mobile**. Un code QR s'affiche.
3. Sur le téléphone, ouvrez l'appareil photo et visez ce code, puis
   touchez le lien qui apparaît. L'administration s'ouvre, déjà connectée.

Vous pouvez aussi ouvrir racinesenpartage.fr/admin/ sur le téléphone et
toucher **Se connecter avec GitHub**, comme sur l'ordinateur. Sur
téléphone, l'écran montre une seule colonne à la fois : touchez la flèche
en haut à gauche pour revenir en arrière.

L'administration s'affiche en français si votre navigateur est en
français. Sinon : rond avec votre initiale, **Paramètres**, **Langue**,
puis choisissez Français. Vous restez connectée plusieurs jours sur le même
appareil.

Pour vous déconnecter (sur un ordinateur partagé, par exemple) : rond avec
votre photo ou votre initiale, puis **Se déconnecter**.

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

À gauche (sur téléphone : en touchant le menu), la liste de ce que vous
pouvez modifier :

| Rubrique                    | Ce que vous y trouvez                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| **Produits**                | Une fiche par sachet (10 au départ)                                        |
| **Catégories**              | Les rayons : poudres, tisanes, graines, cacao                              |
| **Pages**                   | Accueil, Notre histoire, Questions fréquentes, Contact                     |
| **Textes légaux**           | Mentions légales, CGV, politique de confidentialité (séparés par un trait) |
| **Réglages de la boutique** | Ouverture, bandeau, TVA, livraison, lancement, coordonnées                 |

Dans **Produits**, chaque ligne montre la première photo, le nom et le
poids du produit, et la mention « (masqué) » pour un produit masqué. La
liste est dans l'ordre de la boutique. En haut de la liste :

- **Trier** : par ordre de la boutique (**Manuel**), par nom, par prix, par
  disponibilité ou par poids.
- **Filtrer** : afficher seulement les produits **En stock**, **Plus que
  quelques sachets**, **Rupture**, **Masqués du site**, **Mis en avant sur
  l'accueil**, ceux dont les valeurs nutritionnelles sont masquées, ou une
  seule catégorie.
- **Grouper** : ranger la liste par catégorie ou par disponibilité.
- **Réorganiser** : changer l'ordre de la boutique (partie 9).
- **Nouveau** (sur téléphone, le bouton **+**) : ajouter un produit
  (partie 6).

La loupe en haut de l'écran cherche un mot dans tous vos contenus.

Sous chaque case, une phrase grise explique ce qu'il faut y mettre, avec un
exemple. Une case obligatoire laissée vide devient rouge au moment
d'enregistrer, avec le message « Ce champ est obligatoire. » ; rien n'est
enregistré tant qu'elle n'est pas remplie.

---

## 3. Modifier un prix, un poids ou un texte

**Changer un prix**

1. **Produits**, puis touchez le produit.
2. Dans **Prix TTC**, tapez le nouveau prix, avec une virgule ou un point :
   `8,90` ou `8.90`. Deux chiffres après la virgule au plus.
3. Cliquez sur **Enregistrer**, en haut à droite.
4. Le site est à jour environ deux minutes plus tard (partie 14).

**Changer le poids**

1. Ouvrez le produit, case **Poids net** : en grammes, par exemple `250`.
2. **Enregistrer**.

Attention : l'adresse de la page (par exemple `poudre-de-baobab-100g`) ne
change pas avec le poids. Pour vendre un nouveau format, ajoutez plutôt un
nouveau produit (partie 6) et masquez l'ancien (partie 5).

**Changer une description ou un autre texte**

1. Ouvrez le produit. La fiche est en **français** ; c'est en français que
   l'on règle le prix, le poids, la disponibilité, les photos et l'origine.
2. Modifiez le texte voulu : **Phrase d'accroche**, **Description**,
   **Ingrédients**, **Conseils d'utilisation**, **Conservation**... Dans la
   description, laissez une ligne vide entre deux paragraphes.
3. **Enregistrer**.

L'ordre des cases suit celui d'une étiquette : d'abord le nom, les photos,
le prix, le poids, la disponibilité et la catégorie ; puis les textes ;
puis les détails de l'étiquette (origine, mentions « sans », valeurs
nutritionnelles) ; enfin les produits associés et les textes pour Google.

**Règle importante sur les textes des produits** : la loi encadre
strictement ce que l'on peut dire des bienfaits d'un aliment. Dans « Les
bienfaits », gardez uniquement les phrases imprimées sur l'étiquette, sans
en ajouter. En cas de doute, demandez avant d'enregistrer.

---

## 4. Les photos : bien les prendre, les ajouter, les changer

**Prendre une bonne photo avec le téléphone**

1. Près d'une fenêtre, en plein jour, sans flash et sans soleil direct.
2. Un fond simple et clair : une feuille blanche, une planche en bois, un
   torchon uni.
3. Le sachet de face, l'étiquette bien lisible, qui remplit presque toute
   la photo. Tenez le téléphone droit, à hauteur du sachet.
4. Essuyez l'objectif, ne zoomez pas : approchez-vous plutôt.
5. Cadrez en **carré** si votre appareil le propose ; sinon, laissez de la
   marge autour du sachet.
6. Prenez-en plusieurs et gardez la plus nette.
7. Idées pour les photos suivantes : la poudre dans un bol, la recette
   prête, le dos de l'étiquette.

**Format et taille**

- Envoyez la photo originale, telle que le téléphone l'a prise : pas une
  capture d'écran, ni une photo reçue par WhatsApp ou Messenger (elles sont
  abîmées). Au moins 1200 pixels de large, ce qu'un téléphone récent
  dépasse toujours.
- Formats acceptés : JPEG, PNG, WebP et les photos d'iPhone (format HEIC),
  qui sont converties à l'envoi. Si une photo d'iPhone est refusée, réglez
  l'iPhone sur « Le plus compatible » (Réglages, Appareil photo, Formats)
  pour qu'il prenne ses photos en JPEG, puis recommencez.
- Inutile de réduire la photo : l'administration la convertit en WebP (un
  format léger pour le web) et la ramène à 1600 pixels au plus, puis le
  site fabrique toutes les tailles utiles. Après conversion, une photo
  pèse en général moins de 500 Ko ; au-delà de 2 Mo, elle est refusée avec
  un message.
- La photo est renommée d'après le produit, par exemple
  `poudre-de-baobab-250g-x7k2.webp` : vous n'avez pas à vous en occuper.

**Ajouter ou remplacer une photo**

1. Ouvrez le produit, en français.
2. Dans **Photos**, touchez **Parcourir** (ou, sur l'ordinateur, déposez
   la photo dans la zone « Déposez des fichiers image ici ou »). Sur
   téléphone, le téléphone propose alors sa photothèque ou l'appareil
   photo.
3. Une photo déjà envoyée se retrouve dans la liste et se choisit d'un
   geste.
4. La **première** photo de la liste est la photo principale, celle de la
   boutique. Faites glisser les photos pour changer l'ordre.
5. Pour retirer une photo de la fiche, utilisez **Supprimer** à côté
   d'elle (ou **Remplacer** pour en mettre une autre à sa place). Il faut
   toujours au moins une photo.
6. **Enregistrer**. Les photos partent avec la fiche.

Les photos des catégories et de la page « Notre histoire » se changent de
la même manière dans leur rubrique ; elles peuvent être en largeur.

---

## 5. Indiquer une rupture, remettre en stock, masquer un produit

Le site ne compte pas les sachets : c'est vous qui indiquez la
disponibilité.

**Indiquer une rupture**

1. Ouvrez le produit, en français.
2. Dans **Disponibilité**, choisissez :
   - **En stock** : achat normal ;
   - **Plus que quelques sachets** : un badge prévient les clients, l'achat
     reste possible ;
   - **Rupture** : la fiche reste visible avec la mention « Rupture », mais
     le bouton d'achat est désactivé.
3. **Enregistrer**.

**Remettre en stock** : même chemin, choisissez **En stock**, puis
**Enregistrer**. Le filtre **Rupture** de la liste montre d'un coup d'œil
tout ce qui est épuisé.

**Masquer un produit** (produit saisonnier, ancien format, pause longue)

1. Ouvrez le produit, en français.
2. Cochez **Masquer ce produit du site**.
3. **Enregistrer**.

Deux minutes plus tard, le produit a disparu du site : boutique, page du
produit, panier, Google. Il reste dans l'administration, marqué
« (masqué) » dans la liste et visible avec le filtre **Masqués du site**.
Pour le faire revenir, décochez la case et enregistrez : tout revient à
l'identique, à la même adresse.

Rupture ou masqué ? **Rupture** si le produit revient bientôt (la page reste
en ligne et Google la garde) ; **Masquer** s'il ne doit plus être vu du
tout pendant un temps.

---

## 6. Ajouter un nouveau produit

Le plus simple est souvent de **dupliquer** un produit proche (même
catégorie, autre poids), puis de changer ce qui diffère.

1. Dans **Produits**, cliquez sur **Nouveau** (sur téléphone, **+**). Pour
   dupliquer, ouvrez plutôt le produit modèle, touchez le menu **⋮** en
   haut à droite (« Afficher les options de l'éditeur ») et choisissez
   **Dupliquer**. Pensez alors à changer la **Référence (SKU)**, que deux
   produits ne peuvent pas partager.
2. Une fiche neuve est déjà en **En stock**, à **100 g**, avec la phrase de
   conservation habituelle. Remplissez-la **en français**, de haut en bas :

| Case                                 | Quoi mettre                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Nom du produit                       | Comme sur le sachet, sans le poids : « Poudre de baobab »                         |
| Photos                               | Au moins une ; la première est la photo principale (partie 4)                     |
| Prix TTC                             | `12,50`                                                                           |
| Poids net                            | En grammes : `250`                                                                |
| Disponibilité                        | En général « En stock »                                                           |
| Masquer ce produit du site           | Cochez-la si le produit ne doit pas encore se voir                                |
| Catégorie                            | À choisir dans la liste                                                           |
| Référence (SKU)                      | REP, trois lettres, le poids : `REP-BAO-250`. Ne la changez plus ensuite          |
| Mettre en avant sur l'accueil        | Trois ou quatre produits cochés au total                                          |
| Phrase d'accroche                    | Une phrase sous le nom                                                            |
| Description                          | Deux à quatre phrases ; une ligne vide entre deux paragraphes                     |
| Ingrédients                          | Mot pour mot, comme sur l'étiquette                                               |
| Conseils d'utilisation               | Un conseil par ligne (bouton **Ajouter**)                                         |
| Les bienfaits                        | Seulement les phrases de l'étiquette, ou rien                                     |
| Comment est-il obtenu ?              | Facultatif                                                                        |
| Petite recette                       | Facultative : titre, ingrédients, étapes                                          |
| Conservation                         | Déjà remplie ; corrigez si l'étiquette dit autre chose                            |
| Origine, Pays d'origine              | Comme sur l'étiquette ; le pays seulement si c'est un seul pays                   |
| Mentions « sans »                    | Seulement ce que l'étiquette affirme et qui est vrai                              |
| Afficher les valeurs nutritionnelles | À cocher quand le tableau ci-dessous est recopié et vérifié                       |
| Valeurs nutritionnelles pour 100 g   | Recopiez le tableau de l'étiquette, unités comprises (« 3,0 g »), les huit lignes |
| Produits associés                    | Deux ou trois produits proposés en bas de la fiche                                |
| Titre et description pour Google     | Facultatifs ; sinon le nom et l'accroche sont utilisés                            |

3. **L'adresse de la page.** L'administration propose l'adresse de la
   future page à partir du nom et du poids, par exemple
   `poudre-de-baobab-250g`, qui donnera
   racinesenpartage.fr/produits/poudre-de-baobab-250g/. Gardez la
   proposition. Cette adresse **ne pourra plus être changée** après le
   premier enregistrement, pour que les liens partagés ne cassent jamais.
4. **L'anglais** est facultatif (partie 7) : vous pouvez enregistrer sans
   rien traduire, la page anglaise affichera le français.
5. **Enregistrer**. Le produit apparaît sur le site environ deux minutes
   plus tard, en dernier dans sa catégorie (partie 9 pour le déplacer).
6. Pensez à l'ajouter dans les **Produits associés** d'un ou deux produits
   proches, pour qu'il soit proposé ailleurs.

---

## 7. La traduction anglaise (facultative)

Le site existe aussi en anglais (racinesenpartage.fr/en/). Pour chaque
texte, l'anglais est **facultatif** : une case anglaise vide affiche le
texte français. Le prix, le poids, les photos, le stock et la catégorie ne
se règlent qu'en français et valent pour les deux langues ; ils
n'apparaissent pas du côté anglais.

**Traduire ou corriger l'anglais d'un produit**

1. Ouvrez le produit. Sur l'ordinateur, la fiche anglaise s'affiche à côté
   de la française ; sur le téléphone, passez en anglais avec le choix de
   langue en haut de la fiche (« Changer de langue du contenu »).
2. Pour ne pas tout retaper : dans le menu de la langue anglaise
   (« Afficher les options de contenu en anglais »), choisissez **Copier
   depuis français**, puis traduisez les textes copiés.
3. Modifiez les textes anglais, puis **Enregistrer**.

**Ne pas proposer d'anglais pour un produit**

Laissez simplement les cases anglaises vides : le site anglais montrera le
texte français. Vous pouvez aussi, dans le même menu de la langue anglaise,
choisir **Désactiver anglais** : la fiche anglaise est supprimée à
l'enregistrement, et **Activer anglais** la fait revenir.

Les catégories et les pages se traduisent de la même manière.

---

## 8. Supprimer un produit

Avant de supprimer, demandez-vous si **Masquer** (partie 5) ne suffit pas :
un produit masqué revient en un clic, un produit supprimé doit être
recréé.

1. Ouvrez le produit.
2. Menu **⋮** en haut à droite, **Supprimer**.
3. Confirmez à la question « Voulez-vous vraiment supprimer cette entrée ? ».
   Les fiches française et anglaise sont supprimées ensemble.
4. Deux minutes plus tard, la page du produit n'existe plus.

S'il était cité dans les **Produits associés** d'autres fiches, le site
l'enlève de lui-même ; il n'y a rien à faire. Si c'était l'un des trois
produits de **Les trois produits dont la recette est montrée** (Pages,
Accueil), choisissez-en un autre, sinon l'accueil ne montrera que deux
recettes. Ses photos restent rangées dans l'administration, au cas où.

---

## 9. Changer l'ordre de la boutique

Sur le site, les produits sont rangés par catégorie, dans l'ordre des
catégories, puis dans l'ordre que vous choisissez. Les produits mis en
avant passent en tête de la page Boutique.

**Déplacer un produit**

1. Cliquez sur **Produits**.
2. Cliquez sur **Réorganiser**, en haut de la liste. Les produits
   s'affichent groupés par catégorie.
3. Faites glisser le produit à sa place dans sa catégorie, ou utilisez ses
   flèches **Déplacer vers le haut** et **Déplacer vers le bas** (plus
   simple sur téléphone).
4. Cliquez sur **Terminé**. Le nouvel ordre est enregistré, et le site est à
   jour deux minutes plus tard.

Un produit ne change pas de catégorie ici : pour cela, changez sa case
**Catégorie** dans la fiche.

**Changer l'ordre des catégories** : même chose dans **Catégories**,
**Réorganiser**, puis **Terminé**.

---

## 10. Les catégories

Les catégories rangent la boutique : poudres, tisanes, graines, cacao.

**Modifier une catégorie**

1. **Catégories**, puis la catégorie.
2. Modifiez le **Nom**, l'**Introduction** (deux phrases en haut de sa page)
   ou l'**Image**.
3. Passez en anglais pour le nom et l'introduction anglais (facultatif).
4. **Enregistrer**.

**Ajouter une catégorie** : **Nouveau**, puis nom, introduction et image.
L'adresse proposée reprend le nom ; raccourcissez-la en un seul mot sans
accent, par exemple `epices`. Elle ne pourra plus changer ensuite. La
nouvelle catégorie se range en dernier (partie 9 pour la déplacer). Rangez
ensuite des produits dedans (case **Catégorie** de chaque produit).

**Supprimer une catégorie** n'est pas possible depuis l'administration,
pour éviter de laisser des produits sans rayon. Déplacez d'abord ses
produits vers une autre catégorie, puis demandez la suppression à votre
développeur.

---

## 11. Les textes des pages : accueil, histoire, FAQ, contact

1. Cliquez sur **Pages**, puis sur la page : **Accueil**, **Notre
   histoire**, **Questions fréquentes** ou **Contact**.
2. Modifiez les textes en français, puis passez en anglais pour la
   traduction (facultative).
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
  téléphone et l'e-mail se changent dans les **Réglages** (partie 13).

**Attention aux chiffres écrits en toutes lettres.** La réponse « La
livraison est-elle offerte ? » de la FAQ cite le seuil de 49 € et les prix
4,90 € et 6,90 €, et une autre réponse cite les délais. Si vous changez ces
montants dans les Réglages, corrigez aussi ces réponses, en français et en
anglais.

Les **Titres et descriptions pour Google** apparaissent dans les résultats
de recherche : une phrase claire de 150 caractères environ suffit.

---

## 12. Les textes légaux

Les mentions légales, les conditions générales de vente (CGV) et la
politique de confidentialité sont dans **Textes légaux**, sous le trait de
la liste.

**Attention : ces textes engagent la boutique.** Une faute peut coûter
cher (délai de rétractation, garanties, données personnelles). Avant de
changer une règle, faites relire le changement (votre développeur, un
conseiller ou la chambre de commerce) ; corriger une coquille ou compléter
une ligne TODO ne pose pas de problème.

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
5. Reportez le même changement dans la version anglaise. La version
   française fait foi.

---

## 13. Les réglages : boutique ouverte, bandeau, livraison, TVA, lancement

Cliquez sur **Réglages de la boutique**. Tout ici vaut pour les deux
langues ; les textes affichés aux clients ont une case « En français » et
une case « En anglais » (vide, c'est le français qui s'affiche). La page
est rangée dans cet ordre : la boutique (ouverture, bandeau, TVA, quantité,
livraison offerte), les modes de livraison, le lancement, puis les
coordonnées (repliées).

**Mettre la boutique en pause (vacances)**

1. **Réglages de la boutique**, décochez **Boutique ouverte**.
2. Dans **Bandeau d'annonce**, **En français**, annoncez le retour :
   « Boutique en pause, retour le 25 août ». Faites de même en anglais si
   vous le souhaitez.
3. **Enregistrer**.

Le site reste visible, un message annonce la pause, et le paiement est
désactivé. Au retour : recochez **Boutique ouverte**, effacez le bandeau,
**Enregistrer**.

**Changer le bandeau d'annonce**

1. **Bandeau d'annonce** : une phrase affichée tout en haut de toutes les
   pages (« Livraison offerte dès 49 € », « Fermeture du 1er au 15 août »).
   90 caractères au plus.
2. Remplissez **En français**, et **En anglais** si vous le souhaitez.
3. **Enregistrer**. Pour faire disparaître le bandeau, effacez le texte et
   enregistrez.

**Changer le seuil de livraison offerte**

1. **Livraison offerte à partir de** : le montant du panier (produits
   seuls) à partir duquel la livraison devient gratuite, par exemple `49`.
2. Pour ne plus jamais offrir la livraison, videz la case.
3. **Enregistrer**, puis corrigez la FAQ qui cite ce montant (partie 11).

La livraison offerte se décide sur ce montant avant un éventuel code promo :
un panier de 52 € avec un code de 5 € reste livré gratuitement.

**Changer les prix de livraison**

1. Dans **Livraison, modes et prix**, touchez le mode : Point Relais,
   livraison à domicile ou retrait à Arnouville.
2. Changez le **Prix** (`4,90`, ou `0` pour gratuit), le **Délai affiché**
   ou le **Nom affiché**, ou décochez **Proposé aux clients** pour le
   retirer temporairement.
3. **Enregistrer**, puis corrigez la FAQ si elle cite ce prix (partie 11).

Ajouter un mode de livraison ou un pays demande votre développeur.

**La TVA**

À régler une fois, avec votre comptable (section **TVA**, à déplier) :

- **Franchise en base** : vous ne facturez pas la TVA ; les CGV et les
  mentions légales affichent automatiquement « TVA non applicable, art. 293
  B du CGI ».
- **Prix TTC avec TVA** : les prix saisis sont TTC, et le **Taux** (5,5 pour
  l'alimentaire) apparaît dans les textes légaux.

Changer de régime ne change pas vos prix : vérifiez-les ensuite.

**Quantité maximale par produit** : le nombre de sachets d'un même produit
qu'un client peut commander d'un coup (10 au départ).

**Lancement : les prix provisoires**

Les prix actuels des dix produits sont **provisoires**. Tant que la case
**Lancement**, **Prix confirmés** n'est pas cochée, la vérification faite
avant l'ouverture de la boutique échoue et le site ne peut pas ouvrir au
public. Quand chaque prix est le bon :

1. Vérifiez une dernière fois le prix de chaque produit (**Trier**, par
   prix, dans la liste des produits).
2. **Réglages de la boutique**, **Lancement**, cochez **Prix confirmés**.
3. **Enregistrer**.

La même vérification exige le numéro SIREN et l'absence de ligne « TODO »
dans les textes légaux.

**Coordonnées et entreprise**

Dépliez **Entreprise et coordonnées** : nom, devise, e-mail de contact,
téléphone (10 chiffres collés, `0775689108`), adresse, lien Instagram
complet, numéro **SIREN** (9 chiffres) et atelier de conditionnement. Ces
informations apparaissent dans le pied de page, la page Contact et les
textes légaux.

---

## 14. Après « Enregistrer » : la mise en ligne et la vérification

Il n'y a qu'un bouton pour publier : **Enregistrer**. Il n'y a pas de
brouillon : chaque enregistrement part en ligne. Pour préparer un long
texte tranquillement, écrivez-le d'abord dans un document à part.

Quand vous cliquez sur **Enregistrer** :

1. Le bouton affiche « Enregistrement… », puis un message confirme
   « Entrée enregistrée. » (ou « Entrée enregistrée et publiée. »). Votre
   modification est gardée en sécurité, avec sa date.
2. Le service qui héberge le site (Cloudflare, « Workers Builds »)
   reconstruit alors tout le site avec votre modification. Comptez
   **environ deux minutes**.
3. Pendant ces deux minutes, l'ancienne version reste en ligne : les
   clients ne voient jamais un site à moitié à jour.

**Vérifier le résultat**

1. Attendez deux minutes.
2. Dans la fiche, touchez **Afficher sur le site en ligne** (une icône en
   haut de la fiche ; sur téléphone, dans le menu **⋮**) : la page s'ouvre
   sur racinesenpartage.fr.
3. Actualisez la page (touche F5, ou tirez la page vers le bas sur
   téléphone) et vérifiez votre changement : prix, photo, texte, badge
   « Rupture ».
4. Pour un réglage (bandeau, pause), regardez l'accueil ; pour un prix de
   livraison, ajoutez un produit au panier et ouvrez le panier.

**Si la modification n'apparaît pas après cinq minutes**

1. Actualisez la page avec Ctrl + F5 (Cmd + Maj + R sur Mac), ou ouvrez-la
   dans une fenêtre de navigation privée.
2. Toujours rien : le site a peut-être refusé la modification (par exemple
   « Afficher les valeurs nutritionnelles » cochée sans tableau). Dans ce
   cas, **l'ancienne version reste en ligne**, les clients ne voient aucune
   panne. Relisez votre dernière modification ; si vous ne voyez pas
   l'erreur, envoyez à votre développeur le nom de la fiche et l'heure de
   l'enregistrement.

Toutes vos modifications sont conservées avec leur date : une erreur peut
toujours être annulée par votre développeur.

---

## 15. Les commandes dans Stripe : voir, rembourser, codes promo, reçus

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
(partie 16). L'argent est versé automatiquement sur votre compte bancaire,
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

## 16. Préparer un colis à partir de l'e-mail de commande

Pour chaque commande payée, vous recevez dans votre boîte Outlook un e-mail
« Nouvelle commande » avec : le numéro de commande, les produits et
quantités, le montant, le nom, l'e-mail et le **téléphone** du client, le
mode de livraison, et pour le Point Relais l'**ID Point Relais** en grand
(du type `FR-123456`) suivi du nom et de l'adresse du point.

**Point Relais Mondial Relay**

1. Préparez le colis : les sachets de la commande, bien calés.
2. Pesez le colis fermé (une balance de cuisine suffit).
3. Connectez-vous à votre espace professionnel Mondial Relay et créez une
   nouvelle expédition.
4. Destinataire : le **nom** et le **téléphone** de l'e-mail (Mondial Relay
   envoie un SMS au client quand le colis arrive), et l'e-mail du client.
5. Mode de livraison : **Point Relais**. Indiquez le **numéro du point
   relais** de l'e-mail (les chiffres après `FR-`). Avant d'imprimer,
   vérifiez que le point affiché par Mondial Relay correspond bien à ce
   numéro : c'est l'ID qui fait foi, pas le nom recopié dans l'e-mail.
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

Astuce : quand le colis est parti, répondez à l'e-mail du client (partie 17) pour lui dire qu'il est en route.

---

## 17. Répondre à une cliente ou un client

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
  remboursez (partie 15).
- **Retour** : un sachet fermé peut être retourné dans les 14 jours ; un
  sachet ouvert ne peut pas être repris (hygiène), comme l'expliquent les
  CGV et la FAQ.
- **Questions sur la santé** : restez sur les mots de l'étiquette et
  conseillez de demander l'avis d'un médecin ou d'un pharmacien.

---

## 18. Que faire si...

| Situation                                                         | Que faire                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Un prix est faux sur le site**                                  | Produits, le produit, en français, **Prix TTC** (`8,90`), **Enregistrer**. En ligne en deux minutes. Une commande déjà payée au mauvais prix : remboursez la différence dans Stripe (partie 15).                                                                |
| **Une photo est floue ou mal cadrée**                             | Reprenez la photo à la lumière du jour, sans zoom, puis remplacez-la (partie 4). Si elle est floue seulement sur le site, elle était sans doute trop petite au départ : envoyez l'original, pas une capture d'écran ni une photo reçue par messagerie.          |
| **Une photo est refusée**                                         | Photo d'iPhone (HEIC) : réglez l'iPhone sur « Le plus compatible » (partie 4) et reprenez la photo. Message de taille : la photo dépasse 2 Mo même allégée, ce qui est rare ; prenez-la à nouveau sans zoom ni mode « RAW ».                                    |
| **Un produit est épuisé**                                         | **Disponibilité** : **Rupture** (partie 5).                                                                                                                                                                                                                     |
| **Je veux retirer un produit quelque temps**                      | Cochez **Masquer ce produit du site** (partie 5). Décochez pour le faire revenir.                                                                                                                                                                               |
| **Je veux changer l'ordre des produits**                          | **Produits**, **Réorganiser**, déplacez, **Terminé** (partie 9).                                                                                                                                                                                                |
| **Une commande est payée mais je n'ai pas reçu d'e-mail**         | Regardez dans les **courriers indésirables** d'Outlook. La commande est de toute façon dans **Stripe**, Paiements, avec tout ce qu'il faut pour le colis. Si plusieurs e-mails manquent, prévenez votre développeur.                                            |
| **Un client dit n'avoir rien reçu après sa commande**             | Vérifiez le paiement dans Stripe. Envoyez-lui son reçu depuis le paiement (**Envoyer le reçu**) et confirmez-lui sa commande par e-mail.                                                                                                                        |
| **Le site est en panne** (page blanche, erreur)                   | Essayez depuis un autre appareil ou en 4G pour vérifier que ce n'est pas votre connexion. Si le site est vraiment inaccessible, prévenez votre développeur avec l'heure et une capture d'écran. Vos commandes et vos paiements restent en sécurité chez Stripe. |
| **Ma modification n'apparaît pas**                                | Attendez cinq minutes, actualisez (Ctrl + F5). Toujours rien : voir la partie 14.                                                                                                                                                                               |
| **L'administration refuse d'enregistrer**                         | Une case est en rouge : elle est obligatoire ou mal remplie (prix avec trois chiffres après la virgule, téléphone avec des espaces, référence déjà prise...). Lisez le message sous la case, corrigez, **Enregistrer**.                                         |
| **J'ai fermé la fiche sans enregistrer**                          | Rouvrez-la : l'administration propose souvent **Restaurer** le brouillon. Sinon, refaites la modification.                                                                                                                                                      |
| **J'ai perdu mon mot de passe GitHub**                            | Sur github.com, **Sign in**, puis **Forgot password?** : un lien arrive sur votre e-mail. Si vous avez perdu votre téléphone à codes, utilisez vos codes de secours (gardés à l'activation), sinon prévenez votre développeur.                                  |
| **J'ai perdu mon mot de passe Stripe ou Outlook**                 | Sur la page de connexion, « Mot de passe oublié » : un lien arrive par e-mail ou par SMS.                                                                                                                                                                       |
| **Je veux changer un texte en anglais seulement**                 | Ouvrez la fiche ou la page, passez en **anglais**, modifiez le texte, **Enregistrer**. Le français ne bouge pas (partie 7).                                                                                                                                     |
| **Je veux changer un texte en français et en anglais**            | Modifiez les deux côtés, puis **Enregistrer** une fois. Un champ anglais vide affiche le français.                                                                                                                                                              |
| **Je pars en vacances**                                           | Réglages, décochez **Boutique ouverte**, et annoncez la date de retour dans le **Bandeau d'annonce** (partie 13).                                                                                                                                               |
| **Je change d'adresse e-mail ou de téléphone**                    | Réglages, **Entreprise et coordonnées**. Prévenez aussi votre développeur pour l'e-mail : les e-mails de commande sont envoyés à une adresse réglée de son côté.                                                                                                |
| **Je veux changer les frais de port ou le seuil**                 | Réglages, **Livraison, modes et prix** ou **Livraison offerte à partir de** (partie 13), puis la réponse de la FAQ qui cite ces montants (partie 11).                                                                                                           |
| **Je veux une nouvelle page, un nouveau mode de livraison, etc.** | Demandez à votre développeur : c'est une nouvelle fonctionnalité, pas un changement de texte.                                                                                                                                                                   |

---

## 19. Qui contacter

- **Votre développeur** : pour tout ce qui ne se règle pas avec ce guide.
  Indiquez toujours la page concernée, ce que vous avez fait, l'heure, et
  joignez une capture d'écran.
- **Stripe** : aide en français depuis le tableau de bord (menu Aide), pour
  les versements, les remboursements et les litiges bancaires.
- **Mondial Relay** : service client professionnel depuis votre espace,
  pour les étiquettes et les colis.
