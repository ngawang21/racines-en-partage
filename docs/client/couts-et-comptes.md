# Ce que le site coûte, et les comptes qu'il utilise

Pour Marie. Ce document complète `presentation.md` : il liste, chiffres à
l'appui, ce que la boutique coûte à faire tourner, les comptes qu'elle
utilise, qui les ouvre et ce que vous aurez à faire vous-même. Les montants
ont été relevés le 8 novembre 2026 ; « à vérifier » signale un montant à
relire sur le site du prestataire le jour où l'on s'en sert.

## 1. Le principe

Tous les comptes sont ouverts avec votre adresse
`racinesenpartage@gmail.com`. Je les crée pour vous, je configure tout, et
le jour de la remise je vous donne l'ensemble des accès dans un coffre-fort
de mots de passe (Bitwarden, gratuit) ; vous changez alors chaque mot de
passe et l'application de double authentification passe sur votre
téléphone. Vous êtes propriétaire et autonome ; je garde un accès de
collaborateur pendant la période de support, que vous retirez quand vous
le souhaitez.

Quelques étapes vous demandent en personne, parce que la loi ou le
prestataire veut la titulaire : elles sont marquées **vous** plus bas.

## 2. Ce que ça coûte

Pas d'abonnement pour le site lui-même. Un seul coût fixe : le nom de
domaine.

| Poste                                       | Coût                                                                                                         | Payé à                           | Remarque                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom de domaine racinesenpartage.fr          | 5,99 € TTC la première année, puis 9,35 € TTC par an (à vérifier)                                            | OVHcloud                         | Renouvellement automatique, au nom de votre entreprise                                                                                                                                                                                      |
| Hébergement, mise en ligne, formulaires     | 0 €                                                                                                          | Cloudflare                       | Offre gratuite : 100 000 appels par jour pour la partie commande, bien au-delà du besoin                                                                                                                                                    |
| Code du site et sauvegardes                 | 0 €                                                                                                          | GitHub                           | Dépôt privé                                                                                                                                                                                                                                 |
| Administration (vos fiches produits)        | 0 €                                                                                                          | Sveltia CMS                      | Logiciel libre                                                                                                                                                                                                                              |
| E-mails de commande et de contact           | 0 €                                                                                                          | Resend                           | 3 000 e-mails par mois, 100 par jour, soit une cinquantaine de commandes par jour                                                                                                                                                           |
| Lettre d'information                        | 0 € jusqu'à environ 1 000 abonnés (à vérifier)                                                               | Resend                           | Au-delà, offre Pro à 20 $ par mois                                                                                                                                                                                                          |
| Anti-robots, statistiques, adresse contact@ | 0 €                                                                                                          | Cloudflare                       | Sans bandeau de cookies                                                                                                                                                                                                                     |
| Paiement par carte                          | 1,5 % + 0,25 € par paiement (carte européenne) ; 2,5 % carte britannique ; 3,25 % autres cartes (à vérifier) | Stripe, retenu avant le virement | Pas d'abonnement. Exemple : 0,70 € sur une commande de 30 €, vous recevez 29,30 €. Les frais ne sont pas rendus en cas de remboursement                                                                                                     |
| Étiquette Point Relais                      | À partir de 3 € HT environ par colis (à vérifier à l'ouverture)                                              | Mondial Relay, prépayé           | L'offre Start est annoncée sans abonnement ; relire les conditions le jour de l'ouverture                                                                                                                                                   |
| Étiquette Colissimo (domicile)              | Selon le poids (à vérifier)                                                                                  | La Poste                         | Achetée sur laposte.fr quand une commande le demande                                                                                                                                                                                        |
| Médiateur de la consommation                | Adhésion annuelle, variable selon le médiateur                                                               | Le médiateur                     | Obligatoire pour vendre à des particuliers                                                                                                                                                                                                  |
| Compte bancaire                             | Vos frais actuels Hello bank!                                                                                | Hello bank!                      | Stripe verse sur n'importe quel IBAN français. Un compte pro dédié n'est obligatoire en micro-entreprise qu'au-delà de 10 000 € de chiffre d'affaires deux années de suite ; Hello Business coûte 10,90 € HT par mois si vous le choisissez |

Les frais de port réglés par vos clients (4,90 € relais, 6,90 € domicile,
offerts dès 49 €) couvrent tout ou partie des étiquettes.

## 3. Les comptes, qui les ouvre, au nom de qui

| #   | Compte                                         | Sert à                                                     | Ouvert par         | Ce qui vous est demandé                                                      |
| --- | ---------------------------------------------- | ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| 1   | Bitwarden                                      | Garder tous les mots de passe                              | Moi                | Choisir votre mot de passe maître le jour de la remise                       |
| 2   | GitHub « racinesenpartage »                    | Le code du site et vos fiches produits                     | Moi                | Rien                                                                         |
| 3   | Cloudflare                                     | Héberger le site, les formulaires, l'adresse contact@      | Moi                | Rien                                                                         |
| 4   | OVHcloud                                       | Le nom de domaine, au nom de votre entreprise              | Moi                | **Vous** : le moyen de paiement du domaine (ou je le règle et le refacture)  |
| 5   | Resend                                         | Envoyer les e-mails de commande et la lettre d'information | Moi                | Rien                                                                         |
| 6   | Stripe                                         | Encaisser les paiements                                    | Moi, puis vous     | **Vous** : pièce d'identité, date de naissance, IBAN Hello bank!, activation |
| 7   | Mondial Relay « Offre Start »                  | Les étiquettes Point Relais                                | **Vous**, avec moi | Le contrat au nom de votre entreprise, votre carte pour le compte prépayé    |
| 8   | Google (Search Console, fiche d'établissement) | Être trouvée sur Google et sur Maps                        | Moi                | **Vous** : la vérification de la fiche (vidéo des lieux ou courrier)         |
| 9   | Bing Webmaster Tools                           | Être trouvée sur Bing                                      | Moi                | Rien                                                                         |
| 10  | Médiateur de la consommation                   | Obligation légale                                          | **Vous**           | Choisir dans la liste officielle de la CECMC (economie.gouv.fr) et adhérer   |

Déjà à vous : votre Gmail, votre compte Hello bank!, votre Instagram.

## 4. Le rendez-vous de passation

Une heure ensemble, quand le site est prêt :

1. Vous signez la cession de droits (le code et le design du site vous
   appartiennent).
2. Vous choisissez le mot de passe maître du coffre-fort et changez les
   mots de passe des comptes.
3. La double authentification passe sur votre téléphone ; les codes de
   secours sont imprimés et rangés avec vos papiers.
4. Vous vous connectez à l'administration, modifiez un texte, le voyez en
   ligne deux minutes plus tard.
5. Vous recevez le guide de la propriétaire et ce document. Les trente
   jours de corrections offertes commencent.
