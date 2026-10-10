import ActivityKit
import Foundation

@available(iOS 16.1, *)
struct NavigationActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var instruction: String
    var traveledDistance: String
    var remainingDistance: String
    var remainingTime: String
    var eta: String
    var progress: Double
    var isWalking: Bool
    var hasArrived: Bool
  }

  var destination: String
}
