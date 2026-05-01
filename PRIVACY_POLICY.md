# Health Scan Privacy Policy

Public URL target: `https://healthscan.cloud/privacy-policy`

## FR

**Derniere mise a jour : 26 avril 2026**

### 1. Responsable et portee
Health Scan fournit des fonctionnalites de scan photo et de suivi sante. Cette politique couvre l application mobile, la page publique de politique de confidentialite et les services techniques relies a votre compte.

### 2. Donnees collectees
Nous collectons uniquement les categories de donnees necessaires au service :
- Informations de compte : adresse email, nom utilisateur et photo de profil si vous en ajoutez une
- Donnees de scan : photos de visage, corps ou repas, resultats d analyse, scores et historique de scans
- Donnees techniques : identifiant d appareil, informations de session et journaux necessaires a la securite et a l authentification
- Donnees d usage : preferences de langue, etat d abonnement et interactions utiles au fonctionnement du produit

### 3. Camera et photos
La camera est utilisee pour capturer des photos que vous choisissez de soumettre a un scan. Les photos peuvent aussi etre choisies depuis la galerie via le selecteur de photos.

Les images sont televersees de maniere securisee vers notre backend, stockees dans l infrastructure Supabase utilisee par Health Scan, puis transmises a notre infrastructure d analyse accessible via `n8n.basedjew.com` pour produire les resultats affiches dans l application.

### 4. Finalites du traitement
Nous utilisons vos donnees pour :
- executer les scans et generer des resultats d analyse sante par IA
- afficher votre historique et vos scores dans l application
- gerer l authentification, la securite du compte et les abonnements
- ameliorer la fiabilite du service et resoudre les incidents techniques

### 5. Prestataires et partage des donnees
Nous ne vendons pas vos donnees personnelles.

Nous partageons les donnees uniquement avec des prestataires techniques necessaires a la fourniture du service, notamment Supabase pour l authentification, la base de donnees et le stockage, ainsi que notre infrastructure d analyse pour traiter les scans que vous envoyez.

Nous pouvons divulguer certaines donnees si la loi l exige ou pour proteger nos droits et la securite du service.

### 6. Conservation et securite
Les donnees de compte et l historique de scans sont conserves tant que votre compte reste actif ou jusqu a reception d une demande de suppression valide. Les images de scan (visages, silhouettes, photos de plats ou de frigo) sont des donnees sensibles relatives a la sante au sens de l art. 9 du RGPD : nous ne les utilisons que pour produire l analyse demandee, nous ne les partageons avec aucun tiers en dehors des prestataires techniques listes a la section 5, et nous ne les utilisons pas pour entrainer des modeles d intelligence artificielle.

Une routine automatisee verifie chaque heure le stockage et supprime les images orphelines (uploads sans scan associe ou scan annule) au-dela d une periode de tolerance de 24 heures. Lors de la suppression d un compte, l ensemble des scans, des resultats d analyse et des images stockees liees a ce compte sont supprimes en cascade.

Les communications entre l application et nos services utilisent HTTPS. L acces aux donnees est restreint aux besoins du service et du support.

### 7. Vos droits
Selon la legislation applicable, vous pouvez demander :
- l acces a vos donnees
- la rectification de donnees inexactes
- la suppression de votre compte et des donnees associees
- l export de certaines donnees lorsque cela est techniquement possible
- le retrait de votre consentement lorsque ce traitement repose sur votre consentement

### 8. Suppression des donnees
Vous pouvez supprimer un scan individuel depuis votre historique dans l application. La suppression efface immediatement la ligne d analyse et l image associee dans le stockage.

Pour demander la suppression complete de votre compte et de toutes les donnees associees, ecrivez a `privacy@healthscan.cloud` depuis l adresse associee a votre compte. Les scans, resultats et images sont alors purges sous 30 jours.

### 9. Mineurs et mises a jour
Health Scan n est pas destine aux personnes de moins de 16 ans.

Nous pouvons mettre a jour cette politique pour refleter des evolutions legales, techniques ou produit. La date de mise a jour la plus recente est indiquee en haut de cette page.

### 10. Contact
- Confidentialite : `privacy@healthscan.cloud`
- Support : `support@healthscan.cloud`

## EN

**Last updated: April 26, 2026**

### 1. Controller and scope
Health Scan provides photo scan and health tracking features. This policy applies to the mobile app, the public privacy policy page, and the technical services connected to your account.

### 2. Data we collect
We only collect categories of data that are necessary to operate the service:
- Account information: email address, username, and profile photo if you add one
- Scan data: face, body, or food photos, analysis results, scores, and scan history
- Technical data: device identifier, session information, and logs required for security and authentication
- Usage data: language preference, subscription state, and interactions required for product operation

### 3. Camera and photo use
The camera is used to capture photos that you choose to submit for a scan. Photos may also be selected from the gallery when you use the system photo picker.

Images are uploaded securely to our backend, stored in the Supabase infrastructure used by Health Scan, and then sent to our analysis infrastructure reachable via `n8n.basedjew.com` to produce the results shown in the app.

### 4. Why we process data
We use your data to:
- run scans and generate AI health analysis results
- show your history and scores inside the app
- manage authentication, account security, and subscriptions
- improve service reliability and resolve technical incidents

### 5. Service providers and data sharing
We do not sell your personal data.

We only share data with technical providers needed to operate the service, including Supabase for authentication, database, and storage, and our scan analysis infrastructure to process the scans you submit.

We may also disclose certain data if required by law or to protect our rights and service security.

### 6. Retention and security
Account data and scan history are retained while your account remains active or until we receive a valid deletion request. Scan images (faces, bodies, meal or fridge photos) are special-category health data under GDPR art. 9: we use them only to produce the analysis you request, we do not share them with any third party other than the technical providers listed in section 5, and we do not use them to train AI models.

A scheduled job runs hourly to remove orphaned images (uploads that never produced a scan, or scans that were cancelled) after a 24-hour grace period. When an account is deleted, all scans, analysis results, and stored images linked to that account are removed in cascade.

Communications between the app and our services use HTTPS. Access to data is limited to what is required to operate and support the service.

### 7. Your rights
Depending on applicable law, you may request:
- access to your data
- correction of inaccurate data
- deletion of your account and associated data
- export of certain data where technically feasible
- withdrawal of consent where processing depends on consent

### 8. Data deletion
You can delete an individual scan from your history inside the app. Deletion immediately removes the analysis row and its associated image from storage.

To request full account deletion and removal of all associated data, email `privacy@healthscan.cloud` from the address linked to your account. Scans, results, and images are then purged within 30 days.

### 9. Children and updates
Health Scan is not intended for people under 16 years old.

We may update this policy to reflect legal, technical, or product changes. The latest revision date appears at the top of this page.

### 10. Contact
- Privacy: `privacy@healthscan.cloud`
- Support: `support@healthscan.cloud`
