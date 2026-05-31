# Collatz Quest

A fun single-page Collatz sequence practice app for kids who like big-number maths (principally division and multiplication). It asks for the next number in the \(3n + 1\) sequence, gives gentle hints, awards stars and badges, grows an odd-number discovery tree, and can optionally sync progress to Firebase.

## Features

- Next-number Collatz challenges with parity hints.
- Multiplication/division explanations after correct answers.
- Stars, streaks, badges, and a one-face mood indicator.
- Known-path cards that can append an already discovered route to the current chain.
- Odd-only Collatz discovery tree rooted at 1.
- Safe public demo mode by default: no shared family save is included in the repository.
- Optional Firebase cloud save for a private family profile.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the dev server.

## Build

```bash
npm run check
npm run build
```

The static app is built to `dist/public`.

## Public sharing and cloud save

By default, the app runs in **demo mode**. Progress is in memory only and disappears on refresh. This is intentional for public sharing, so Reddit users cannot write to a shared family profile.

To enable Firebase cloud save for a private deployment:

1. Copy `.env.example` to `.env.local`.
2. Fill in:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_PROFILE_ID=your-private-profile-id
```

Use a non-obvious `VITE_FIREBASE_PROFILE_ID`, not `family`, for a shared family profile you do not want public users to guess.

Firebase setup:

- Enable **Authentication → Anonymous**.
- Enable **Firestore Database**.
- Add a rule for your chosen profile id, for example:

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /collatzProfiles/{profileId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

For a public deployment, prefer leaving Firebase env vars blank unless you intentionally want cloud save.

## Deploy to Firebase Hosting

Install the Firebase CLI and log in:

```bash
npm install -g firebase-tools
firebase login
```

Choose your Firebase project:

```bash
firebase use --add
```

Then build and deploy:

```bash
npm run build
firebase deploy --only hosting
```

## Notes

The app avoids `localStorage`, `sessionStorage`, cookies, and IndexedDB so it works inside restricted hosted iframes. Firebase access uses REST APIs rather than the Firebase browser SDK for the same reason.
