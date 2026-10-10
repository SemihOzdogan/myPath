import ActivityKit
import SwiftUI
import WidgetKit

@main
struct NavigationLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NavigationActivityAttributes.self) { context in
      NavigationActivityView(context: context)
        .activityBackgroundTint(context.state.isWalking ? Color(red: 0.02, green: 0.34, blue: 0.25) : Color(red: 0.05, green: 0.12, blue: 0.28))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: context.state.isWalking ? "figure.walk" : "car.fill")
            .foregroundStyle(context.state.isWalking ? .mint : .blue)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.remainingDistance)
            .font(.headline.monospacedDigit())
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.attributes.destination)
            .font(.subheadline.weight(.semibold))
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            Text(context.state.hasArrived ? "Hedefe ulaştınız" : context.state.instruction)
              .lineLimit(1)
            ProgressView(value: context.state.progress)
              .tint(context.state.isWalking ? .mint : .blue)
            HStack {
              Text("Gidilen \(context.state.traveledDistance)")
              Spacer()
              Text("\(context.state.remainingTime) kaldı")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
          }
        }
      } compactLeading: {
        Image(systemName: context.state.isWalking ? "figure.walk" : "car.fill")
          .foregroundStyle(context.state.isWalking ? .mint : .blue)
      } compactTrailing: {
        Text(context.state.remainingDistance)
          .font(.caption2.monospacedDigit())
      } minimal: {
        Image(systemName: context.state.isWalking ? "figure.walk" : "car.fill")
      }
    }
  }
}

@available(iOS 16.1, *)
private struct NavigationActivityView: View {
  let context: ActivityViewContext<NavigationActivityAttributes>

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 14) {
        Image(systemName: context.state.isWalking ? "figure.walk" : "car.fill")
          .font(.title2.weight(.bold))
          .foregroundStyle(context.state.isWalking ? .mint : .blue)
          .frame(width: 32)
        VStack(alignment: .leading, spacing: 4) {
          Text(context.state.hasArrived ? "HEDEFE ULAŞTINIZ" : context.state.isWalking ? "YAYA NAVİGASYONU" : "NAVİGASYON")
            .font(.caption2.weight(.bold))
            .foregroundStyle(context.state.hasArrived ? .mint : .secondary)
          Text(context.state.hasArrived ? "Navigasyon tamamlandı" : context.state.instruction)
            .font(.headline)
            .lineLimit(1)
          Text("Hedef: \(context.attributes.destination)")
            .font(.caption)
            .lineLimit(1)
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      VStack(spacing: 8) {
        ProgressView(value: context.state.progress)
          .tint(context.state.isWalking ? .mint : .blue)
        HStack(spacing: 0) {
          NavigationMetric(title: "GİDİLEN", value: context.state.traveledDistance)
          Spacer()
          NavigationMetric(title: "KALAN", value: context.state.remainingDistance)
          Spacer()
          NavigationMetric(title: "SÜRE", value: context.state.remainingTime)
        }
      }
      .padding(.horizontal, 18)
      .padding(.bottom, context.state.hasArrived ? 8 : 14)
      if context.state.hasArrived {
        HStack(spacing: 8) {
          Image(systemName: "checkmark.circle.fill")
            .foregroundStyle(.mint)
          Text("Hedefe ulaştınız")
            .font(.caption.weight(.semibold))
          Spacer()
          Link(destination: URL(string: "mypath://navigation/end")!) {
            Label("Bitir", systemImage: "xmark")
              .font(.caption.weight(.bold))
              .padding(.horizontal, 10)
              .padding(.vertical, 6)
              .background(Color.white.opacity(0.14), in: Capsule())
          }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 12)
      }
    }
  }
}

@available(iOS 16.1, *)
private struct NavigationMetric: View {
  let title: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.caption2.weight(.bold))
        .foregroundStyle(.secondary)
      Text(value)
        .font(.subheadline.weight(.semibold).monospacedDigit())
    }
  }
}
