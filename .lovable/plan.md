

## Aura Voice Agent MVP — Confirmation d'appels automatisés

### Vue d'ensemble
Un système qui appelle automatiquement les participants d'une campagne (réunion, event), leur joue un message vocal généré par ElevenLabs, et enregistre leur réponse via le clavier du téléphone (DTMF).

---

### 1. Setup des services

**Twilio** (tu n'as pas encore de compte) :
- Créer un compte sur [twilio.com](https://www.twilio.com) (trial gratuit avec ~$15 de crédit)
- Acheter un numéro de téléphone (environ $1/mois)
- On connectera Twilio via le connecteur Lovable intégré

**ElevenLabs** :
- Tu as déjà ta clé API → on la stocke comme secret dans le projet

**Supabase** (Lovable Cloud) :
- Base de données pour les campagnes, participants et réponses
- Edge Functions pour orchestrer les appels

---

### 2. Base de données (3 tables)

- **campaigns** : nom, description, date/heure de la réunion, message vocal (texte), audio_url (fichier généré), statut
- **participants** : lié à une campagne, nom, téléphone, statut de réponse (pending/confirmed/declined/callback)
- **call_logs** : historique des appels (participant, timestamp, durée, réponse DTMF)

---

### 3. Interface utilisateur

**Page Campagnes** :
- Liste des campagnes avec statut (brouillon, en cours, terminée)
- Stats en temps réel : X confirmés / Y refusés / Z en attente

**Création de campagne** :
- Formulaire : nom, date/heure, message vocal (texte libre)
- Ajout de participants (nom + numéro de téléphone)
- Bouton "Générer l'audio" → appelle ElevenLabs, prévisualisation avec player audio
- Bouton "Lancer la campagne" → déclenche les appels

**Détail campagne** :
- Liste des participants avec leur statut (icônes visuelles : ✅ ❌ ⏳ 🔁)
- Player audio du message
- Bouton relancer les "en attente"

---

### 4. Edge Functions (backend)

**generate-campaign-audio** :
- Reçoit le texte du message
- Appelle l'API ElevenLabs → génère un MP3
- Stocke le fichier dans Supabase Storage
- Retourne l'URL audio

**start-campaign-calls** :
- Pour chaque participant "pending" de la campagne
- Déclenche un appel Twilio via le connecteur gateway
- L'appel joue l'audio pré-généré + attend une touche DTMF :
  - **1** = Confirmé
  - **2** = Refusé  
  - **3** = Rappeler plus tard

**twilio-webhook** :
- Reçoit la réponse DTMF de Twilio
- Met à jour le statut du participant dans la DB
- Si "rappeler" → marque pour relance

---

### 5. Flow utilisateur complet

1. Tu crées une campagne "Réunion Produit — Lundi 10h"
2. Tu ajoutes 5 participants avec leurs numéros
3. Tu écris le message : *"Bonjour, ici Aura. Réunion produit lundi à 10h. Appuyez sur 1 pour confirmer, 2 pour refuser, 3 pour être rappelé."*
4. Tu cliques "Générer l'audio" → tu entends la voix ElevenLabs
5. Tu cliques "Lancer" → les 5 personnes sont appelées
6. Les réponses arrivent en temps réel dans ton dashboard

