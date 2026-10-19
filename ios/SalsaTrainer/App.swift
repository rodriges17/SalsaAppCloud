import UIKit
import SwiftUI
import AVFoundation

@MainActor enum OrientationControl {
    static var mask: UIInterfaceOrientationMask = .portrait
    static func set(_ landscape: Bool, failure: @escaping (String) -> Void = { _ in }) {
        let previous = mask
        mask = landscape ? .landscape : .portrait
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) else { return }
        scene.windows.forEach { window in
            var controller = window.rootViewController
            while let current = controller {
                current.setNeedsUpdateOfSupportedInterfaceOrientations()
                controller = current.presentedViewController
            }
        }
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
            Task { @MainActor in self.mask = previous; failure(error.localizedDescription) }
        }
    }
}

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        return true
    }
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask { OrientationControl.mask }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self; return config
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var store: FigureStore?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        #if DEBUG
        let testing = ProcessInfo.processInfo.arguments.contains("--ui-testing")
        let testRoot = FileManager.default.temporaryDirectory.appendingPathComponent("ui-test-library")
        if testing { try? FileManager.default.removeItem(at: testRoot) }
        let store = FigureStore(root: testing ? testRoot : nil)
        #else
        let store = FigureStore()
        #endif
        self.store = store
        let window = UIWindow(windowScene: scene)
        window.rootViewController = RootController(rootView: OverviewScreen(store: store).preferredColorScheme(.dark).tint(Palette.lavender))
        window.makeKeyAndVisible(); self.window = window
        #if DEBUG
        if testing && ProcessInfo.processInfo.arguments.contains("--with-videos") {
            window.rootViewController = UIHostingController(rootView: ProgressView("Testvideos …"))
            Task { @MainActor in
                do { try await TestFixtures.seed(testRoot); store.refresh() }
                catch { store.error = error.localizedDescription }
                window.rootViewController = RootController(rootView: OverviewScreen(store: store).preferredColorScheme(.dark).tint(Palette.lavender))
            }
        }
        #endif
    }
    func sceneDidBecomeActive(_ scene: UIScene) { store?.refresh() }
    func sceneWillResignActive(_ scene: UIScene) { UIApplication.shared.isIdleTimerDisabled = false }
}

final class RootController<Content: View>: UIHostingController<Content> {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { OrientationControl.mask }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .portrait }
}
