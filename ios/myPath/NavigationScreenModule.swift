import Foundation
import UIKit
import React

@objc(NavigationScreenModule)
final class NavigationScreenModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool { true }

  @objc(setAwake:resolver:rejecter:)
  func setAwake(
    enabled: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = enabled
      resolve(nil)
    }
  }
}
