# Translation Updates

I have corrected translation issues in Scan Results and Super Scan.

## Changes

### 1. Scan Result Screen (Face, Body, Nutrition)
File: `screens/ScanResultScreen.tsx`
- **Dynamic Values Translated**: Values like "Oval", "Round", "Ectomorph", "High", "Low" are now properly translated into French.
- **Implemented Helper**: Added a `translateValue` helper function to lookup translations for these dynamic fields.

### 2. Super Scan (Condition Card)
File: `components/ConditionCard.tsx`
- **Fixed Hardcoded Strings**: Replaced hardcoded French texts ("Probabilité", "Explication", "Conseil pratique", "Débloquer") with translation keys.
- **Severity Translation**: Added mapping for severity levels ("Faible", "Modérée", "Élevée") to ensure they are handled via the translation system.

### 3. Translation Files
File: `i18n/translations.ts`
- **Added `scan_values`**: Added comprehensive translations for:
    - Face Shapes (Oval, Round, Square...)
    - Body Types (Ectomorph, Mesomorph...)
    - Muscle Mass levels
    - Glycemic Index levels
    - Ingredient Quality levels
    - Severity levels
- **Added `condition_card`**: Added translations for UI labels in the condition card.

## Verification
The app should now display these values in the correct language selected by the user.
