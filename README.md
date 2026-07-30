# Motorly

Motorly is a cross-platform car ownership tracker built with Expo and React Native. One codebase targets iOS, Android, and an installable responsive desktop web app.

## Included in this MVP

- Fuel fill-up log with fuel-bill and dashboard-image attachments
- Automatic mileage calculation from consecutive odometer readings
- Service, maintenance, insurance, and other car expenses
- Dealership/workshop bill attachments
- Mileage, trip-fuel, and annual ownership-cost calculators
- Analytics for mileage, spend, distance, fuel volume, and cost per kilometre
- Multiple vehicles with editable owner and vehicle profiles
- Supabase authentication and per-user cross-device garage sync
- Searchable user profiles and live friend requests
- Community-reported route toll estimates
- Offline-friendly local storage through AsyncStorage

Each account starts with an empty private garage. Changes are saved locally and
synced to that user's Supabase record.

## Supabase setup

Create a Supabase project, add its URL and publishable/anon key to `.env.local`,
then run these files in **Supabase → SQL Editor**:

1. `supabase/social.sql`
2. `supabase/user_garages.sql`
3. `supabase/community_toll_reports.sql`

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=your-publishable-or-anon-key
EXPO_PUBLIC_ORS_API_KEY=your-openrouteservice-key
```

`social.sql` also backfills searchable profiles for existing Auth users and
enables live friendship updates. Never place a Supabase service-role key in an
Expo environment variable.

## Run it

```bash
npm install
npm run web
```

For native development:

```bash
npm run ios
npm run android
```

Create a production desktop web bundle with:

```bash
npm run build:web
```

## Mileage method

For each full-tank entry after the first baseline reading:

`mileage = (current odometer - previous odometer) / current litres filled`

For reliable results, users should fill the tank consistently and record every
fill-up.
