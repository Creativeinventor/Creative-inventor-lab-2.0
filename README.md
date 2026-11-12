# CREATIVE INVENTOR LAB
### Complete File Upload, Storage & Management Portal

CREATIVE INVENTOR LAB is a production-ready, administrator-only cloud file management system built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Firebase** (Authentication, Cloud Storage, and Cloud Firestore).

Designed for engineering labs, inventors, and developers to securely upload, manage, preview, download, and organize files (documents, code, firmware, CAD designs, media, and archives) from both mobile devices and desktop computers.

---

## ⚡ Key Features

- **🔐 Administrator Authentication**:
  - Secure Firebase Authentication with username-to-email mapping (`admin` -> `admin@creativeinventorlab.admin`).
  - Initial setup credentials (`admin` / `123`) with automated provisioning on first boot.
  - In-app password change feature to replace initial credentials before production.
  - Auth state persistence across browser refreshes and protected routes.

- **☁️ Resumable Firebase Cloud Storage**:
  - Native file picker supporting Android, iPhone, Windows, Mac, and Linux.
  - Universal format support: PDF, ZIP, RAR, HEX, BIN, INO, CPP, PY, JS, HTML, MP4, MP3, JPG, PNG, and more.
  - Real-time animated progress bar with percentage, uploaded bytes vs total bytes.
  - Network failure handling with retry options without re-selecting files.
  - Organized cloud structure: `uploads/admin/{timestamp}_{filename}`.

- **📁 Real-time Firestore File Management**:
  - Metadata indexing in Firestore `uploadedFiles` collection.
  - Live real-time syncing (`onSnapshot`).
  - Search files by name or extension in real-time.
  - Sort by newest, oldest, largest, smallest, or alphabetical.
  - Category filters: All, Documents, Images, Code & Data, Hardware/CAD, Archives, Videos, Audio.
  - Grid card view and compact table view.

- **👁️ Responsive Preview & Download**:
  - In-browser interactive preview for images, video player, audio player, PDF viewer, and syntax-styled code/text viewer.
  - Direct download to device.
  - Two-step confirmation deletion that removes files from both Firebase Storage and Firestore.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS, Lucide React icons
- **Backend / Cloud**:
  - **Firebase Authentication** (Administrator login & session management)
  - **Firebase Cloud Storage** (Actual binary file storage with resumable uploads)
  - **Firebase Cloud Firestore** (File metadata indexing & real-time querying)
- **Deployment**: Vercel ready (`vercel.json` SPA routing included) & GitHub export ready

---

## 📋 Environment Variables

Create a `.env.local` file in the project root (copied from `.env.example`):

```bash
# Firebase Project Web Credentials (from Firebase Console)
VITE_FIREBASE_API_KEY="AIzaSyYourFirebaseApiKey"
VITE_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789012"
VITE_FIREBASE_APP_ID="1:123456789012:web:abcdef123456"

# Optional: Admin Email Domain
VITE_ADMIN_EMAIL_DOMAIN="creativeinventorlab.admin"
```

> **Note**: Firebase is initialized automatically using environment variables from `.env.local` locally and Vercel Environment Variables in production. No configuration screens or popups are displayed.

---

## 🔥 Step-by-Step Firebase Setup Guide

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project**, name it `creative-inventor-lab` (or your preferred name), and follow the prompts.
3. In your project overview, click the **Web icon (`</>`)** to register a web app.
4. Copy the `firebaseConfig` keys directly into `.env.local` (or Vercel project settings).

---

### 2. Enable Firebase Authentication
1. In the Firebase Console, go to **Build** → **Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, select **Email/Password**.
4. Enable the first toggle (**Email/Password**) and click **Save**.
5. The application will automatically provision the first administrator (`admin` / `123`) on your first login attempt, or you can add `admin@creativeinventorlab.admin` directly under the **Users** tab with password `123`.

---

### 3. Create Cloud Firestore Database
1. In the Firebase Console, go to **Build** → **Firestore Database**.
2. Click **Create database**.
3. Select your preferred Cloud location and start in **Production mode**.
4. Click **Rules** and apply the rules from `firestore.rules`:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isValidId(id) {
      return id is string && id.size() > 0 && id.size() <= 128;
    }

    match /admins/{adminId} {
      allow read: if isSignedIn() && request.auth.uid == adminId;
      allow create, update: if isSignedIn() && request.auth.uid == adminId;
      allow delete: if false;
    }

    match /uploadedFiles/{fileId} {
      allow read, list: if isSignedIn();
      allow create: if isSignedIn() &&
        isValidId(fileId) &&
        request.resource.data.uploadedBy == request.auth.uid &&
        request.resource.data.fileName is string &&
        request.resource.data.fileName.size() <= 255 &&
        request.resource.data.fileSize is number &&
        request.resource.data.storagePath is string &&
        request.resource.data.downloadURL is string;
      allow update: if isSignedIn() &&
        resource.data.uploadedBy == request.auth.uid;
      allow delete: if isSignedIn();
    }
  }
}
```

---

### 4. Create Firebase Cloud Storage
1. In the Firebase Console, go to **Build** → **Storage**.
2. Click **Get Started** and select your storage bucket location.
3. Go to the **Rules** tab and apply the rules from `storage.rules`:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }

    match /uploads/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        request.resource.size < 500 * 1024 * 1024; // 500MB max per file
      allow delete: if request.auth != null;
    }
  }
}
```

4. Configure CORS if you plan on fetching text files directly from other origins:
   Create `cors.json`:
   ```json
   [
     {
       "origin": ["*"],
       "method": ["GET"],
       "maxAgeSeconds": 3600
     }
   ]
   ```
   Run: `gsutil cors set cors.json gs://<your-storage-bucket>`

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev

# 3. Open browser
http://localhost:3000
```

---

## 🐙 Push to GitHub Instructions

```bash
# 1. Initialize git (if not already done)
git init

# 2. Add all files (.gitignore automatically excludes secrets and node_modules)
git add .

# 3. Commit your code
git commit -m "Initial commit: Creative Inventor Lab production file management portal"

# 4. Link your GitHub repository
git remote add origin https://github.com/your-username/creative-inventor-lab.git
git branch -M main

# 5. Push code
git push -u origin main
```

---

## ▲ Deploying to Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New** → **Project**.
3. Import your GitHub repository `creative-inventor-lab`.
4. In **Project Settings**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand the **Environment Variables** section and add the 6 variables from `.env.local`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
6. Click **Deploy**. Vercel will build and deploy your site with automatic HTTPS and SPA routing via `vercel.json`.

---

## 🔑 Initial Administrator Access

- **Username**: `admin`
- **Password**: `123`
- *Once logged in, click "Change Password" in the top navigation bar to replace it with a strong custom password.*
