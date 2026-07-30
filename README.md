# Motorly

Motorly is a cross-platform car ownership tracker built with Expo and React Native. One codebase targets iOS, Android, and an installable responsive desktop web app.

## Included in this MVP

- Fuel fill-up log with fuel-bill and dashboard-image attachments
- Automatic mileage calculation from consecutive odometer readings
- Service, maintenance, insurance, and other car expenses
- Dealership/workshop bill attachments
- Mileage, trip-fuel, and annual ownership-cost calculators
- Analytics for mileage, spend, distance, fuel volume, and cost per kilometre
- Editable owner and vehicle profile
- Persistent on-device data through AsyncStorage

The project includes sample records so the dashboard is useful immediately. New and edited records are stored locally on the device/browser.

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

For reliable results, users should fill the tank consistently and record every fill-up. Receipt/dashboard OCR, cloud sync, authentication, and multi-vehicle support are natural next production phases.
