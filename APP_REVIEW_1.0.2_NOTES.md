# SelfLens 1.0.2 Release Notes

Expected iOS build number: 29. Confirm the number reported by EAS before using
these notes in App Store Connect.

## What's New — French

Les scans SelfLens sont de nouveau disponibles. Cette version améliore aussi la
stabilité des connexions au Scanner.

## What's New — English

SelfLens scans are available again. This release also improves Scanner
connection stability.

## App Review Notes

SelfLens 1.0.2 restores the production routes used by the existing scan and
privacy services. It does not introduce a database schema change, a new scan
payload, or a new data-processing purpose.

Suggested review path:

1. Sign in with the review account provided only in App Store Connect.
2. Open Scanner and select a standard scan type.
3. Take a photo or select one with the system photo picker.
4. Complete the scan and open its result from History.
5. Open Fridge Scan and complete a recipe scan.
6. Open Coach, then verify Restore Purchases from the subscription screen.
7. Open the privacy policy from Settings or visit
   https://privacy.selflens.org/privacy-policy/.

Do not add review-account credentials to this repository.

## TestFlight Release Gate

- Cold launch and session restoration.
- Scan type selection, camera, and gallery.
- Complete standard scan, result, and history.
- Fridge Scan and Coach.
- Restore Purchases.
- Privacy-policy link.
- Submit the exact same TestFlight build to review only after this checklist is
  completed on a physical iPhone.
- Keep App Store release set to manual after approval.
