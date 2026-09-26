# Saha360 – KENT360 Field Operations App

React Native (Expo) application for municipal field staff. **Scheduled for Phase 12.**

## Why it is not a workspace yet

Expo pins exact React / React Native versions that differ from the web app's React release.
Adding it to npm workspaces now would force dependency hoisting conflicts before any mobile
code exists. It will be scaffolded with `create-expo-app` (TypeScript template) and added to
the root `workspaces` list in Phase 12, consuming `@kent360/shared-types` for enums and
permission codes.

## Planned scope

- Bottom tabs: **Görevler · Harita · Bildirimler · Profil**
- Home: greeting, today's task count, tasks sorted by priority and SLA
- Task detail: photo, category, description, address, neighbourhood, mini map, distance, priority, SLA countdown
- Workflow buttons driven by work-order status: _Yol Tarifi · Görevi Kabul Et · Yola Çıktım · Olay Yerindeyim · İşe Başla · İşi Tamamla_
- BEFORE / DURING / AFTER photo capture with device location
- Proximity check before _Olay Yerindeyim_ / _İşe Başla_, with a mock location provider for development
- Session: access token in memory, refresh token in Expo SecureStore
