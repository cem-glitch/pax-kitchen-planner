# VIAB Servicebil Lager – iOS

Native iPhone wrapper for the VIAB Servicebil Lager V5 web application. It uses the same Supabase project, users, stock balances, transaction ledger and administration data as the Android application.

## Included native iOS functions

- Portrait barcode scanner
- Continuous fast scanning (+1 per accepted scan)
- Camera label capture with Apple Vision OCR + barcode detection
- Product photo capture
- GPS capture for stock movements
- Face ID / Touch ID / device passcode app lock
- Maps opening for admin GPS history
- iOS share/save for CSV/JSON exports
- 62 × 40 mm barcode label PDF generation
- Offline queue remains in the shared V5 web application logic

## Build without Apple Developer Program

The project can be built for the iOS Simulator without signing. GitHub Actions verifies this on every change to the iOS branch.

For a real iPhone using a free Apple ID:
1. Open the generated project in Xcode on a Mac.
2. Select the VIABServicebilLager target.
3. Signing & Capabilities → choose your Personal Team.
4. Connect the iPhone and select it as the run destination.
5. Build/Run from Xcode.

A free Personal Team install expires after Apple's development-signing period. A paid Apple Developer membership is required later for TestFlight or normal managed distribution.

## Generate Xcode project

Install XcodeGen on the Mac, then:

    cd viab-ios
    xcodegen generate
    open VIABServicebilLager.xcodeproj
