import AVFoundation
import AudioToolbox
import UIKit

final class BarcodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let continuous: Bool
    private let completion: ([String]) -> Void

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let statusLabel = UILabel()
    private var codes: [String] = []
    private var lastCode = ""
    private var lastAt = Date.distantPast

    init(continuous: Bool, completion: @escaping ([String]) -> Void) {
        self.continuous = continuous
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureOverlay()
        requestCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        view.bringSubviewToFront(statusLabel)
        if let done = view.viewWithTag(9001) { view.bringSubviewToFront(done) }
        if let close = view.viewWithTag(9002) { view.bringSubviewToFront(close) }
    }

    private func configureOverlay() {
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textColor = .white
        statusLabel.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        statusLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        statusLabel.numberOfLines = 2
        statusLabel.textAlignment = .center
        statusLabel.layer.cornerRadius = 12
        statusLabel.clipsToBounds = true
        statusLabel.text = continuous ? "Snabbskanning • 0 läsningar\nVarje godkänd skanning = +1" : "Rikta kameran mot streckkoden"
        view.addSubview(statusLabel)

        let close = UIButton(type: .system)
        close.tag = 9002
        close.translatesAutoresizingMaskIntoConstraints = false
        close.setTitle("Stäng", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        close.layer.cornerRadius = 12
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        view.addSubview(close)

        NSLayoutConstraint.activate([
            statusLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            statusLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 58),

            close.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 10),
            close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
            close.widthAnchor.constraint(equalToConstant: 88),
            close.heightAnchor.constraint(equalToConstant: 44)
        ])

        if continuous {
            let done = UIButton(type: .system)
            done.tag = 9001
            done.translatesAutoresizingMaskIntoConstraints = false
            done.setTitle("Klar – visa korg", for: .normal)
            done.setTitleColor(.white, for: .normal)
            done.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
            done.backgroundColor = UIColor(red: 0.086, green: 0.541, blue: 0.271, alpha: 1)
            done.layer.cornerRadius = 15
            done.addTarget(self, action: #selector(finishContinuous), for: .touchUpInside)
            view.addSubview(done)
            NSLayoutConstraint.activate([
                done.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
                done.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
                done.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
                done.heightAnchor.constraint(equalToConstant: 54)
            ])
        }
    }

    private func requestCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async { granted ? self?.configureSession() : self?.showDenied() }
            }
        default:
            showDenied()
        }
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video) else { showDenied(); return }
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return }
            session.addInput(input)

            let output = AVCaptureMetadataOutput()
            guard session.canAddOutput(output) else { return }
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = output.availableMetadataObjectTypes

            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            view.layer.insertSublayer(layer, at: 0)
            previewLayer = layer
            view.setNeedsLayout()

            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.session.startRunning()
            }
        } catch {
            showDenied()
        }
    }

    private func showDenied() {
        statusLabel.text = "Kameran kan inte användas. Kontrollera kameraåtkomst i iPhone-inställningarna."
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let object = metadataObjects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first,
              let code = object.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
              !code.isEmpty else { return }

        let now = Date()
        if code == lastCode && now.timeIntervalSince(lastAt) < 0.65 { return }
        lastCode = code
        lastAt = now
        feedback()

        if continuous {
            codes.append(code)
            statusLabel.text = "Snabbskanning • \(codes.count) läsningar\nSenast: \(code)"
        } else {
            finish([code])
        }
    }

    private func feedback() {
        AudioServicesPlaySystemSound(1108)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    @objc private func finishContinuous() { finish(codes) }

    @objc private func cancel() {
        DispatchQueue.global(qos: .utility).async { [weak self] in self?.session.stopRunning() }
        dismiss(animated: true)
    }

    private func finish(_ values: [String]) {
        DispatchQueue.global(qos: .utility).async { [weak self] in self?.session.stopRunning() }
        dismiss(animated: true) { [completion] in completion(values) }
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override var shouldAutorotate: Bool { false }
}
