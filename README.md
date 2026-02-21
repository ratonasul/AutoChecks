# AutoChecks PWA

A Progressive Web App for tracking vehicle expiry dates (ITP, RCA, Vignette) with manual check flow.

## Features

- Add and manage vehicles with plate, VIN, and notes
- Expandable vehicle cards showing expiry dates with color-coded status
- Manual check flow: open government websites, copy data, enter expiry dates
- Check history storage
- Upcoming reminders (in-app notifications)
- Export data as JSON
- Dark theme
- Installable as PWA on Android and iOS

## Tech Stack

- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS + shadcn/ui
- IndexedDB via Dexie.js
- next-pwa for service worker and offline cache
- Web Notifications API

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
npm start
```

Or deploy to Vercel:

```bash
npm run build
```

## Installing as PWA

1. Open the app in a supported browser (Chrome, Safari, etc.)
2. Look for the "Install" prompt or "Add to Home Screen" option
3. Follow the prompts to install

## Notification Limitations

- **Android**: Background notifications are supported if permission is granted
- **iOS**: Due to iOS restrictions, notifications only work when the app is open. No background scheduled notifications are possible.

The app provides in-app reminders when opened, showing upcoming expiries within 30 days.

## Manual Check Flow

Since PWAs cannot reliably scrape government websites due to CORS and CAPTCHA:

1. Tap "Check ITP/RCA/Vignette" on a vehicle
2. Use "Open Website" to visit the official site in a new tab
3. Copy the plate/VIN using the provided buttons
4. Manually enter the expiry date in dd/mm/yyyy format
5. Save the result

## Data Export

Use the "Export Data" button to download your vehicles and check history as JSON.

## License

MIT
