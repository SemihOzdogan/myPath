import ActivityKit
import CoreLocation
import Foundation
import React

@objc(LiveActivityModule)
final class LiveActivityModule: NSObject, CLLocationManagerDelegate {
  private var activity: Activity<NavigationActivityAttributes>?
  private let locationManager = CLLocationManager()
  private var routeCoordinates: [CLLocationCoordinate2D] = []
  private var routeLengthMeters = 0.0
  private var routeDurationSeconds = 0.0
  private var currentState: NavigationActivityAttributes.ContentState?
  private var lastBackgroundProgress = -1.0

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    locationManager.distanceFilter = 10
    locationManager.pausesLocationUpdatesAutomatically = false
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { true }

  @objc(start:instruction:traveledDistance:remainingDistance:remainingTime:eta:progress:isWalking:hasArrived:routeCoordinates:routeLengthMeters:durationSeconds:resolver:rejecter:)
  func start(
    destination: String,
    instruction: String,
    traveledDistance: String,
    remainingDistance: String,
    remainingTime: String,
    eta: String,
    progress: NSNumber,
    isWalking: Bool,
    hasArrived: Bool,
    routeCoordinates: NSArray,
    routeLengthMeters: NSNumber,
    durationSeconds: NSNumber,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    Task {
      do {
        if let activity {
          await activity.end(using: nil, dismissalPolicy: .immediate)
        }
        let attributes = NavigationActivityAttributes(destination: destination)
        let state = NavigationActivityAttributes.ContentState(
          instruction: instruction,
          traveledDistance: traveledDistance,
          remainingDistance: remainingDistance,
          remainingTime: remainingTime,
          eta: eta,
          progress: progress.doubleValue,
          isWalking: isWalking,
          hasArrived: hasArrived
        )
        self.currentState = state
        self.routeCoordinates = self.coordinates(from: routeCoordinates)
        self.routeLengthMeters = routeLengthMeters.doubleValue
        self.routeDurationSeconds = durationSeconds.doubleValue
        self.lastBackgroundProgress = state.progress
        if #available(iOS 16.2, *) {
          activity = try Activity.request(
            attributes: attributes,
            content: ActivityContent(state: state, staleDate: nil),
            pushType: nil
          )
        } else {
          activity = try Activity.request(
            attributes: attributes,
            contentState: state,
            pushType: nil
          )
        }
        self.startBackgroundLocationUpdates(isWalking: isWalking)
        resolve(activity?.id)
      } catch {
        reject("LIVE_ACTIVITY_START_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(update:traveledDistance:remainingDistance:remainingTime:eta:progress:isWalking:hasArrived:resolver:rejecter:)
  func update(
    instruction: String,
    traveledDistance: String,
    remainingDistance: String,
    remainingTime: String,
    eta: String,
    progress: NSNumber,
    isWalking: Bool,
    hasArrived: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *), let activity else {
      resolve(nil)
      return
    }

    let state = NavigationActivityAttributes.ContentState(
      instruction: instruction,
      traveledDistance: traveledDistance,
      remainingDistance: remainingDistance,
      remainingTime: remainingTime,
      eta: eta,
      progress: progress.doubleValue,
      isWalking: isWalking,
      hasArrived: hasArrived
    )
    currentState = state
    Task {
      await activity.update(using: state)
      resolve(nil)
    }
  }

  @objc(end:rejecter:)
  func end(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *), let activity else {
      resolve(nil)
      return
    }
    Task {
      await activity.end(using: nil, dismissalPolicy: .immediate)
      self.activity = nil
      self.stopBackgroundLocationUpdates()
      self.currentState = nil
      self.routeCoordinates = []
      resolve(nil)
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard manager.authorizationStatus == .authorizedAlways,
          let state = currentState else { return }
    startBackgroundLocationUpdates(isWalking: state.isWalking)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last,
          let state = currentState,
          let activity,
          routeCoordinates.count > 1,
          routeLengthMeters > 0 else { return }

    let nearestIndex = routeCoordinates.indices.min {
      location.distance(from: CLLocation(latitude: routeCoordinates[$0].latitude, longitude: routeCoordinates[$0].longitude))
        < location.distance(from: CLLocation(latitude: routeCoordinates[$1].latitude, longitude: routeCoordinates[$1].longitude))
    } ?? 0
    let routeProgress = routeDistance(to: nearestIndex)
    let progress = min(1, max(0, routeProgress / routeLengthMeters))
    guard abs(progress - lastBackgroundProgress) >= 0.002 else { return }

    lastBackgroundProgress = progress
    let remaining = max(0, routeLengthMeters - routeProgress)
    let remainingSeconds = routeDurationSeconds * (1 - progress)
    let updatedState = NavigationActivityAttributes.ContentState(
      instruction: state.instruction,
      traveledDistance: formatDistance(routeProgress),
      remainingDistance: formatDistance(remaining),
      remainingTime: formatDuration(remainingSeconds),
      eta: arrivalTime(remainingSeconds),
      progress: progress,
      isWalking: state.isWalking,
      hasArrived: progress >= 0.995
    )
    currentState = updatedState
    Task { await activity.update(using: updatedState) }
  }

  private func startBackgroundLocationUpdates(isWalking: Bool) {
    locationManager.activityType = isWalking ? .fitness : .automotiveNavigation
    guard CLLocationManager.authorizationStatus() == .authorizedAlways else {
      locationManager.requestAlwaysAuthorization()
      return
    }
    locationManager.allowsBackgroundLocationUpdates = true
    locationManager.startUpdatingLocation()
  }

  private func stopBackgroundLocationUpdates() {
    locationManager.stopUpdatingLocation()
    locationManager.allowsBackgroundLocationUpdates = false
  }

  private func coordinates(from rawCoordinates: NSArray) -> [CLLocationCoordinate2D] {
    rawCoordinates.compactMap { value in
      guard let pair = value as? [NSNumber], pair.count >= 2 else { return nil }
      return CLLocationCoordinate2D(latitude: pair[1].doubleValue, longitude: pair[0].doubleValue)
    }
  }

  private func routeDistance(to index: Int) -> CLLocationDistance {
    guard index > 0 else { return 0 }
    return (1...index).reduce(0) { distance, pointIndex in
      let start = routeCoordinates[pointIndex - 1]
      let end = routeCoordinates[pointIndex]
      return distance + CLLocation(latitude: start.latitude, longitude: start.longitude)
        .distance(from: CLLocation(latitude: end.latitude, longitude: end.longitude))
    }
  }

  private func formatDistance(_ meters: CLLocationDistance) -> String {
    meters >= 1_000
      ? String(format: "%.1f km", meters / 1_000).replacingOccurrences(of: ".", with: ",")
      : "\(Int(meters.rounded())) m"
  }

  private func formatDuration(_ seconds: TimeInterval) -> String {
    let minutes = max(1, Int((seconds / 60).rounded()))
    let hours = minutes / 60
    return hours > 0 ? "\(hours) sa \(minutes % 60) dk" : "\(minutes) dk"
  }

  private func arrivalTime(_ seconds: TimeInterval) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "tr_TR")
    formatter.dateFormat = "HH:mm"
    return "Varış \(formatter.string(from: Date().addingTimeInterval(seconds)))"
  }
}
