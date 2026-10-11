import AVFoundation
import Foundation
import React

@objc(NavigationSpeechModule)
final class NavigationSpeechModule: NSObject {
  private let synthesizer = AVSpeechSynthesizer()

  @objc
  static func requiresMainQueueSetup() -> Bool { true }

  @objc(speak:resolver:rejecter:)
  func speak(
    text: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      let session = AVAudioSession.sharedInstance()
      do {
        try session.setCategory(
          .playback,
          mode: .voicePrompt,
          options: [.interruptSpokenAudioAndMixWithOthers]
        )
        try session.setActive(true)
      } catch {
        reject("SPEECH_SESSION_FAILED", error.localizedDescription, error)
        return
      }

      let utterance = AVSpeechUtterance(string: text)
      utterance.voice = AVSpeechSynthesisVoice(language: "tr-TR")
      utterance.rate = 0.48
      self.synthesizer.speak(utterance)
      resolve(nil)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      // This stops the current utterance and clears every queued direction now.
      self.synthesizer.stopSpeaking(at: .immediate)
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      resolve(nil)
    }
  }
}
