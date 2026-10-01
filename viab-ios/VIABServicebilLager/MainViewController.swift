import AudioToolbox
import CoreImage
import CoreLocation
import LocalAuthentication
import MapKit
import UIKit
import Vision
import WebKit

final class MainViewController: UIViewController,
                                WKScriptMessageHandler,
                                UIImagePickerControllerDelegate,
                                UINavigationControllerDelegate,
                                CLLocationManagerDelegate {

    private enum CameraMode { case label, product }

    private var webView: WKWebView!
    private let locationManager = CLLocationManager()
    private var waitingForLocation = false
    private var cameraMode: CameraMode?
    private var firstAppearance = true
    private var backgroundAt: Date?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureWebView()
        configureLocation()
        configureLifecycleObservers()
        loadApp()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if firstAppearance {
            firstAppearance = false
            if UserDefaults.standard.bool(forKey: "viab_app_lock") {
                authenticateForAppLock(enforced: true, enableOnSuccess: false)
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "native")
    }

    private func configureWebView() {
        let content = WKUserContentController()
        content.add(self, name: "native")
        content.addUserScript(WKUserScript(
            source: Self.bridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        let config = WKWebViewConfiguration()
        config.userContentController = content
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureLocation() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
    }

    private func configureLifecycleObservers() {
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.backgroundAt = Date() }

        NotificationCenter.default.addObserver(
            forName: UIApplication.willEnterForegroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self,
                  UserDefaults.standard.bool(forKey: "viab_app_lock"),
                  let at = self.backgroundAt,
                  Date().timeIntervalSince(at) >= 60 else { return }
            self.authenticateForAppLock(enforced: true, enableOnSuccess: false)
        }
    }

    private func loadApp() {
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Web") else {
            showNativeAlert("Webbappen saknas i iOS-paketet.")
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "native",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "scanBarcode":
            presentBarcodeScanner(continuous: false)

        case "startContinuousScan":
            presentBarcodeScanner(continuous: true)

        case "scanArticleLabel":
            presentCamera(mode: .label)

        case "captureArticlePhoto":
            presentCamera(mode: .product)

        case "getLocation":
            requestLocation()

        case "playScanFeedback":
            feedback()

        case "openMap":
            if let lat = number(body["lat"]), let lon = number(body["lon"]) { openMap(lat: lat, lon: lon) }

        case "setAppLock":
            let enabled = body["enabled"] as? Bool ?? false
            if enabled {
                authenticateForAppLock(enforced: false, enableOnSuccess: true)
            } else {
                UserDefaults.standard.set(false, forKey: "viab_app_lock")
                setJSLockState(false)
            }

        case "saveTextFile":
            let filename = body["filename"] as? String ?? "VIAB-export.txt"
            let content = body["content"] as? String ?? ""
            saveTextFile(filename: filename, content: content)

        case "printArticleLabel":
            let articleNo = body["articleNo"] as? String ?? ""
            let articleName = body["articleName"] as? String ?? ""
            let barcode = body["barcode"] as? String ?? articleNo
            let packageQty = Int(number(body["packageQty"]) ?? 1)
            shareArticleLabel(articleNo: articleNo, articleName: articleName, barcode: barcode, packageQty: packageQty)

        default:
            break
        }
    }

    private func presentBarcodeScanner(continuous: Bool) {
        let scanner = BarcodeScannerViewController(continuous: continuous) { [weak self] values in
            guard let self else { return }
            if continuous {
                let json = (try? JSONSerialization.data(withJSONObject: values)) ?? Data("[]".utf8)
                let text = String(data: json, encoding: .utf8) ?? "[]"
                self.callJS("window.onNativeFastScan(\(self.jsString(text)))")
            } else if let first = values.first {
                self.callJS("window.onNativeBarcode(\(self.jsString(first)))")
            }
        }
        present(scanner, animated: true)
    }

    private func presentCamera(mode: CameraMode) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            if mode == .label {
                callJS("window.onNativeArticleLabelError(\(jsString("Ingen kamera hittades.")))")
            } else {
                callJS("window.onNativeArticlePhotoError(\(jsString("Ingen kamera hittades.")))")
            }
            return
        }

        cameraMode = mode
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = self
        picker.modalPresentationStyle = .fullScreen
        present(picker, animated: true)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        cameraMode = nil
    }

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        let mode = cameraMode
        cameraMode = nil
        guard let image = info[.originalImage] as? UIImage else {
            picker.dismiss(animated: true)
            return
        }

        picker.dismiss(animated: true) { [weak self] in
            guard let self, let mode else { return }
            switch mode {
            case .label:
                self.analyseLabel(image)
            case .product:
                self.emitProductImage(image)
            }
        }
    }

    private func analyseLabel(_ image: UIImage) {
        guard let cg = normalized(image).cgImage else {
            callJS("window.onNativeArticleLabelError(\(jsString("Etikettbilden kunde inte läsas.")))")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let textRequest = VNRecognizeTextRequest()
            textRequest.recognitionLevel = .accurate
            textRequest.usesLanguageCorrection = false
            textRequest.recognitionLanguages = ["sv-SE", "en-US"]

            let barcodeRequest = VNDetectBarcodesRequest()

            do {
                try VNImageRequestHandler(cgImage: cg, orientation: .up).perform([textRequest, barcodeRequest])

                let lines = (textRequest.results ?? []).compactMap {
                    $0.topCandidates(1).first?.string
                }
                let text = lines.joined(separator: "\n")

                let barcode = (barcodeRequest.results ?? [])
                    .compactMap { $0.payloadStringValue }
                    .first ?? ""

                DispatchQueue.main.async {
                    self.feedback()
                    self.callJS("window.onNativeArticleLabel(\(self.jsString(text)),\(self.jsString(barcode)))")
                }
            } catch {
                DispatchQueue.main.async {
                    self.callJS("window.onNativeArticleLabelError(\(self.jsString("Etiketten kunde inte läsas. Försök igen närmare etiketten.")))")
                }
            }
        }
    }

    private func emitProductImage(_ image: UIImage) {
        let resized = resizedImage(image, maxDimension: 1280)
        guard let data = resized.jpegData(compressionQuality: 0.84) else {
            callJS("window.onNativeArticlePhotoError(\(jsString("Produktbilden kunde inte behandlas.")))")
            return
        }
        callJS("window.onNativeArticlePhoto(\(jsString(data.base64EncodedString())))")
    }

    private func requestLocation() {
        waitingForLocation = true
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            locationManager.requestLocation()
        default:
            waitingForLocation = false
            callJS("window.onNativeLocationError(\(jsString("Platsbehörighet saknas. Aktivera plats för VIAB Servicebil Lager.")))")
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard waitingForLocation else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            waitingForLocation = false
            callJS("window.onNativeLocationError(\(jsString("Platsbehörighet saknas.")))")
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        waitingForLocation = false
        guard let loc = locations.last else {
            callJS("window.onNativeLocationError(\(jsString("Plats kunde inte hämtas.")))")
            return
        }
        callJS("window.onNativeLocation(\(loc.coordinate.latitude),\(loc.coordinate.longitude),\(max(0, loc.horizontalAccuracy)))")
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        waitingForLocation = false
        callJS("window.onNativeLocationError(\(jsString("Plats kunde inte hämtas.")))")
    }

    private func authenticateForAppLock(enforced: Bool, enableOnSuccess: Bool) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            if enableOnSuccess { setJSLockState(false) }
            if enforced { showNativeAlert("Applås kan inte användas på denna iPhone.") }
            return
        }

        context.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: "Lås upp VIAB Servicebil Lager"
        ) { [weak self] success, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if success {
                    if enableOnSuccess {
                        UserDefaults.standard.set(true, forKey: "viab_app_lock")
                        self.setJSLockState(true)
                    }
                } else if enableOnSuccess {
                    UserDefaults.standard.set(false, forKey: "viab_app_lock")
                    self.setJSLockState(false)
                } else if enforced {
                    self.presentLockedOverlay()
                }
            }
        }
    }

    private func setJSLockState(_ enabled: Bool) {
        let value = enabled ? "1" : "0"
        callJS("localStorage.setItem('viab_ios_lock','\(value)');if(window.renderProfile)renderProfile();")
    }

    private func presentLockedOverlay() {
        let alert = UIAlertController(
            title: "VIAB Servicebil Lager är låst",
            message: "Verifiera igen för att fortsätta.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Lås upp", style: .default) { [weak self] _ in
            self?.authenticateForAppLock(enforced: true, enableOnSuccess: false)
        })
        present(alert, animated: true)
    }

    private func saveTextFile(filename: String, content: String) {
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
            try content.data(using: .utf8)?.write(to: url, options: .atomic)
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            present(activity, animated: true)
        } catch {
            showNativeAlert("Filen kunde inte sparas.")
        }
    }

    private func shareArticleLabel(articleNo: String, articleName: String, barcode: String, packageQty: Int) {
        guard let barcodeImage = code128Image(barcode.isEmpty ? articleNo : barcode) else {
            showNativeAlert("Streckkoden kunde inte skapas.")
            return
        }

        let width = 62.0 * 72.0 / 25.4
        let height = 40.0 * 72.0 / 25.4
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)

        let data = renderer.pdfData { context in
            context.beginPage()
            UIColor.white.setFill()
            context.fill(bounds)

            let center = NSMutableParagraphStyle()
            center.alignment = .center

            ("VIAB • ALFA ROBOT" as NSString).draw(
                in: CGRect(x: 8, y: 6, width: width - 16, height: 14),
                withAttributes: [.font: UIFont.boldSystemFont(ofSize: 8), .paragraphStyle: center]
            )
            (articleName as NSString).draw(
                in: CGRect(x: 8, y: 20, width: width - 16, height: 25),
                withAttributes: [.font: UIFont.boldSystemFont(ofSize: 13), .paragraphStyle: center]
            )

            barcodeImage.draw(in: CGRect(x: 12, y: 48, width: width - 24, height: 32))

            (articleNo as NSString).draw(
                in: CGRect(x: 8, y: 82, width: width - 16, height: 13),
                withAttributes: [.font: UIFont.boldSystemFont(ofSize: 9), .paragraphStyle: center]
            )
            ("Förpackning: \(max(1, packageQty)) st" as NSString).draw(
                in: CGRect(x: 8, y: 96, width: width - 16, height: 12),
                withAttributes: [.font: UIFont.systemFont(ofSize: 7), .paragraphStyle: center]
            )
        }

        do {
            let safe = articleNo.replacingOccurrences(of: "/", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("VIAB-\(safe)-etikett.pdf")
            try data.write(to: url, options: .atomic)
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            present(activity, animated: true)
        } catch {
            showNativeAlert("Etiketten kunde inte sparas.")
        }
    }

    private func code128Image(_ text: String) -> UIImage? {
        guard let filter = CIFilter(name: "CICode128BarcodeGenerator"),
              let input = text.data(using: .ascii) else { return nil }
        filter.setValue(input, forKey: "inputMessage")
        filter.setValue(0, forKey: "inputQuietSpace")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 3.2, y: 3.2))
        guard let cg = CIContext().createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    private func openMap(lat: Double, lon: Double) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)))
        item.name = "VIAB lagerhändelse"
        item.openInMaps()
    }

    private func feedback() {
        AudioServicesPlaySystemSound(1108)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func number(_ value: Any?) -> Double? {
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String { return Double(s) }
        return nil
    }

    private func callJS(_ script: String) {
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    private func jsString(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let array = String(data: data, encoding: .utf8),
              array.count >= 2 else { return "\"\"" }
        return String(array.dropFirst().dropLast())
    }

    private func showNativeAlert(_ text: String) {
        let alert = UIAlertController(title: "VIAB", message: text, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func normalized(_ image: UIImage) -> UIImage {
        if image.imageOrientation == .up { return image }
        UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
        image.draw(in: CGRect(origin: .zero, size: image.size))
        let result = UIGraphicsGetImageFromCurrentImageContext() ?? image
        UIGraphicsEndImageContext()
        return result
    }

    private func resizedImage(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let source = normalized(image)
        let size = source.size
        let maxSide = max(size.width, size.height)
        guard maxSide > maxDimension else { return source }
        let scale = maxDimension / maxSide
        let target = CGSize(width: floor(size.width * scale), height: floor(size.height * scale))
        return UIGraphicsImageRenderer(size: target).image { _ in
            source.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var shouldAutorotate: Bool { false }

    private static let bridgeScript = #"""
    (() => {
      const post = (action, data = {}) => {
        try { window.webkit.messageHandlers.native.postMessage(Object.assign({ action }, data)); } catch (_) {}
      };

      window.Android = {
        scanBarcode: () => post('scanBarcode'),
        startContinuousScan: () => post('startContinuousScan'),
        scanArticleLabel: () => post('scanArticleLabel'),
        captureArticlePhoto: () => post('captureArticlePhoto'),
        getLocation: () => post('getLocation'),
        playScanFeedback: () => post('playScanFeedback'),
        openMap: (lat, lon) => post('openMap', { lat, lon }),
        isAppLockEnabled: () => localStorage.getItem('viab_ios_lock') === '1',
        setAppLock: enabled => post('setAppLock', { enabled: !!enabled }),
        saveTextFile: (filename, mimeType, content) => post('saveTextFile', { filename, mimeType, content }),
        printArticleLabel: (articleNo, articleName, barcode, packageQty) =>
          post('printArticleLabel', { articleNo, articleName, barcode, packageQty })
      };
    })();
    """#
}
