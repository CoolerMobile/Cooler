import Foundation
import UserNotifications

/// rewrites a bridge push with the event it points to
///
/// pushes only carry ids so apple never sees event content, the event is
/// fetched from the bridge with the device event token the app keeps in the
/// shared keychain, and the generic alert stays when that fails
class NotificationService: UNNotificationServiceExtension {
  // keep in sync with src/lib/storage/push-credentials.ts
  // expo-secure-store suffixes the service of items stored without authentication
  private static let credentialsService = "cooler.push:no-auth"
  private static let credentialsKey = "cooler.push.credentials"

  // leaves room for delivery before the system cuts the extension off
  private static let requestTimeout: TimeInterval = 20

  private let lock = NSLock()
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?
  private var task: URLSessionDataTask?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }

    self.contentHandler = contentHandler
    self.content = content

    // anything that is not a readable bridge push keeps its alert
    guard
      let push = BridgePush(userInfo: content.userInfo),
      let credential = Self.credential(for: push.bridgeId),
      let url = URL(string: "\(credential.baseUrl)/v1/push/events/\(push.eventId)")
    else {
      deliver()
      return
    }

    var eventRequest = URLRequest(
      url: url,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: Self.requestTimeout
    )
    eventRequest.setValue("Bearer \(credential.eventToken)", forHTTPHeaderField: "Authorization")

    task = URLSession.shared.dataTask(with: eventRequest) { [weak self] data, response, _ in
      guard let self else { return }

      if let data,
        (response as? HTTPURLResponse)?.statusCode == 200,
        let event = try? JSONDecoder().decode(BridgeEvent.self, from: data)
      {
        self.present(event, in: content)
      }

      self.deliver()
    }
    task?.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    task?.cancel()
    deliver()
  }

  /// swaps the generic alert for the fetched event
  ///
  /// mirrors presentBridgeEvent in src/lib/cooler-cloud/push.ts
  ///
  /// - Parameters:
  ///   - event: fetched bridge event
  ///   - content: notification content to rewrite
  private func present(_ event: BridgeEvent, in content: UNMutableNotificationContent) {
    lock.lock()
    defer { lock.unlock() }

    // already handed over when the system deadline won the race
    guard contentHandler != nil else { return }

    content.title = event.title

    // the resource name leads the body unless the message already names it
    if let name = event.resourceName, !name.isEmpty, !event.message.contains(name) {
      content.body = "\(name): \(event.message)"
    } else {
      content.body = event.message
    }

    // tells the app this alert carries the event, not the placeholder
    var userInfo = content.userInfo
    if var data = userInfo["body"] as? [String: Any] {
      data["presented"] = true
      userInfo["body"] = data
    }
    content.userInfo = userInfo
  }

  /// hands the content to the system exactly once
  private func deliver() {
    lock.lock()
    let contentHandler = self.contentHandler
    let content = self.content
    self.contentHandler = nil
    lock.unlock()

    guard let contentHandler, let content else { return }
    contentHandler(content)
  }

  /// reads the push credential the app stored for a bridge
  ///
  /// - Parameter bridgeId: cloud bridge id the push names
  ///
  /// - Returns: the credential, or nil when this device holds none
  private static func credential(for bridgeId: String) -> PushCredential? {
    let account = Data(credentialsKey.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: credentialsService,
      kSecAttrAccount as String: account,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]

    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
      return nil
    }

    return (try? JSONDecoder().decode([String: PushCredential].self, from: data))?[bridgeId]
  }
}

/// ids a bridge push carries, expo delivers its data under `body`
private struct BridgePush {
  let eventId: String
  let bridgeId: String

  init?(userInfo: [AnyHashable: Any]) {
    guard
      let data = userInfo["body"] as? [String: Any],
      data["type"] as? String == "event.available",
      let eventId = data["eventId"] as? String,
      let bridgeId = data["bridgeId"] as? String,
      // event ids are uuids, anything else never reaches the url
      UUID(uuidString: eventId) != nil
    else {
      return nil
    }

    self.eventId = eventId
    self.bridgeId = bridgeId
  }
}

/// what the device needs to read pushed events from one bridge
private struct PushCredential: Decodable {
  let baseUrl: String
  let eventToken: String
}

/// the event fields a notification shows
private struct BridgeEvent: Decodable {
  let title: String
  let message: String
  let resourceName: String?
}
